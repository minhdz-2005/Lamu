import {
  Controller,
  Get,
  Param,
  Post,
  Put,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { JwtGuard, type VerifiedRequest } from "../auth/jwt.guard";
import { ProxyService } from "./proxy.service";
@Controller("api/organizations")
@UseGuards(JwtGuard)
export class OrganizationsController {
  constructor(private readonly proxy: ProxyService) {}
  @Post() create(@Req() req: VerifiedRequest, @Res() res: Response) {
    return this.proxy.forward("/organizations", req, res, req.identity);
  }
  @Get(":orgId") get(
    @Param("orgId") org: string,
    @Req() req: VerifiedRequest,
    @Res() res: Response,
  ) {
    return this.proxy.forward(
      "/organizations/" + encodeURIComponent(org),
      req,
      res,
      req.identity,
    );
  }
  @Get(":orgId/members") members(
    @Param("orgId") org: string,
    @Req() req: VerifiedRequest,
    @Res() res: Response,
  ) {
    const query = req.originalUrl.includes("?")
      ? req.originalUrl.slice(req.originalUrl.indexOf("?"))
      : "";
    return this.proxy.forward(
      "/organizations/" + encodeURIComponent(org) + "/members" + query,
      req,
      res,
      req.identity,
    );
  }
  @Put(":orgId/members/:userId/roles") replace(
    @Param("orgId") org: string,
    @Param("userId") user: string,
    @Req() req: VerifiedRequest,
    @Res() res: Response,
  ) {
    return this.proxy.forward(
      "/organizations/" +
        encodeURIComponent(org) +
        "/members/" +
        encodeURIComponent(user) +
        "/roles",
      req,
      res,
      req.identity,
    );
  }
}
@Controller("api/public/organizations")
export class PublicOrganizationsController {
  constructor(private readonly proxy: ProxyService) {}
  @Get(":slug") get(
    @Param("slug") slug: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.proxy.forward(
      "/public/organizations/" + encodeURIComponent(slug),
      req,
      res,
    );
  }
}
