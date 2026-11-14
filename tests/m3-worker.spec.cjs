const { Pool } = require("pg");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const { EventEmitter } = require("node:events");
const root = "../services/identity-service/src/messaging/";
describe("M3 ownership, snapshot, retry and publisher attempt guarantees", () => {
  it("drains shutdown only once even when Nest repeats the lifecycle hook", async () => {
    const { OutboxWorker } = require(root + "outbox.worker");
    const publisher = {
      ready: true,
      ensure: async () => {},
      publish: async () => {},
      close: jest.fn(async () => {}),
    };
    const worker = new OutboxWorker({ claim: async () => [] }, publisher);
    await worker.onApplicationShutdown();
    await worker.onApplicationShutdown();
    expect(publisher.close).toHaveBeenCalledTimes(1);
  });
  it("bounds inflight drain at 15s and retries an unconfirmed shutdown attempt instead of SENT", async () => {
    jest.useFakeTimers();
    try {
      const { OutboxWorker } = require(root + "outbox.worker");
      const { DeliveryError } = require(root + "confirm.publisher");
      const envelope = JSON.parse(
        fs.readFileSync(
          "shared/contracts/events/fixtures/user-registered.v1.json",
          "utf8",
        ),
      );
      let rejectPublish;
      const publisher = {
        ready: true,
        ensure: async () => {},
        publish: () =>
          new Promise((resolve, reject) => {
            rejectPublish = reject;
          }),
        close: jest.fn(async () => {
          rejectPublish(new DeliveryError("SHUTDOWN"));
        }),
      };
      const repo = {
        claim: jest.fn(async () => [
          {
            event_id: envelope.event_id,
            claim_token: randomUUID(),
            attempt_count: 1,
            envelope,
          },
        ]),
        finish: jest.fn(async () => true),
      };
      const worker = new OutboxWorker(repo, publisher);
      const work = worker.runOnce();
      await jest.advanceTimersByTimeAsync(0);
      const stop = worker.onApplicationShutdown();
      await jest.advanceTimersByTimeAsync(14999);
      expect(publisher.close).not.toHaveBeenCalled();
      await jest.advanceTimersByTimeAsync(1);
      await stop;
      await work;
      expect(repo.finish.mock.calls[0][1]).toBe("PENDING");
      await worker.onApplicationShutdown();
      expect(publisher.close).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });
  const admin = new Pool({ connectionString: process.env.DATABASE_URL });
  const name = "m3_unit_" + randomUUID().replaceAll("-", "");
  let db;
  beforeAll(async () => {
    await admin.query(`CREATE DATABASE "${name}"`);
    const url = new URL(process.env.DATABASE_URL);
    url.pathname = "/" + name;
    db = new Pool({ connectionString: url.toString() });
    for (const dir of fs
      .readdirSync("services/identity-service/prisma/migrations")
      .filter((x) => /^\d/.test(x))
      .sort())
      await db.query(
        fs.readFileSync(
          `services/identity-service/prisma/migrations/${dir}/migration.sql`,
          "utf8",
        ),
      );
  });
  afterAll(async () => {
    await db?.end();
    for (let n = 0; n < 100; n++) {
      if (
        Number(
          (
            await admin.query(
              "SELECT count(*) FROM pg_stat_activity WHERE datname=$1",
              [name],
            )
          ).rows[0].count,
        ) === 0
      )
        break;
      await new Promise((r) => setTimeout(r, 10));
    }
    await admin.query(`DROP DATABASE "${name}"`);
    await admin.end();
  });
  async function event(extra = {}) {
    const body = {
      ...JSON.parse(
        fs.readFileSync(
          "shared/contracts/events/fixtures/user-registered.v1.json",
          "utf8",
        ),
      ),
      event_id: randomUUID(),
      ...extra,
    };
    await db.query(
      "INSERT INTO outbox_events(event_id,event_type,version,occurred_at,aggregate_type,aggregate_id,producer,payload) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
      [
        body.event_id,
        body.event_type,
        body.version,
        body.occurred_at,
        body.aggregate_type,
        body.aggregate_id,
        body.producer,
        body.payload,
      ],
    );
    return body;
  }
  it("claims once across workers, reclaims crash leases and fences old owner", async () => {
    const { OutboxRepository } = require(root + "outbox.repository");
    const repo = new OutboxRepository(db);
    const body = await event({ occurred_at: "2026-11-14T00:00:00.123456Z" });
    const batches = await Promise.all([
      repo.claim(10, 60000),
      repo.claim(10, 60000),
    ]);
    const rows = batches.flat();
    expect(rows).toHaveLength(1);
    const old = rows[0];
    expect(old.envelope).toEqual(body);
    await db.query(
      "UPDATE outbox_events SET lease_until=clock_timestamp()-interval '1 second' WHERE event_id=$1",
      [body.event_id],
    );
    const [fresh] = await repo.claim(10, 60000);
    expect(fresh.claim_token).not.toBe(old.claim_token);
    expect(await repo.finish(old, "SENT", null)).toBe(false);
    expect(await repo.finish(fresh, "SENT", null)).toBe(true);
    expect(
      (
        await db.query(
          "SELECT attempt_count,status FROM outbox_events WHERE event_id=$1",
          [body.event_id],
        )
      ).rows[0],
    ).toEqual({ attempt_count: 2, status: "SENT" });
  });
  it("parks invalid snapshots, retains them, dry-runs and audits replay; exhaustion never SENT", async () => {
    const { OutboxRepository } = require(root + "outbox.repository");
    const { OutboxWorker } = require(root + "outbox.worker");
    const repo = new OutboxRepository(db);
    const body = await event({ payload: { invalid: true } });
    const publisher = {
      ready: true,
      ensure: async () => {},
      publish: jest.fn(),
      close: async () => {},
    };
    const worker = new OutboxWorker(repo, publisher);
    await worker.runOnce();
    expect(publisher.publish).not.toHaveBeenCalled();
    expect(
      (
        await db.query(
          "SELECT status,payload FROM outbox_events WHERE event_id=$1",
          [body.event_id],
        )
      ).rows[0],
    ).toEqual({ status: "PARKED", payload: { invalid: true } });
    expect(
      await repo.replay(body.event_id, "synthetic investigation", false),
    ).toBe(true);
    expect(
      (
        await db.query("SELECT status FROM outbox_events WHERE event_id=$1", [
          body.event_id,
        ])
      ).rows[0].status,
    ).toBe("PARKED");
    expect(await repo.replay(body.event_id, "synthetic replay", true)).toBe(
      true,
    );
    expect(
      (await db.query("SELECT count(*) FROM outbox_replays")).rows[0].count,
    ).toBe("1");
    await worker.runOnce();
    await db.query(
      "UPDATE outbox_events SET status='PENDING',attempt_count=20 WHERE event_id=$1",
      [body.event_id],
    );
    expect(await repo.claim(10, 60000)).toHaveLength(0);
    expect(
      (
        await db.query("SELECT status FROM outbox_events WHERE event_id=$1", [
          body.event_id,
        ])
      ).rows[0].status,
    ).toBe("PARKED");
  });
  it("DB finalize failure after confirm retains recoverable event and retries same ID", async () => {
    const { OutboxRepository } = require(root + "outbox.repository");
    const { OutboxWorker } = require(root + "outbox.worker");
    const repo = new OutboxRepository(db);
    const body = await event();
    const publish = jest.fn(async () => {});
    const original = repo.finish.bind(repo);
    repo.finish = jest.fn(async () => {
      throw Error("synthetic DB failure");
    });
    const worker = new OutboxWorker(repo, {
      ready: true,
      ensure: async () => {},
      publish,
      close: async () => {},
    });
    await worker.runOnce();
    expect(
      (
        await db.query("SELECT status FROM outbox_events WHERE event_id=$1", [
          body.event_id,
        ])
      ).rows[0].status,
    ).toBe("PROCESSING");
    await db.query(
      "UPDATE outbox_events SET lease_until=clock_timestamp()-interval '1 second' WHERE event_id=$1",
      [body.event_id],
    );
    repo.finish = original;
    await worker.runOnce();
    expect(publish.mock.calls.map((c) => c[0].envelope.event_id)).toEqual([
      body.event_id,
      body.event_id,
    ]);
  });
  it("executes replay CLI dry-run/apply against PostgreSQL and parks exhausted valid delivery without deletion", async () => {
    const { replayCli } = require(root + "replay");
    const { OutboxRepository } = require(root + "outbox.repository");
    const { OutboxWorker } = require(root + "outbox.worker");
    const { DeliveryError } = require(root + "confirm.publisher");
    await expect(replayCli([], undefined)).rejects.toThrow();
    await expect(
      replayCli(
        [randomUUID(), "reason", "--wrong"],
        db.options.connectionString,
      ),
    ).rejects.toThrow();
    const body = await event();
    await db.query(
      "UPDATE outbox_events SET status='PARKED',parked_at=clock_timestamp() WHERE event_id=$1",
      [body.event_id],
    );
    expect(
      await replayCli(
        [body.event_id, "synthetic dry-run"],
        db.options.connectionString,
      ),
    ).toEqual({ eligible: true, applied: false });
    expect(
      await replayCli(
        [body.event_id, "synthetic approved retry", "--apply"],
        db.options.connectionString,
      ),
    ).toEqual({ eligible: true, applied: true });
    await db.query(
      "UPDATE outbox_events SET attempt_count=19 WHERE event_id=$1",
      [body.event_id],
    );
    const publisher = {
      ready: true,
      ensure: async () => {},
      publish: async () => {
        throw new DeliveryError("NACK_OR_CLOSED");
      },
      close: async () => {},
    };
    await new OutboxWorker(new OutboxRepository(db), publisher).runOnce();
    expect(
      (
        await db.query(
          "SELECT status,attempt_count,payload FROM outbox_events WHERE event_id=$1",
          [body.event_id],
        )
      ).rows[0],
    ).toEqual({ status: "PARKED", attempt_count: 20, payload: body.payload });
    expect(
      (
        await db.query(
          "SELECT count(*) FROM outbox_replays WHERE event_id=$1",
          [body.event_id],
        )
      ).rows[0].count,
    ).toBe("1");
  });
  function transport() {
    const channel = new EventEmitter();
    channel.publish = jest.fn(() => true);
    channel.close = jest.fn(async () => {});
    const connection = new EventEmitter();
    connection.close = jest.fn(async () => {});
    return { channel, connection };
  }
  it("isolates concurrent return+ACK from successful ACK and retries same event with different token", async () => {
    const { ConfirmPublisher } = require(root + "confirm.publisher");
    const p = new ConfirmPublisher("amqp://synthetic");
    const t = transport();
    p.attach(t.connection, t.channel);
    const envelope = JSON.parse(
      fs.readFileSync(
        "shared/contracts/events/fixtures/user-registered.v1.json",
        "utf8",
      ),
    );
    const a = { envelope, claim_token: randomUUID() },
      b = { envelope, claim_token: randomUUID() };
    const pa = p.publish(a).catch((e) => e.code),
      pb = p.publish(b);
    const calls = t.channel.publish.mock.calls;
    t.channel.emit("return", {
      properties: {
        messageId: envelope.event_id,
        headers: { "x-publish-attempt-id": a.claim_token },
      },
    });
    calls[0][4](null);
    calls[1][4](null);
    expect(await pa).toBe("RETURNED");
    await expect(pb).resolves.toBeUndefined();
    await p.close();
  });
  it.each(["nack", "channel", "connection", "timeout", "unknown-return"])(
    "fails %s without successful publish (client-injected fault)",
    async (fault) => {
      const { ConfirmPublisher } = require(root + "confirm.publisher");
      const p = new ConfirmPublisher("amqp://synthetic", 20);
      const t = transport();
      p.attach(t.connection, t.channel);
      const envelope = JSON.parse(
        fs.readFileSync(
          "shared/contracts/events/fixtures/user-registered.v1.json",
          "utf8",
        ),
      );
      const pending = p
        .publish({ envelope, claim_token: randomUUID() })
        .catch((e) => e.code);
      if (fault === "nack")
        t.channel.publish.mock.calls[0][4](Error("message nacked"));
      if (fault === "channel") t.channel.emit("error", Error("synthetic"));
      if (fault === "connection") t.connection.emit("close");
      if (fault === "unknown-return")
        t.channel.emit("return", {
          properties: {
            messageId: envelope.event_id,
            headers: { "x-publish-attempt-id": randomUUID() },
          },
        });
      expect(await pending).not.toBeUndefined();
      await p.close();
    },
  );
  it("honors backpressure/drain, blocked/unblocked and fences callbacks from an old channel", async () => {
    const { ConfirmPublisher } = require(root + "confirm.publisher");
    const p = new ConfirmPublisher("amqp://synthetic", 200);
    const first = transport();
    p.attach(first.connection, first.channel);
    first.channel.publish.mockImplementation(() => false);
    const envelope = JSON.parse(
      fs.readFileSync(
        "shared/contracts/events/fixtures/user-registered.v1.json",
        "utf8",
      ),
    );
    const a = p.publish({ envelope, claim_token: randomUUID() });
    first.channel.publish.mock.calls[0][4](null);
    await a;
    expect(p.ready).toBe(false);
    const b = p.publish({ envelope, claim_token: randomUUID() });
    expect(first.channel.publish).toHaveBeenCalledTimes(1);
    first.channel.emit("drain");
    await new Promise((r) => setTimeout(r, 10));
    expect(first.channel.publish).toHaveBeenCalledTimes(2);
    first.channel.publish.mock.calls[1][4](null);
    await b;
    first.channel.emit("drain");
    first.connection.emit("blocked");
    expect(p.ready).toBe(false);
    first.connection.emit("unblocked");
    expect(p.ready).toBe(true);
    const c = p
      .publish({ envelope, claim_token: randomUUID() })
      .catch((e) => e.code);
    first.channel.emit("close");
    expect(await c).toBe("CHANNEL_CLOSED");
    const next = transport();
    p.attach(next.connection, next.channel);
    const d = p.publish({ envelope, claim_token: randomUUID() });
    first.channel.emit("return", { properties: {} });
    first.channel.publish.mock.calls[2][4](null);
    expect(p.ready).toBe(true);
    next.channel.publish.mock.calls[0][4](null);
    await d;
    await p.close();
    await expect(p.ensure()).rejects.toMatchObject({ code: "SHUTDOWN" });
  });
  it("validates config/schema/replay bounds and controls polling/shutdown without overlapping claims", async () => {
    const { workerConfig } = require(root + "config");
    expect(() => workerConfig({})).toThrow();
    expect(() => workerConfig({ DATABASE_URL: "http://bad" })).toThrow();
    expect(() => workerConfig({ DATABASE_URL: "postgres://db/x" })).toThrow();
    expect(() =>
      workerConfig({
        DATABASE_URL: "postgres://db/x",
        RABBITMQ_URL: "http://bad",
      }),
    ).toThrow();
    expect(
      workerConfig({
        DATABASE_URL: "postgres://db/x",
        RABBITMQ_USER: "user",
        RABBITMQ_PASSWORD: "a:@/",
      }).rabbitUrl,
    ).toContain("heartbeat=10");
    const { validEnvelope } = require(root + "event-contract");
    const envelope = JSON.parse(
      fs.readFileSync(
        "shared/contracts/events/fixtures/membership-changed.v1.json",
        "utf8",
      ),
    );
    expect(validEnvelope(envelope)).toBe(true);
    expect(validEnvelope({ ...envelope, version: 2 })).toBe(false);
    envelope.payload.roles[0].resource_id = randomUUID();
    expect(validEnvelope(envelope)).toBe(false);
    const { OutboxRepository } = require(root + "outbox.repository");
    const repo = new OutboxRepository(db);
    await expect(repo.claim(11)).rejects.toThrow();
    await expect(
      repo.finish({}, "PENDING", "credential-with-value"),
    ).rejects.toThrow();
    await expect(
      repo.finish({}, "PENDING", "ERROR", Infinity),
    ).rejects.toThrow();
    await expect(repo.replay("bad", "")).rejects.toThrow();
    expect(await repo.replay(randomUUID(), "not parked")).toBe(false);
    const { OutboxWorker, retryDelay } = require(root + "outbox.worker");
    expect(retryDelay(1, () => 0)).toBe(500);
    expect(retryDelay(100, () => 1)).toBe(300000);
    let release;
    const pending = new Promise((resolve) => {
      release = resolve;
    });
    const fakeRepo = {
      claim: jest.fn(async () => {
        await pending;
        return [];
      }),
    };
    const pub = {
      ready: true,
      ensure: jest.fn(async () => {}),
      publish: jest.fn(),
      close: jest.fn(async () => {}),
    };
    const worker = new OutboxWorker(fakeRepo, pub);
    const a = worker.runOnce(),
      b = worker.runOnce();
    await new Promise((r) => setTimeout(r, 1));
    expect(fakeRepo.claim).toHaveBeenCalledTimes(1);
    release();
    await Promise.all([a, b]);
    await worker.onApplicationShutdown();
    await worker.runOnce();
    expect(fakeRepo.claim).toHaveBeenCalledTimes(1);
    const timerWorker = new OutboxWorker(
      { claim: jest.fn() },
      {
        ...pub,
        ensure: async () => {
          throw Error("synthetic connection");
        },
      },
    );
    timerWorker.start();
    await new Promise((r) => setTimeout(r, 1));
    await timerWorker.onApplicationShutdown();
  });
});
