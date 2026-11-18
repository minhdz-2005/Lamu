import { randomUUID } from "node:crypto";
import {
  allowsIdentityRequest,
  isIdentityUuid,
  paginatedIdentityPath,
} from "./authMode";

const maxBodyBytes = 64 * 1024;
async function readBody(request: Request, signal: AbortSignal) {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const cancel = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener("abort", cancel, { once: true });
  const decoder = new TextDecoder();
  let body = "";
  let size = 0;
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) return body + decoder.decode();
      size += value.byteLength;
      if (size > maxBodyBytes) {
        cancel();
        return null;
      }
      body += decoder.decode(value, { stream: true });
    }
  } finally {
    signal.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
}

export async function proxyIdentity(
  request: Request,
  parts: string[],
): Promise<Response> {
  const incomingId = request.headers.get("x-request-id");
  const requestId = isIdentityUuid(incomingId) ? incomingId : randomUUID();
  const fail = (status: number, code: string) =>
    Response.json(
      { error: { code, message: "", request_id: requestId } },
      {
        status,
        headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
      },
    );
  const pathname = "/" + parts.join("/");
  const incoming = new URL(request.url);
  if (
    incoming.pathname !== "/api/identity" + pathname ||
    parts.some((part) => part.includes("/")) ||
    !allowsIdentityRequest(request.method, pathname)
  )
    return fail(404, "NOT_FOUND");
  const query = incoming.searchParams;
  const seen = new Set<string>();
  for (const [key, value] of query) {
    const number = Number(value);
    if (
      request.method !== "GET" ||
      !paginatedIdentityPath(pathname) ||
      !["limit", "offset"].includes(key) ||
      seen.has(key) ||
      !/^\d+$/.test(value) ||
      number > (key === "limit" ? 100 : 2147483647) ||
      (key === "limit" && number < 1)
    )
      return fail(400, "VALIDATION_FAILED");
    seen.add(key);
  }
  const deadline = AbortSignal.timeout(8000);
  const signal = AbortSignal.any([deadline, request.signal]);
  try {
    const base = new URL(
      process.env.IDENTITY_GATEWAY_URL ?? "http://127.0.0.1:8080",
    );
    if (
      !["http:", "https:"].includes(base.protocol) ||
      base.username ||
      base.password ||
      base.search ||
      base.hash ||
      base.pathname !== "/"
    )
      return fail(503, "SERVICE_UNAVAILABLE");
    const headers = new Headers({
      "Content-Type": "application/json",
      "X-Request-Id": requestId,
    });
    const bearer = request.headers.get("authorization");
    if (bearer) headers.set("Authorization", bearer);
    const idempotencyKey = request.headers.get("idempotency-key");
    if (idempotencyKey && request.method !== "GET")
      headers.set("Idempotency-Key", idempotencyKey);
    const url = new URL("/api" + pathname, base);
    url.search = query.toString();
    const payload =
      request.method === "GET" ? undefined : await readBody(request, signal);
    if (payload === null) return fail(413, "VALIDATION_FAILED");
    const response = await fetch(url, {
      method: request.method,
      headers,
      body: payload,
      signal,
      redirect: "error",
      cache: "no-store",
    });
    const body = await response.arrayBuffer();
    const output = new Headers({ "Cache-Control": "no-store" });
    for (const name of ["content-type", "x-request-id", "retry-after"]) {
      const value = response.headers.get(name);
      if (value) output.set(name, value);
    }
    if (!output.has("x-request-id")) output.set("X-Request-Id", requestId);
    return new Response(body, { status: response.status, headers: output });
  } catch {
    return fail(
      deadline.aborted ? 504 : 502,
      deadline.aborted ? "UPSTREAM_TIMEOUT" : "UPSTREAM_UNAVAILABLE",
    );
  }
}
