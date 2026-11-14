import {
  connect,
  type ChannelModel,
  type ConfirmChannel,
  type Message,
} from "amqplib";
import { EXCHANGE, QUEUE, ROUTES } from "./event-contract";
import type { Claim } from "./outbox.repository";

export class DeliveryError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
interface Attempt {
  eventId: string;
  returned: boolean;
  settle: (error?: DeliveryError) => void;
}
export class ConfirmPublisher {
  private connection?: ChannelModel;
  private channel?: ConfirmChannel;
  private generation = 0;
  private attempts = new Map<string, Attempt>();
  private blocked = false;
  private writable = true;
  private connecting?: Promise<void>;
  private closed = false;
  constructor(
    private readonly url: string,
    private readonly confirmMs = 10000,
  ) {}
  get ready() {
    return !!this.channel && !this.blocked && this.writable && !this.closed;
  }

  async ensure(): Promise<void> {
    if (this.closed) throw new DeliveryError("SHUTDOWN");
    if (this.connecting) return this.connecting;
    if (this.channel) return;
    const operation = this.open();
    this.connecting = operation;
    try {
      await operation;
    } finally {
      if (this.connecting === operation) this.connecting = undefined;
    }
  }
  private async open() {
    // setup timeout closes this generation; late RPC completion cannot resurrect it.
    let connection: ChannelModel | undefined;
    let expired = false;
    const timer = setTimeout(() => {
      expired = true;
      if (connection) this.invalidate("SETUP_TIMEOUT");
    }, 5000);
    try {
      const url = new URL(this.url);
      url.searchParams.set("heartbeat", "10");
      connection = await connect(url.toString(), { timeout: 5000 });
      connection.on("error", () => {});
      if (expired || this.closed) {
        await connection.close();
        throw new DeliveryError("SETUP_TIMEOUT");
      }
      this.connection = connection;
      connection.on("close", () => {
        if (this.connection === connection)
          this.invalidate("CONNECTION_CLOSED");
      });
      const channel = await connection.createConfirmChannel();
      this.attach(connection, channel);
      await channel.assertExchange(EXCHANGE, "topic", {
        durable: true,
        autoDelete: false,
      });
      await channel.assertQueue(QUEUE, {
        durable: true,
        exclusive: false,
        autoDelete: false,
        arguments: { "x-queue-type": "classic" },
      });
      for (const route of Object.values(ROUTES))
        await channel.bindQueue(QUEUE, EXCHANGE, route);
      if (expired || this.closed || this.channel !== channel)
        throw new DeliveryError("SETUP_FAILED");
    } catch (e) {
      this.invalidate("CONNECT_FAILED");
      if (connection) void connection.close().catch(() => {});
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Bound per channel generation; exposed for transport fault tests. */
  attach(connection: ChannelModel, channel: ConfirmChannel) {
    this.connection = connection;
    this.channel = channel;
    this.blocked = false;
    this.writable = true;
    const generation = ++this.generation;
    const current = () => generation === this.generation;
    const fail = (code: string) => {
      if (current()) this.invalidate(code);
    };
    channel.on("return", (msg: Message) => {
      if (!current()) return;
      const token = msg.properties.headers?.["x-publish-attempt-id"];
      const attempt =
        typeof token === "string" ? this.attempts.get(token) : undefined;
      if (!attempt || attempt.eventId !== msg.properties.messageId) {
        fail("RETURN_CORRELATION");
        return;
      }
      // Must remain synchronous: basic.return precedes publisher confirm.
      attempt.returned = true;
    });
    channel.on("error", () => fail("CHANNEL_ERROR"));
    channel.on("close", () => fail("CHANNEL_CLOSED"));
    channel.on("handler-error", () => fail("HANDLER_ERROR"));
    channel.on("drain", () => {
      if (current()) this.writable = true;
    });
    connection.on("error", () => fail("CONNECTION_ERROR"));
    connection.on("close", () => fail("CONNECTION_CLOSED"));
    connection.on("handler-error", () => fail("HANDLER_ERROR"));
    connection.on("blocked", () => {
      if (current()) this.blocked = true;
    });
    connection.on("unblocked", () => {
      if (current()) this.blocked = false;
    });
  }

  async publish(claim: Claim): Promise<void> {
    const deadline = Date.now() + this.confirmMs;
    while (this.channel && !this.ready && !this.closed && Date.now() < deadline)
      await new Promise((r) => setTimeout(r, 5));
    const channel = this.channel;
    if (!channel || !this.ready) throw new DeliveryError("NOT_READY");
    const generation = this.generation;
    if (this.attempts.has(claim.claim_token))
      throw new DeliveryError("DUPLICATE_ATTEMPT");
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => {
          if (generation === this.generation)
            this.invalidate("CONFIRM_TIMEOUT");
        },
        Math.max(1, deadline - Date.now()),
      );
      const attempt: Attempt = {
        eventId: claim.envelope.event_id,
        returned: false,
        settle: (error) => {
          if (this.attempts.get(claim.claim_token) !== attempt) return;
          clearTimeout(timer);
          this.attempts.delete(claim.claim_token);
          if (error) reject(error);
          else resolve();
        },
      };
      this.attempts.set(claim.claim_token, attempt);
      try {
        const envelope = claim.envelope;
        this.writable = channel.publish(
          EXCHANGE,
          ROUTES[envelope.event_type],
          Buffer.from(JSON.stringify(envelope)),
          {
            messageId: envelope.event_id,
            contentType: "application/json",
            contentEncoding: "utf-8",
            persistent: true,
            mandatory: true,
            type: envelope.event_type,
            appId: "identity-service",
            headers: {
              schema_version: envelope.version,
              "x-publish-attempt-id": claim.claim_token,
            },
          },
          (error) => {
            if (generation !== this.generation) return;
            attempt.settle(
              error
                ? new DeliveryError("NACK_OR_CLOSED")
                : attempt.returned
                  ? new DeliveryError("RETURNED")
                  : undefined,
            );
          },
        );
      } catch {
        this.invalidate("PUBLISH_ERROR");
      }
    });
  }
  private invalidate(code: string) {
    ++this.generation;
    const channel = this.channel,
      connection = this.connection;
    this.channel = undefined;
    this.connection = undefined;
    for (const attempt of this.attempts.values())
      attempt.settle(new DeliveryError(code));
    if (channel) void channel.close().catch(() => {});
    if (connection) void connection.close().catch(() => {});
  }
  async close() {
    this.closed = true;
    this.invalidate("SHUTDOWN");
  }
}
