// Test process only: crash at a controlled boundary after real DB/broker work.
const { Pool } = require("pg");
const {
  OutboxRepository,
} = require("../services/identity-service/dist/messaging/outbox.repository");
const {
  ConfirmPublisher,
} = require("../services/identity-service/dist/messaging/confirm.publisher");
(async () => {
  const db = new Pool({ connectionString: process.env.DATABASE_URL });
  const repo = new OutboxRepository(db);
  const claims = await repo.claim(1, 60000);
  if (claims.length !== 1) throw Error("Expected isolated crash claim");
  if (process.argv[2] === "confirm") {
    const publisher = new ConfirmPublisher(process.env.M3_RABBIT_URL);
    await publisher.ensure();
    await publisher.publish(claims[0]);
  }
  process.send({ boundary: process.argv[2], event_id: claims[0].event_id });
  // Parent terminates this actual process before any DB finalization.
  setInterval(() => {}, 1000);
})().catch(() => process.exit(2));
