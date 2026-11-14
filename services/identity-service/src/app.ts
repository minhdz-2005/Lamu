import "reflect-metadata";
import {
  Controller,
  Get,
  Inject,
  Module,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { type Config, setupHttp, fail } from "@lamu/runtime";
import { createDatabase, type Database, DATABASE } from "./database";
import { AuthModule } from "./modules/auth/auth.module";
import { UsersModule } from "./modules/users/users.module";

@Controller()
class HealthController {
  constructor(@Inject(DATABASE) private readonly db: Database) {}
  @Get("healthz") health() {
    return { status: "OK" };
  }
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
export async function createIdentityApp(config: Config, database?: Database) {
  const db = database ?? createDatabase(config.databaseUrl);
  @Module({
    imports: [AuthModule.register(config, db), UsersModule.register(db)],
    controllers: [HealthController],
    providers: [
      { provide: DATABASE, useValue: db },
      { provide: DatabaseShutdown, useFactory: () => new DatabaseShutdown(db) },
    ],
  })
  class IdentityModule {}
  const app = await NestFactory.create(IdentityModule, { logger: false });
  setupHttp(app, config);
  return app;
}
