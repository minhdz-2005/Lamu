import "reflect-metadata";
import { Controller, Get, Inject, Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { type Config, setupHttp, fail } from "@lamu/runtime";
import { AuthController } from "./routes/auth.controller";
import { ProxyService, GATEWAY_CONFIG } from "./routes/proxy.service";
import { UsersController } from "./routes/users.controller";
import { JwtGuard } from "./auth/jwt.guard";
import { SwaggerModule, type OpenAPIObject } from "@nestjs/swagger";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
@Controller()
class HealthController {
  constructor(@Inject(GATEWAY_CONFIG) private readonly config: Config) {}
  @Get("healthz") health() {
    return { status: "OK" };
  }
  @Get("readyz") async ready() {
    try {
      const res = await fetch(
        this.config.identityUrl.replace(/\/$/, "") + "/readyz",
        { signal: AbortSignal.timeout(this.config.timeoutMs) },
      );
      if (res.ok) return { status: "OK" };
    } catch {}
    fail(503, "SERVICE_UNAVAILABLE", "Identity not ready");
  }
}
export async function createGatewayApp(config: Config) {
  @Module({
    controllers: [HealthController, AuthController, UsersController],
    providers: [
      ProxyService,
      JwtGuard,
      { provide: GATEWAY_CONFIG, useValue: config },
    ],
  })
  class GatewayModule {}
  const app = await NestFactory.create(GatewayModule, { logger: false });
  setupHttp(app, config);
  const document = JSON.parse(
    readFileSync(
      resolve(__dirname, "../../shared/contracts/http/gateway.openapi.json"),
      "utf8",
    ),
  ) as OpenAPIObject;
  SwaggerModule.setup("docs", app, document, {
    swaggerOptions: { persistAuthorization: false },
  });
  return app;
}
