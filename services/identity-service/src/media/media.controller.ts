import {
  Body,
  Controller,
  Delete,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import { IsString, IsUUID, Matches, MaxLength } from "class-validator";
import { ContextGuard, type IdentityRequest } from "../common/context.guard";
import { MediaService } from "./media.service";
export class MediaRevisionDto {
  @IsString() @MaxLength(18) @Matches(/^[0-9]+$/) expected_revision!: string;
}
export class MediaCommitDto {
  @IsUUID() intent_id!: string;
}
@Controller("users/me/avatar")
@UseGuards(ContextGuard)
export class AvatarController {
  constructor(private readonly media: MediaService) {}
  @Post("upload-intents")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  intent(@Req() r: IdentityRequest, @Body() dto: MediaRevisionDto) {
    return this.media.intent(r.identity, dto.expected_revision);
  }
  @Put() @Header("Cache-Control", "no-store") commit(
    @Req() r: IdentityRequest,
    @Body() dto: MediaCommitDto,
  ) {
    return this.media.commit(r.identity, dto.intent_id);
  }
  @Delete() @Header("Cache-Control", "no-store") remove(
    @Req() r: IdentityRequest,
    @Body() dto: MediaRevisionDto,
  ) {
    return this.media.remove(r.identity, dto.expected_revision);
  }
}
@Controller("organizations/:id/cover")
@UseGuards(ContextGuard)
export class CoverController {
  constructor(private readonly media: MediaService) {}
  @Post("upload-intents")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  intent(
    @Req() r: IdentityRequest,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() dto: MediaRevisionDto,
  ) {
    return this.media.intent(r.identity, dto.expected_revision, id);
  }
  @Put() @Header("Cache-Control", "no-store") commit(
    @Req() r: IdentityRequest,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() dto: MediaCommitDto,
  ) {
    return this.media.commit(r.identity, dto.intent_id, id);
  }
  @Delete() @Header("Cache-Control", "no-store") remove(
    @Req() r: IdentityRequest,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() dto: MediaRevisionDto,
  ) {
    return this.media.remove(r.identity, dto.expected_revision, id);
  }
}
