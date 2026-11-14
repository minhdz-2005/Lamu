export function workerConfig(env: NodeJS.ProcessEnv) {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL required");
  const database = new URL(databaseUrl);
  if (!["postgres:", "postgresql:"].includes(database.protocol))
    throw new Error("Invalid database protocol");
  let rabbitUrl = env.RABBITMQ_URL;
  if (!rabbitUrl) {
    if (!env.RABBITMQ_USER || !env.RABBITMQ_PASSWORD)
      throw new Error("RabbitMQ credentials required");
    const url = new URL("amqp://rabbitmq:5672");
    url.username = env.RABBITMQ_USER;
    url.password = env.RABBITMQ_PASSWORD;
    rabbitUrl = url.toString();
  }
  const rabbit = new URL(rabbitUrl);
  if (!["amqp:", "amqps:"].includes(rabbit.protocol) || !rabbit.hostname)
    throw new Error("Invalid broker protocol");
  rabbit.searchParams.set("heartbeat", "10");
  return { databaseUrl, rabbitUrl: rabbit.toString() };
}
