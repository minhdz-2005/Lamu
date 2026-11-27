import "reflect-metadata";
import {
  Controller,
  Get,
  Inject,
  Module,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { fail, setupHttp } from "@lamu/runtime";
import { type EventConfig, toRuntimeConfig } from "./config";
import { createDatabase, type Database, DATABASE } from "./database";

@Controller()
class HealthController {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  // Liveness: the process is up. Not routed through the Gateway.
  @Get("healthz") health() {
    return { status: "OK" };
  }

  // Readiness: event_db is reachable. Used by the Compose healthcheck.
  @Get("readyz") async ready() {
    try {
      await this.db.$queryRawUnsafe("SELECT 1");
      return { status: "OK" };
    } catch {
      fail(503, "SERVICE_UNAVAILABLE", "Database unavailable");
    }
  }
}

class DatabaseShutdown implements OnApplicationShutdown {
  constructor(private readonly db: Database) {}
  async onApplicationShutdown() {
    await this.db.$disconnect();
  }
}

export async function createEventApp(config: EventConfig, database?: Database) {
  const db = database ?? createDatabase(config.databaseUrl);

  @Module({
    controllers: [HealthController],
    providers: [
      { provide: DATABASE, useValue: db },
      { provide: DatabaseShutdown, useFactory: () => new DatabaseShutdown(db) },
    ],
  })
  class EventModule {}

  const app = await NestFactory.create(EventModule, { logger: false });
  setupHttp(app, toRuntimeConfig(config));
  return app;
}
