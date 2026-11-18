import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { fail } from "@lamu/runtime";
import { ContextGuard, type IdentityRequest } from "../../common/context.guard";
import { key, pagination, uuid } from "./organizations.controller";
import { CreateInvitationDto } from "./dto/invitation.dto";
import { InvitationsService } from "./invitations.service";
@Controller()
@UseGuards(ContextGuard)
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}
  @Get("users/me/invitations") list(
    @Req() req: IdentityRequest,
    @Query() query: Record<string, unknown>,
  ) {
    const page = pagination(query);
    return this.invitations.list(
      req.identity.sub.toLowerCase(),
      page.limit,
      page.offset,
    );
  }
  @Get("organizations/:orgId/members/invitations")
  @Header("Cache-Control", "no-store")
  listSent(
    @Req() req: IdentityRequest,
    @Param("orgId") org: string,
    @Query() query: Record<string, unknown>,
  ) {
    const page = pagination(query);
    return this.invitations.listSent(
      req.identity.sub.toLowerCase(),
      uuid(org),
      page.limit,
      page.offset,
    );
  }
  @Post("organizations/:orgId/members/invitations") async create(
    @Req() req: IdentityRequest,
    @Param("orgId") org: string,
    @Body() dto: CreateInvitationDto,
    @Res() res: Response,
  ) {
    const result = await this.invitations.create(
      req.identity.sub.toLowerCase(),
      uuid(org),
      key(req),
      dto,
    );
    return res.status(result.status).json(result.body);
  }
  private async action(
    req: IdentityRequest,
    id: string,
    kind: "accept" | "decline" | "revoke",
    body: unknown,
    res: Response,
    org?: string,
  ) {
    if (
      body !== undefined &&
      (!body ||
        typeof body !== "object" ||
        Array.isArray(body) ||
        Object.keys(body).length)
    )
      fail(400, "VALIDATION_FAILED", "Expected empty body");
    const result = await this.invitations.action(
      req.identity.sub.toLowerCase(),
      uuid(id),
      kind,
      key(req),
      org === undefined ? undefined : uuid(org),
    );
    return res.status(result.status).json(result.body);
  }
  @Post("users/me/invitations/:id/accept") accept(
    @Req() r: IdentityRequest,
    @Param("id") id: string,
    @Body() b: unknown,
    @Res() s: Response,
  ) {
    return this.action(r, id, "accept", b, s);
  }
  @Post("users/me/invitations/:id/decline") decline(
    @Req() r: IdentityRequest,
    @Param("id") id: string,
    @Body() b: unknown,
    @Res() s: Response,
  ) {
    return this.action(r, id, "decline", b, s);
  }
  @Post("organizations/:orgId/members/invitations/:id/revoke") revoke(
    @Req() r: IdentityRequest,
    @Param("id") id: string,
    @Param("orgId") org: string,
    @Body() b: unknown,
    @Res() s: Response,
  ) {
    return this.action(r, id, "revoke", b, s, org);
  }
}
