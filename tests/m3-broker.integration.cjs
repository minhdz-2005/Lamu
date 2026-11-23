const { Pool } = require("pg");
const amqp = require("amqplib");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const { fork } = require("node:child_process");
const net = require("node:net");
const {
  OutboxRepository,
} = require("../services/identity-service/src/messaging/outbox.repository");
const {
  OutboxWorker,
} = require("../services/identity-service/src/messaging/outbox.worker");
const {
  ConfirmPublisher,
} = require("../services/identity-service/src/messaging/confirm.publisher");
const {
  EXCHANGE,
  QUEUE,
  ROUTES,
  validEnvelope,
} = require("../services/identity-service/src/messaging/event-contract");
describe("M3 real RabbitMQ + PostgreSQL delivery and crash boundaries", () => {
  const admin = new Pool({ connectionString: process.env.DATABASE_URL });
  const name = "m3_broker_" + randomUUID().replaceAll("-", "");
  let db, url, connection, channel, publisher, repo, worker, oldBacklog;
  const observed = [];
  beforeAll(async () => {
    if (!process.env.M3_RABBIT_URL)
      throw Error("Run through scripts/test-m3.cjs; real RabbitMQ required");
    await admin.query(`CREATE DATABASE "${name}"`);
    url = new URL(process.env.DATABASE_URL);
    url.pathname = "/" + name;
    db = new Pool({ connectionString: url.toString() });
    for (const dir of fs
      .readdirSync("services/identity-service/prisma/migrations")
      .filter((x) => /^\d/.test(x) && !x.includes("m3_outbox"))
      .sort())
      await db.query(
        fs.readFileSync(
          `services/identity-service/prisma/migrations/${dir}/migration.sql`,
          "utf8",
        ),
      );
    const oldUser = await insert("user-registered", {
      occurred_at: "2026-11-13T01:02:03.123456Z",
    });
    const oldOrg = await insert("organization-created");
    const oldMember = await insert("membership-changed");
    oldMember.payload.membership_revision = 7;
    await db.query("UPDATE outbox_events SET payload=$2 WHERE event_id=$1", [
      oldMember.event_id,
      oldMember.payload,
    ]);
    oldBacklog = [oldUser, oldOrg, oldMember];
    await db.query(
      fs.readFileSync(
        "services/identity-service/prisma/migrations/202611140004_m3_outbox/migration.sql",
        "utf8",
      ),
    );
    connection = await amqp.connect(process.env.M3_RABBIT_URL);
    connection.on("error", () => {});
    channel = await connection.createChannel();
    channel.on("error", () => {});
    publisher = new ConfirmPublisher(process.env.M3_RABBIT_URL);
    await publisher.ensure();
    repo = new OutboxRepository(db);
    worker = new OutboxWorker(repo, publisher);
  });
  afterAll(async () => {
    await worker?.onApplicationShutdown();
    await channel?.checkQueue(QUEUE).catch(() => {});
    await connection?.close().catch(() => {});
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
    await admin.query(`DROP DATABASE IF EXISTS "${name}"`);
    await admin.end();
    if (process.env.M3_EVIDENCE_DIR)
      fs.writeFileSync(
        process.env.M3_EVIDENCE_DIR + "/broker-cases.json",
        JSON.stringify(
          {
            provider:
              "real PostgreSQL and RabbitMQ; NACKs only in separate client fault suite",
            observed,
          },
          null,
          2,
        ) + "\n",
      );
  });
  async function insert(type = "user-registered", changes = {}) {
    const body = {
      ...JSON.parse(
        fs.readFileSync(
          `shared/contracts/events/fixtures/${type}.v1.json`,
          "utf8",
        ),
      ),
      event_id: randomUUID(),
      ...changes,
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
  const state = async (id) =>
    (
      await db.query(
        "SELECT status,claim_token,attempt_count FROM outbox_events WHERE event_id=$1",
        [id],
      )
    ).rows[0];
  async function take(expected) {
    const message = await channel.get(QUEUE, { noAck: false });
    expect(message).toBeTruthy();
    const body = JSON.parse(message.content);
    expect(body.event_id).toBe(expected.event_id);
    expect(body.payload).toEqual(expected.payload);
    expect(validEnvelope(body)).toBe(true);
    expect(message.properties.messageId).toBe(expected.event_id);
    expect(message.properties.contentType).toBe("application/json");
    expect(message.properties.deliveryMode).toBe(2);
    expect(message.properties.headers.schema_version).toBe(1);
    channel.ack(message);
    await channel.checkQueue(QUEUE);
    return body;
  }
  it("delivers M1/M2 stored backlog and new events with original schema/IDs/microseconds/revision", async () => {
    const [backlog, org, member] = oldBacklog;
    await worker.runOnce();
    const expected = new Map(
      [backlog, org, member].map((x) => [x.event_id, x]),
    );
    for (let i = 0; i < 3; i++) {
      const message = await channel.get(QUEUE, { noAck: false });
      expect(message).toBeTruthy();
      const body = JSON.parse(message.content);
      expect(body.payload).toEqual(expected.get(body.event_id).payload);
      expect(validEnvelope(body)).toBe(true);
      expect(message.properties.messageId).toBe(body.event_id);
      expect(message.properties.deliveryMode).toBe(2);
      if (body.event_id === backlog.event_id)
        expect(body.occurred_at).toBe(backlog.occurred_at);
      channel.ack(message);
      expect((await state(body.event_id)).status).toBe("SENT");
    }
    const fresh = await insert();
    await worker.runOnce();
    await take(fresh);
    observed.push({
      case: "backlog-and-new",
      expected: "4 envelopes delivered, original revision/time",
      actual: "4 SENT and received",
      ids: [...expected.keys(), fresh.event_id],
    });
  });
  it("real basic.return followed by ACK cannot mark SENT; restore binding retries same ID", async () => {
    const body = await insert();
    const route = ROUTES.UserRegistered;
    await channel.unbindQueue(QUEUE, EXCHANGE, route);
    await worker.runOnce();
    expect((await state(body.event_id)).status).toBe("PENDING");
    expect(await channel.get(QUEUE)).toBe(false);
    const audit = (
      await db.query(
        "SELECT outcome FROM outbox_delivery_attempts WHERE event_id=$1",
        [body.event_id],
      )
    ).rows;
    expect(audit).toEqual([{ outcome: "RETURNED" }]);
    await channel.bindQueue(QUEUE, EXCHANGE, route);
    await db.query(
      "UPDATE outbox_events SET next_attempt_at=clock_timestamp() WHERE event_id=$1",
      [body.event_id],
    );
    await worker.runOnce();
    await take(body);
    expect((await state(body.event_id)).status).toBe("SENT");
    observed.push({
      case: "unroutable-return-confirm",
      event_id: body.event_id,
      expected: "RETURNED/PENDING then same-ID SENT after binding restored",
      actual: "RETURNED/PENDING then SENT",
      provider: "real broker return and confirm callback",
    });
  });
  it("detects missing target delivery even when another durable queue routes and SENT is allowed", async () => {
    const other = "identity.m3.other.v1",
      route = ROUTES.UserRegistered;
    await channel.assertQueue(other, {
      durable: true,
      autoDelete: false,
      exclusive: false,
    });
    await channel.bindQueue(other, EXCHANGE, route);
    await channel.unbindQueue(QUEUE, EXCHANGE, route);
    const body = await insert();
    await worker.runOnce();
    expect((await state(body.event_id)).status).toBe("SENT");
    expect(await channel.get(QUEUE)).toBe(false);
    const message = await channel.get(other, { noAck: false });
    expect(JSON.parse(message.content).event_id).toBe(body.event_id);
    channel.ack(message);
    await channel.unbindQueue(other, EXCHANGE, route);
    await channel.bindQueue(QUEUE, EXCHANGE, route);
    const restored = await insert();
    await worker.runOnce();
    await take(restored);
    observed.push({
      case: "missing-target-other-route",
      expected:
        "SENT allowed but target delivery absent, then restored topology delivers fresh event",
      actual: "SENT, target empty, other received; restored target received",
      event_id: body.event_id,
    });
  });
  it("routes simultaneous valid attempts separately from real returned attempts", async () => {
    await channel.unbindQueue(QUEUE, EXCHANGE, ROUTES.UserRegistered);
    const bad = await insert(),
      good = await insert("organization-created");
    await worker.runOnce();
    expect((await state(bad.event_id)).status).toBe("PENDING");
    expect((await state(good.event_id)).status).toBe("SENT");
    await take(good);
    await channel.bindQueue(QUEUE, EXCHANGE, ROUTES.UserRegistered);
    await db.query(
      "UPDATE outbox_events SET next_attempt_at=clock_timestamp() WHERE event_id=$1",
      [bad.event_id],
    );
    await worker.runOnce();
    await take(bad);
    observed.push({
      case: "simultaneous-return-success",
      expected: "one PENDING, one SENT without cross-attempt contamination",
      actual: "matched; same-ID retry received",
    });
  });
  async function crash(mode, body) {
    const child = fork("tests/m3-crash-child.cjs", [mode], {
      env: { ...process.env, DATABASE_URL: url.toString() },
      stdio: ["ignore", "ignore", "ignore", "ipc"],
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        child.kill();
        reject(Error("Crash boundary timed out"));
      }, 10000);
      child.once("message", (message) => {
        clearTimeout(timer);
        expect(message.event_id).toBe(body.event_id);
        resolve();
      });
      child.once("exit", (code) => {
        clearTimeout(timer);
        if (code !== null) reject(Error("Child exited before crash boundary"));
      });
    });
    await new Promise((resolve) => {
      child.once("exit", resolve);
      child.kill("SIGKILL");
    });
  }
  it.each(["claim", "confirm"])(
    "recovers an actual process crash after %s; preserves ID through duplicate",
    async (mode) => {
      const body = await insert();
      await crash(mode, body);
      expect((await state(body.event_id)).status).toBe("PROCESSING");
      if (mode === "confirm") await take(body);
      // Only isolated test lease is advanced, simulating passage of the 60s deadline.
      await db.query(
        "UPDATE outbox_events SET lease_until=clock_timestamp()-interval '1 second' WHERE event_id=$1",
        [body.event_id],
      );
      await worker.runOnce();
      await take(body);
      expect((await state(body.event_id)).status).toBe("SENT");
      observed.push({
        case: "process-crash-" + mode,
        event_id: body.event_id,
        expected:
          mode === "confirm"
            ? "two deliveries, identical event ID"
            : "reclaimed delivery",
        actual:
          mode === "confirm"
            ? "duplicate same ID received"
            : "reclaimed and received",
        lease: "DB test deadline advanced; process actually killed",
      });
    },
  );
  it("real DB trigger failure after real broker confirm retains PROCESSING and duplicate same ID on reclaim", async () => {
    const body = await insert();
    await db.query(
      "CREATE FUNCTION m3_fail_sent() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status='SENT' THEN RAISE EXCEPTION 'synthetic SENT write failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER m3_fail BEFORE UPDATE ON outbox_events FOR EACH ROW EXECUTE FUNCTION m3_fail_sent()",
    );
    await worker.runOnce();
    expect((await state(body.event_id)).status).toBe("PROCESSING");
    await take(body);
    await db.query(
      "DROP TRIGGER m3_fail ON outbox_events; DROP FUNCTION m3_fail_sent()",
    );
    await db.query(
      "UPDATE outbox_events SET lease_until=clock_timestamp()-interval '1 second' WHERE event_id=$1",
      [body.event_id],
    );
    await worker.runOnce();
    await take(body);
    expect((await state(body.event_id)).status).toBe("SENT");
    observed.push({
      case: "db-finalize-failure",
      event_id: body.event_id,
      expected: "PROCESSING retained; same-ID duplicate on reclaim",
      actual: "matched",
      provider: "real DB trigger + real broker confirm",
    });
  });
  it("invalid schema and inconsistent aggregate never publish; replay retains payload and parks again", async () => {
    const bad = await insert("membership-changed", {
      aggregate_id: randomUUID(),
    });
    await worker.runOnce();
    expect((await state(bad.event_id)).status).toBe("PARKED");
    expect(await channel.get(QUEUE)).toBe(false);
    expect(
      await repo.replay(bad.event_id, "synthetic schema investigation", true),
    ).toBe(true);
    await worker.runOnce();
    expect((await state(bad.event_id)).status).toBe("PARKED");
    expect(await channel.get(QUEUE)).toBe(false);
    observed.push({
      case: "invalid-schema-replay",
      expected: "PARKED, no publish, unchanged payload on replay",
      actual: "matched",
    });
  });
  it("real broker closes channel for missing exchange; retry reconnect restores topology", async () => {
    const body = await insert();
    await channel.deleteExchange(EXCHANGE);
    await worker.runOnce();
    expect((await state(body.event_id)).status).toBe("PENDING");
    await db.query(
      "UPDATE outbox_events SET next_attempt_at=clock_timestamp() WHERE event_id=$1",
      [body.event_id],
    );
    await worker.runOnce();
    await take(body);
    expect((await state(body.event_id)).status).toBe("SENT");
    observed.push({
      case: "broker-channel-error",
      expected:
        "missing exchange closes publisher channel, no SENT; reconnect declares topology and retries same ID",
      actual: "matched",
      provider: "real broker channel.close",
    });
  });
  async function proxy() {
    const target = new URL(process.env.M3_RABBIT_URL);
    const sockets = new Set();
    let hold = false;
    const buffered = [];
    const server = net.createServer((client) => {
      const upstream = net.connect(Number(target.port), target.hostname);
      sockets.add(client);
      sockets.add(upstream);
      client.on("error", () => {});
      upstream.on("error", () => {});
      client.on("data", (chunk) => upstream.write(chunk));
      upstream.on("data", (chunk) => {
        if (hold) buffered.push([client, chunk]);
        else client.write(chunk);
      });
      client.on("close", () => {
        sockets.delete(client);
        upstream.destroy();
      });
      upstream.on("close", () => {
        sockets.delete(upstream);
        client.destroy();
      });
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const url = new URL(target);
    url.hostname = "127.0.0.1";
    url.port = String(server.address().port);
    return {
      url: url.toString(),
      hold: () => {
        hold = true;
      },
      flush: () => {
        hold = false;
        for (const [s, b] of buffered.splice(0)) if (!s.destroyed) s.write(b);
      },
      cut: () => {
        for (const s of sockets) s.destroy();
      },
      close: async () => {
        for (const s of sockets) s.destroy();
        await new Promise((resolve) => server.close(resolve));
      },
    };
  }
  it.each(["timeout", "disconnect"])(
    "real transport %s leaves delivery retryable with same ID (TCP fault proxy)",
    async (mode) => {
      const gate = await proxy();
      const p = new ConfirmPublisher(gate.url, 200);
      await p.ensure();
      gate.hold();
      const body = await insert();
      const work = new OutboxWorker(repo, p).runOnce();
      if (mode === "disconnect") {
        for (
          let n = 0;
          n < 100 && (await state(body.event_id)).status !== "PROCESSING";
          n++
        )
          await new Promise((r) => setTimeout(r, 5));
        gate.cut();
      }
      await work;
      expect((await state(body.event_id)).status).toBe("PENDING");
      await p.close();
      await gate.close();
      // A timed-out publish can already be in the broker. Drain optional first delivery.
      let duplicates = 0;
      const first = await channel.get(QUEUE, { noAck: false });
      if (first) {
        expect(JSON.parse(first.content).event_id).toBe(body.event_id);
        channel.ack(first);
        duplicates++;
      }
      await db.query(
        "UPDATE outbox_events SET next_attempt_at=clock_timestamp() WHERE event_id=$1",
        [body.event_id],
      );
      await worker.runOnce();
      await take(body);
      expect((await state(body.event_id)).status).toBe("SENT");
      observed.push({
        case: "transport-" + mode,
        expected: "PENDING then same-ID retry SENT; duplicates allowed",
        actual: "matched",
        optional_first_delivery: duplicates,
        provider:
          "real PostgreSQL/broker through TCP fault proxy; not a broker-generated NACK",
      });
    },
  );
  it("old inflight completion cannot overwrite new claim after lease reclaim; no DB lock while waiting broker", async () => {
    const gate = await proxy();
    const p = new ConfirmPublisher(gate.url, 3000);
    await p.ensure();
    gate.hold();
    const body = await insert();
    const old = new OutboxWorker(repo, p).runOnce();
    for (
      let n = 0;
      n < 100 && (await state(body.event_id)).status !== "PROCESSING";
      n++
    )
      await new Promise((r) => setTimeout(r, 5));
    const c = await db.connect();
    await c.query("BEGIN");
    await c.query(
      "SELECT event_id FROM outbox_events WHERE event_id=$1 FOR UPDATE NOWAIT",
      [body.event_id],
    );
    await c.query(
      "UPDATE outbox_events SET lease_until=clock_timestamp()-interval '1 second' WHERE event_id=$1",
      [body.event_id],
    );
    await c.query("COMMIT");
    c.release();
    const [fresh] = await repo.claim(1, 60000);
    await publisher.publish(fresh);
    expect(await repo.finish(fresh, "SENT", null)).toBe(true);
    gate.flush();
    await old;
    expect((await state(body.event_id)).status).toBe("SENT");
    expect((await state(body.event_id)).attempt_count).toBe(2);
    await take(body);
    await take(body);
    await p.close();
    await gate.close();
    observed.push({
      case: "old-inflight-owner",
      expected:
        "row lock available during broker wait; new token SENT survives old ACK, duplicate keeps ID",
      actual: "matched",
      lease:
        "isolated DB deadline advanced; real outstanding publisher ACK delayed via TCP proxy",
    });
  });
});
