import { Module, type DynamicModule } from "@nestjs/common";
import { DATABASE, type Database } from "../../database";
import { ContextGuard } from "../../common/context.guard";
import { OrganizationsService } from "./organizations.service";
import { InvitationsService } from "./invitations.service";
import { InvitationsController } from "./invitations.controller";
import { AuthorizationService } from "./authorization.service";
import {
  OrganizationsController,
  OrganizationQueriesController,
} from "./organizations.controller";
import {
  EVENT_CONTEXT,
  ORGANIZATION_CLOCK,
  type EventContextResolver,
} from "./event-context";
export interface OrganizationOptions {
  resolver?: EventContextResolver;
  now?: () => Date;
}
@Module({})
export class OrganizationsModule {
  static register(
    db: Database,
    options: OrganizationOptions = {},
  ): DynamicModule {
    return {
      module: OrganizationsModule,
      controllers: [
        OrganizationsController,
        OrganizationQueriesController,
        InvitationsController,
      ],
      providers: [
        OrganizationsService,
        InvitationsService,
        AuthorizationService,
        ContextGuard,
        { provide: DATABASE, useValue: db },
        { provide: EVENT_CONTEXT, useValue: options.resolver ?? null },
        {
          provide: ORGANIZATION_CLOCK,
          useValue: options.now ?? (() => new Date()),
        },
      ],
    };
  }
}
