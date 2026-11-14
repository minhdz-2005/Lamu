import { Pool } from "pg";
import { randomUUID } from "node:crypto";

describe("M3 additive outbox metadata", () => {
  const db = new Pool({ connectionString: process.env.DATABASE_URL });
  afterAll(() => db.end());
  it("stores claim/lease and preserves an existing envelope without rebuilding it", async () => {
    const event = randomUUID();
    await db.query(
      "INSERT INTO outbox_events(event_id,event_type,version,occurred_at,aggregate_type,aggregate_id,producer,payload) VALUES($1,'UserRegistered',1,'2026-11-14T00:00:00.123456Z','user',$2,'identity-service',$3)",
      [event, randomUUID(), JSON.stringify({ historical: "snapshot" })],
    );
    const before = (
      await db.query(
        "SELECT to_jsonb(o) AS data FROM outbox_events o WHERE event_id=$1",
        [event],
      )
    ).rows[0].data;
    const token = randomUUID();
    await db.query(
      "UPDATE outbox_events SET status='PROCESSING',claim_token=$2,lease_until=clock_timestamp()+interval '60 seconds',attempt_count=1 WHERE event_id=$1",
      [event, token],
    );
    const after = (
      await db.query(
        "SELECT *,to_char(occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS exact_time FROM outbox_events WHERE event_id=$1",
        [event],
      )
    ).rows[0];
    expect(after.claim_token).toBe(token);
    expect(after.payload).toEqual(before.payload);
    expect(after.exact_time).toBe("2026-11-14T00:00:00.123456Z");
    await expect(
      db.query("UPDATE outbox_events SET attempt_count=-1 WHERE event_id=$1", [
        event,
      ]),
    ).rejects.toMatchObject({ code: "23514" });
    await db.query(
      "UPDATE outbox_events SET status='PARKED',claim_token=NULL,lease_until=NULL,parked_at=clock_timestamp() WHERE event_id=$1",
      [event],
    );
    expect(
      (await db.query("SELECT count(*) FROM outbox_delivery_attempts")).rows[0]
        .count,
    ).toBe("0");
    expect(
      (await db.query("SELECT count(*) FROM outbox_replays")).rows[0].count,
    ).toBe("0");
  });
});
