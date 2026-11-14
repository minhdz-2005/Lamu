import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { ContextGuard, type IdentityRequest } from "../../common/context.guard";
import { UsersService } from "./users.service";
@Controller("users")
export class UsersController {
  constructor(private readonly users: UsersService) {}
  @Get("me") @UseGuards(ContextGuard) me(@Req() req: IdentityRequest) {
    return this.users.me(req.identity.sub);
  }
}
