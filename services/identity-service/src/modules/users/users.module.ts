import { type DynamicModule, Module } from "@nestjs/common";
import { type Database, DATABASE } from "../../database";
import { ContextGuard } from "../../common/context.guard";
import { UsersService } from "./users.service";
import { UsersController } from "./users.controller";
@Module({})
export class UsersModule {
  static register(db: Database): DynamicModule {
    return {
      module: UsersModule,
      controllers: [UsersController],
      providers: [
        UsersService,
        ContextGuard,
        { provide: DATABASE, useValue: db },
      ],
    };
  }
}
