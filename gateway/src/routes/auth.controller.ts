import { Controller, Post, Req, Res, UseGuards } from "@nestjs/common";
import type { Request, Response } from "express";
import { ProxyService } from "./proxy.service";
import { JwtGuard, type VerifiedRequest } from "../auth/jwt.guard";
@Controller("api/auth")
export class AuthController {
  constructor(private readonly proxy: ProxyService) {}
  @Post("register") register(@Req() req: Request, @Res() res: Response) {
    return this.proxy.forward("/auth/register", req, res);
  }
  @Post("login") login(@Req() req: Request, @Res() res: Response) {
    return this.proxy.forward("/auth/login", req, res);
  }
  @Post("refresh") refresh(@Req() req: Request, @Res() res: Response) {
    return this.proxy.forward("/auth/refresh", req, res);
  }
  @Post("logout") @UseGuards(JwtGuard) logout(
    @Req() req: VerifiedRequest,
    @Res() res: Response,
  ) {
    return this.proxy.forward("/auth/logout", req, res, req.identity);
  }
}
