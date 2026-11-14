import { Inject, Injectable } from "@nestjs/common";
import type { Request, Response } from "express";
import { type Config, fail, headerValues } from "@lamu/runtime";
export const GATEWAY_CONFIG = Symbol("GATEWAY_CONFIG");
@Injectable()
export class ProxyService {
  constructor(@Inject(GATEWAY_CONFIG) private readonly config: Config) {}
  async forward(
    path: string,
    req: Request,
    res: Response,
    context?: { sub: string; sid: string },
  ) {
    if (headerValues(req, "authorization").length > 1)
      fail(401, "UNAUTHENTICATED", "Duplicate authorization");
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "x-request-id": String(res.getHeader("X-Request-Id")),
    };
    if (
      (req.method === "POST" && path === "/organizations") ||
      (req.method === "POST" &&
        (/^\/organizations\/[^/]+\/members\/invitations(?:\/[^/]+\/revoke)?$/.test(
          path,
        ) ||
          /^\/users\/me\/invitations\/[^/]+\/(accept|decline)$/.test(path))) ||
      (req.method === "PUT" &&
        /^\/organizations\/[^/]+\/members\/[^/]+\/roles$/.test(path))
    ) {
      const keys = headerValues(req, "idempotency-key");
      if (!keys.length)
        fail(400, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key required");
      if (keys.length !== 1 || !/^[A-Za-z0-9._:-]{1,128}$/.test(keys[0]))
        fail(400, "VALIDATION_FAILED", "Invalid Idempotency-Key");
      headers["idempotency-key"] = keys[0];
    }
    if (context) {
      headers["x-user-id"] = context.sub;
      headers["x-session-id"] = context.sid;
      headers.authorization = req.headers.authorization!;
    }
    const signal = AbortSignal.timeout(this.config.timeoutMs);
    try {
      const upstream = await fetch(
        this.config.identityUrl.replace(/\/$/, "") + path,
        {
          method: req.method,
          headers,
          body: req.method === "GET" ? undefined : JSON.stringify(req.body),
          signal,
          redirect: "error",
        },
      );
      const body = (await upstream.json()) as {
        error?: { code?: string; message?: string };
      };
      if (body?.error) {
        body.error = {
          code: body.error.code,
          message: body.error.message,
          ...{ request_id: headers["x-request-id"] },
        };
      }
      return res.status(upstream.status).json(body);
    } catch {
      if (signal.aborted)
        fail(504, "UPSTREAM_TIMEOUT", "Identity request timed out");
      fail(502, "UPSTREAM_UNAVAILABLE", "Identity unavailable");
    }
  }
}
