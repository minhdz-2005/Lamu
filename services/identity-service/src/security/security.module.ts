import { Module, type DynamicModule } from "@nestjs/common";
import { DATABASE, type Database } from "../database";
import { RecoveryController } from "./recovery.controller";
import { RecoveryService } from "./recovery.service";
import { SECURITY_CONFIG, type RecoveryConfig } from "./config";
@Module({})
export class SecurityModule {
  static register(db: Database, config: RecoveryConfig): DynamicModule {
    return {
      module: SecurityModule,
      controllers: [RecoveryController],
      providers: [
        RecoveryService,
        { provide: DATABASE, useValue: db },
        { provide: SECURITY_CONFIG, useValue: config },
      ],
    };
  }
}
