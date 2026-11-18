import { Controller, Get, Post, Req, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { JwtGuard, type VerifiedRequest } from "../auth/jwt.guard";
import { ProxyService } from "./proxy.service";
@Controller("api/users")
export class UsersController {
  constructor(private readonly proxy: ProxyService) {}
  @Get("me") @UseGuards(JwtGuard) me(
    @Req() req: VerifiedRequest,
    @Res() res: Response,
  ) {
    return this.proxy.forward("/users/me", req, res, req.identity);
  }
  @Post("me/password") @UseGuards(JwtGuard) changePassword(
    @Req() req: VerifiedRequest,
    @Res() res: Response,
  ) {
    return this.proxy.forward("/users/me/password", req, res, req.identity);
  }
}
