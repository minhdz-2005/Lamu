import { Module, type DynamicModule } from "@nestjs/common";
import { DATABASE, type Database } from "../database";
import { ContextGuard } from "../common/context.guard";
import { AuthorizationService } from "../modules/organizations/authorization.service";
import {
  MEDIA_CONFIG,
  MEDIA_PROVIDER,
  CloudinaryProvider,
  type MediaConfig,
  type MediaProvider,
} from "./cloudinary";
import { MediaService } from "./media.service";
import { AvatarController, CoverController } from "./media.controller";
@Module({})
export class MediaModule {
  static register(
    db: Database,
    config: MediaConfig,
    provider?: MediaProvider,
  ): DynamicModule {
    return {
      module: MediaModule,
      controllers: [AvatarController, CoverController],
      providers: [
        MediaService,
        AuthorizationService,
        ContextGuard,
        { provide: DATABASE, useValue: db },
        { provide: MEDIA_CONFIG, useValue: config },
        {
          provide: MEDIA_PROVIDER,
          useValue: provider ?? new CloudinaryProvider(config),
        },
      ],
    };
  }
}
