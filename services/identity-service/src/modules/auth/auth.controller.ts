import {
  Body,
  Controller,
  Header,
  HttpCode,
  HttpException,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { AuthService, passwordAttemptWindow } from "./auth.service";
import {
  ChangePasswordDto,
  LoginDto,
  RegisterDto,
  RefreshDto,
} from "./dto/auth.dto";
import { ContextGuard, type IdentityRequest } from "../../common/context.guard";
@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Post("auth/register") @HttpCode(200) register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }
  @Post("auth/login") @HttpCode(200) login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }
  @Post("auth/refresh") @HttpCode(200) refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refresh_token);
  }
  @Post("auth/logout") @HttpCode(200) @UseGuards(ContextGuard) logout(
    @Body() dto: RefreshDto,
    @Req() req: IdentityRequest,
  ) {
    return this.auth.logout(dto.refresh_token, req.identity);
  }
  @Post("users/me/password")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  @UseGuards(ContextGuard)
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @Req() req: IdentityRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      return await this.auth.changePassword(req.identity, dto);
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === 429)
        res.setHeader(
          "Retry-After",
          String(
            passwordAttemptWindow -
              (Math.floor(Date.now() / 1000) % passwordAttemptWindow),
          ),
        );
      throw error;
    }
  }
}
