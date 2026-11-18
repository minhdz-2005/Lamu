import {
  Controller,
  Get,
  Post,
  Param,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { JwtGuard, type VerifiedRequest } from "../auth/jwt.guard";
import { ProxyService } from "./proxy.service";
@Controller("api")
@UseGuards(JwtGuard)
export class InvitationsController {
  constructor(private readonly proxy: ProxyService) {}
  @Get("users/me/invitations") list(
    @Req() r: VerifiedRequest,
    @Res() s: Response,
  ) {
    const query = r.originalUrl.includes("?")
      ? r.originalUrl.slice(r.originalUrl.indexOf("?"))
      : "";
    return this.proxy.forward(
      "/users/me/invitations" + query,
      r,
      s,
      r.identity,
    );
  }
  @Get("organizations/:orgId/members/invitations")
  listSent(
    @Param("orgId") org: string,
    @Req() r: VerifiedRequest,
    @Res() s: Response,
  ) {
    const queryAt = r.originalUrl.indexOf("?");
    const query = queryAt < 0 ? "" : r.originalUrl.slice(queryAt);
    return this.proxy.forward(
      "/organizations/" +
        encodeURIComponent(org) +
        "/members/invitations" +
        query,
      r,
      s,
      r.identity,
    );
  }
  @Post("organizations/:orgId/members/invitations") create(
    @Param("orgId") org: string,
    @Req() r: VerifiedRequest,
    @Res() s: Response,
  ) {
    return this.proxy.forward(
      "/organizations/" + encodeURIComponent(org) + "/members/invitations",
      r,
      s,
      r.identity,
    );
  }
  @Post("users/me/invitations/:id/accept") accept(
    @Param("id") id: string,
    @Req() r: VerifiedRequest,
    @Res() s: Response,
  ) {
    return this.proxy.forward(
      "/users/me/invitations/" + encodeURIComponent(id) + "/accept",
      r,
      s,
      r.identity,
    );
  }
  @Post("users/me/invitations/:id/decline") decline(
    @Param("id") id: string,
    @Req() r: VerifiedRequest,
    @Res() s: Response,
  ) {
    return this.proxy.forward(
      "/users/me/invitations/" + encodeURIComponent(id) + "/decline",
      r,
      s,
      r.identity,
    );
  }
  @Post("organizations/:orgId/members/invitations/:id/revoke") revoke(
    @Param("orgId") org: string,
    @Param("id") id: string,
    @Req() r: VerifiedRequest,
    @Res() s: Response,
  ) {
    return this.proxy.forward(
      "/organizations/" +
        encodeURIComponent(org) +
        "/members/invitations/" +
        encodeURIComponent(id) +
        "/revoke",
      r,
      s,
      r.identity,
    );
  }
}
