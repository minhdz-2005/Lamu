import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { AuthService } from "./auth.service";
import { LoginDto, RegisterDto, RefreshDto } from "./dto/auth.dto";
import { ContextGuard, type IdentityRequest } from "../../common/context.guard";
@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Post("register") @HttpCode(200) register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }
  @Post("login") @HttpCode(200) login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }
  @Post("refresh") @HttpCode(200) refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refresh_token);
  }
  @Post("logout") @HttpCode(200) @UseGuards(ContextGuard) logout(
    @Body() dto: RefreshDto,
    @Req() req: IdentityRequest,
  ) {
    return this.auth.logout(dto.refresh_token, req.identity);
  }
}
