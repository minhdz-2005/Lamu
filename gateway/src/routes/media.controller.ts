import {
  Controller,
  Delete,
  Param,
  Post,
  Put,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { JwtGuard, type VerifiedRequest } from "../auth/jwt.guard";
import { ProxyService } from "./proxy.service";
@Controller("api")
@UseGuards(JwtGuard)
export class MediaController {
  constructor(private readonly proxy: ProxyService) {}
  @Post("users/me/avatar/upload-intents") avatarIntent(
    @Req() r: VerifiedRequest,
    @Res() s: Response,
  ) {
    return this.proxy.forward(
      "/users/me/avatar/upload-intents",
      r,
      s,
      r.identity,
    );
  }
  @Put("users/me/avatar") avatarCommit(
    @Req() r: VerifiedRequest,
    @Res() s: Response,
  ) {
    return this.proxy.forward("/users/me/avatar", r, s, r.identity);
  }
  @Delete("users/me/avatar") avatarDelete(
    @Req() r: VerifiedRequest,
    @Res() s: Response,
  ) {
    return this.proxy.forward("/users/me/avatar", r, s, r.identity);
  }
  @Post("organizations/:id/cover/upload-intents") coverIntent(
    @Param("id") id: string,
    @Req() r: VerifiedRequest,
    @Res() s: Response,
  ) {
    return this.proxy.forward(
      `/organizations/${encodeURIComponent(id)}/cover/upload-intents`,
      r,
      s,
      r.identity,
    );
  }
  @Put("organizations/:id/cover") coverCommit(
    @Param("id") id: string,
    @Req() r: VerifiedRequest,
    @Res() s: Response,
  ) {
    return this.proxy.forward(
      `/organizations/${encodeURIComponent(id)}/cover`,
      r,
      s,
      r.identity,
    );
  }
  @Delete("organizations/:id/cover") coverDelete(
    @Param("id") id: string,
    @Req() r: VerifiedRequest,
    @Res() s: Response,
  ) {
    return this.proxy.forward(
      `/organizations/${encodeURIComponent(id)}/cover`,
      r,
      s,
      r.identity,
    );
  }
}
