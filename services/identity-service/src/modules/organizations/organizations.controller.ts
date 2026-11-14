import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { fail, headerValues, UUID } from "@lamu/runtime";
import { ContextGuard, type IdentityRequest } from "../../common/context.guard";
import { OrganizationsService } from "./organizations.service";
import { AuthorizationService } from "./authorization.service";
import {
  AuthorizationDto,
  CreateOrganizationDto,
  ReplaceRolesDto,
} from "./dto/organization.dto";
export function uuid(value: string) {
  if (!UUID.test(value)) fail(400, "VALIDATION_FAILED", "Invalid UUID");
  return value.toLowerCase();
}
export function key(req: Request) {
  const values = headerValues(req, "idempotency-key");
  if (!values.length)
    fail(400, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key required");
  if (values.length !== 1 || !/^[A-Za-z0-9._:-]{1,128}$/.test(values[0]))
    fail(400, "VALIDATION_FAILED", "Invalid Idempotency-Key");
  return values[0];
}
export function pagination(query: Record<string, unknown>) {
  if (Object.keys(query).some((k) => !["limit", "offset"].includes(k)))
    fail(400, "VALIDATION_FAILED", "Invalid query");
  const parse = (
    value: unknown,
    fallback: number,
    min: number,
    max: number,
  ) => {
    if (value === undefined) return fallback;
    if (
      typeof value !== "string" ||
      !/^\d+$/.test(value) ||
      !Number.isSafeInteger(Number(value)) ||
      Number(value) < min ||
      Number(value) > max
    )
      fail(400, "VALIDATION_FAILED", "Invalid pagination");
    return Number(value);
  };
  return {
    limit: parse(query.limit, 20, 1, 100),
    offset: parse(query.offset, 0, 0, 2147483647),
  };
}
@Controller("organizations")
@UseGuards(ContextGuard)
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}
  @Post() async create(
    @Req() req: IdentityRequest,
    @Body() dto: CreateOrganizationDto,
    @Res() res: Response,
  ) {
    const result = await this.organizations.create(
      req.identity.sub.toLowerCase(),
      key(req),
      dto,
    );
    return res.status(result.status).json(result.body);
  }
  @Get(":orgId") get(@Req() req: IdentityRequest, @Param("orgId") org: string) {
    return this.organizations.get(req.identity.sub.toLowerCase(), uuid(org));
  }
  @Get(":orgId/members") members(
    @Req() req: IdentityRequest,
    @Param("orgId") org: string,
    @Query() query: Record<string, unknown>,
  ) {
    const page = pagination(query);
    return this.organizations.members(
      req.identity.sub.toLowerCase(),
      uuid(org),
      page.limit,
      page.offset,
    );
  }
  @Put(":orgId/members/:userId/roles") async replace(
    @Req() req: IdentityRequest,
    @Param("orgId") org: string,
    @Param("userId") user: string,
    @Body() dto: ReplaceRolesDto,
    @Res() res: Response,
  ) {
    const result = await this.organizations.replace(
      req.identity.sub.toLowerCase(),
      uuid(org),
      uuid(user),
      key(req),
      dto,
    );
    return res.status(result.status).json(result.body);
  }
}
@Controller()
export class OrganizationQueriesController {
  constructor(
    private readonly organizations: OrganizationsService,
    private readonly authorization: AuthorizationService,
  ) {}
  @Get("public/organizations/:slug") publicOrg(@Param("slug") slug: string) {
    if (
      slug.length < 3 ||
      slug.length > 63 ||
      !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)
    )
      fail(400, "VALIDATION_FAILED", "Invalid slug");
    return this.organizations.publicOrganization(slug);
  }
  @Post("internal/authorization/check") check(
    @Body() dto: AuthorizationDto,
    @Res() res: Response,
  ) {
    return this.authorization
      .check(dto)
      .then((body) => res.status(200).json(body));
  }
  @Get("internal/users/:userId/public-profile") user(
    @Param("userId") user: string,
  ) {
    return this.organizations.publicUser(uuid(user));
  }
}
