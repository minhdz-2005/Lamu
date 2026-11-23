import { type DynamicModule, Module } from "@nestjs/common";
import { type Config } from "@lamu/runtime";
import { type Database, DATABASE } from "../../database";
import { AuthController } from "./auth.controller";
import { AuthService, AUTH_CONFIG, CLOCK, type Clock } from "./auth.service";
import { ContextGuard } from "../../common/context.guard";
@Module({})
export class AuthModule {
  static register(
    config: Config,
    db: Database,
    clock: Clock = () => new Date(),
  ): DynamicModule {
    return {
      module: AuthModule,
      controllers: [AuthController],
      providers: [
        AuthService,
        ContextGuard,
        { provide: DATABASE, useValue: db },
        { provide: AUTH_CONFIG, useValue: config },
        { provide: CLOCK, useValue: clock },
      ],
    };
  }
}
