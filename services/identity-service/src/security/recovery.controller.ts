import {
  Body,
  Controller,
  Header,
  HttpCode,
  HttpException,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import { Transform } from "class-transformer";
import { IsEmail, IsString, Length, Matches, MaxLength } from "class-validator";
import type { Request, Response } from "express";
import { RecoveryService } from "./recovery.service";
export class ForgotDto {
  @Transform(({ value }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email!: string;
}
export class VerifyDto extends ForgotDto {
  @IsString() @Matches(/^[0-9]{6}$/) code!: string;
}
export class ResetDto {
  @IsString() @Matches(/^[A-Za-z0-9_-]{43}$/) reset_token!: string;
  @IsString() @Length(8, 128) new_password!: string;
}
@Controller("auth")
export class RecoveryController {
  constructor(private readonly recovery: RecoveryService) {}
  private ip(req: Request) {
    return String(
      req.headers["x-client-ip"] ?? req.socket.remoteAddress ?? "unknown",
    );
  }
  private async respond<T>(res: Response, work: () => Promise<T>) {
    try {
      return await work();
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === 429)
        res.setHeader(
          "Retry-After",
          String(Math.ceil((3600000 - (Date.now() % 3600000)) / 1000)),
        );
      throw error;
    }
  }
  @Post("forgot-password")
  @HttpCode(202)
  @Header("Cache-Control", "no-store")
  forgot(
    @Body() dto: ForgotDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.respond(res, () =>
      this.recovery.forgot(dto.email, this.ip(req)),
    );
  }
  @Post("verify-reset-code")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  verify(
    @Body() dto: VerifyDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.respond(res, () =>
      this.recovery.verify(dto.email, dto.code, this.ip(req)),
    );
  }
  @Post("reset-password")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  reset(
    @Body() dto: ResetDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.respond(res, () =>
      this.recovery.reset(dto.reset_token, dto.new_password, this.ip(req)),
    );
  }
}
