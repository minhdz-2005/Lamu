import { randomUUID } from "node:crypto";
import { Pool } from "pg";

export interface Envelope {
  event_id: string;
  event_type: string;
  version: number;
  occurred_at: string;
  aggregate_type: string;
  aggregate_id: string;
  producer: string;
  payload: Record<string, unknown>;
}
export interface Claim {
  event_id: string;
  claim_token: string;
  attempt_count: number;
  envelope: Envelope;
}
export type Outcome = "SENT" | "PENDING" | "PARKED";
export class OutboxRepository {
  constructor(readonly pool: Pool) {}

  async claim(limit = 10, leaseMs = 60000): Promise<Claim[]> {
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 10 ||
      !Number.isInteger(leaseMs) ||
      leaseMs < 1 ||
      leaseMs > 60000
    )
      throw new Error("Invalid claim bounds");
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      await c.query(
        "SET LOCAL lock_timeout='2s'; SET LOCAL statement_timeout='3s'",
      );
      const { rows } = await c.query(
        `SELECT event_id,status,claim_token,attempt_count FROM outbox_events
        WHERE (status='PENDING' AND next_attempt_at<=clock_timestamp())
           OR (status='PROCESSING' AND lease_until<=clock_timestamp())
        ORDER BY next_attempt_at,occurred_at,event_id LIMIT $1 FOR UPDATE SKIP LOCKED`,
        [limit],
      );
      const claims: Claim[] = [];
      for (const row of rows) {
        if (row.claim_token)
          await c.query(
            "UPDATE outbox_delivery_attempts SET finished_at=clock_timestamp(),outcome='LEASE_EXPIRED' WHERE claim_token=$1 AND finished_at IS NULL",
            [row.claim_token],
          );
        if (row.attempt_count >= 20) {
          await c.query(
            "UPDATE outbox_events SET status='PARKED',claim_token=NULL,lease_until=NULL,parked_at=clock_timestamp(),last_error_code='ATTEMPTS_EXHAUSTED' WHERE event_id=$1",
            [row.event_id],
          );
          continue;
        }
        const token = randomUUID();
        const { rows: claimed } = await c.query(
          `UPDATE outbox_events SET status='PROCESSING',claim_token=$2,
          lease_until=clock_timestamp()+$3*interval '1 millisecond',last_attempt_at=clock_timestamp(),attempt_count=attempt_count+1
          WHERE event_id=$1 RETURNING event_id,claim_token,attempt_count,
          jsonb_build_object('event_id',event_id,'event_type',event_type,'version',version,
          'occurred_at',to_char(occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
          'aggregate_type',aggregate_type,'aggregate_id',aggregate_id,'producer',producer,'payload',payload) AS envelope`,
          [row.event_id, token, leaseMs],
        );
        await c.query(
          "INSERT INTO outbox_delivery_attempts(claim_token,event_id,attempt_number,started_at) SELECT claim_token,event_id,attempt_count,last_attempt_at FROM outbox_events WHERE event_id=$1",
          [row.event_id],
        );
        claims.push(claimed[0]);
      }
      await c.query("COMMIT");
      return claims;
    } catch (e) {
      await c.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      c.release();
    }
  }

  async finish(
    claim: Claim,
    outcome: Outcome,
    code: string | null,
    delayMs = 0,
  ): Promise<boolean> {
    if (code !== null && !/^[A-Z_]{1,64}$/.test(code))
      throw new Error("Invalid error code");
    if (!Number.isFinite(delayMs) || delayMs < 0 || delayMs > 300000)
      throw new Error("Invalid retry delay");
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      await c.query(
        "SET LOCAL lock_timeout='2s'; SET LOCAL statement_timeout='3s'",
      );
      const { rowCount } = await c.query(
        `UPDATE outbox_events SET status=$3,claim_token=NULL,lease_until=NULL,
        next_attempt_at=clock_timestamp()+$5*interval '1 millisecond',last_error_code=$4,
        sent_at=CASE WHEN $3='SENT' THEN clock_timestamp() ELSE sent_at END,
        parked_at=CASE WHEN $3='PARKED' THEN clock_timestamp() ELSE NULL END
        WHERE event_id=$1 AND status='PROCESSING' AND claim_token=$2 AND lease_until>clock_timestamp()`,
        [claim.event_id, claim.claim_token, outcome, code, delayMs],
      );
      if (rowCount)
        await c.query(
          "UPDATE outbox_delivery_attempts SET finished_at=clock_timestamp(),outcome=$2 WHERE claim_token=$1 AND finished_at IS NULL",
          [claim.claim_token, code ?? outcome],
        );
      await c.query("COMMIT");
      return rowCount === 1;
    } catch (e) {
      await c.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      c.release();
    }
  }

  async replay(
    eventId: string,
    reason: string,
    apply = false,
  ): Promise<boolean> {
    if (
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
        eventId,
      ) ||
      !reason.trim() ||
      reason.length > 256
    )
      throw new Error(
        "Replay requires UUID and reason (1..256 characters); do not include secrets",
      );
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      await c.query(
        "SET LOCAL lock_timeout='2s'; SET LOCAL statement_timeout='3s'",
      );
      const { rows } = await c.query(
        "SELECT attempt_count FROM outbox_events WHERE event_id=$1 AND status='PARKED' FOR UPDATE",
        [eventId],
      );
      if (rows.length && apply) {
        await c.query(
          "INSERT INTO outbox_replays(id,event_id,reason,previous_attempt_count) VALUES($1,$2,$3,$4)",
          [randomUUID(), eventId, reason.trim(), rows[0].attempt_count],
        );
        await c.query(
          "UPDATE outbox_events SET status='PENDING',attempt_count=0,next_attempt_at=clock_timestamp(),parked_at=NULL,last_error_code=NULL WHERE event_id=$1 AND status='PARKED'",
          [eventId],
        );
      }
      await c.query("COMMIT");
      return rows.length === 1;
    } catch (e) {
      await c.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      c.release();
    }
  }
}
