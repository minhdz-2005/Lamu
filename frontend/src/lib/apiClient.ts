"use client";

import { clearSession, getAccessToken, getRefreshToken, redirectToAuth, setSession } from "./auth";
import { isApiErrorBody } from "./errors";
import { ApiException } from "./errors";
import type { AuthTokens } from "./types";

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || "/api";

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
  /** Endpoint nội bộ saga không bao giờ gọi từ UI; flag này chỉ để chặn nhầm. */
  anonymous?: boolean;
}

let refreshPromise: Promise<boolean> | null = null;

function join(path: string): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `${BASE}${clean}`;
}

function newRequestId(): string {
  return `req-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
}

async function parse<T>(response: Response, requestId: string): Promise<T> {
  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }
  if (!response.ok) {
    if (isApiErrorBody(body)) {
      throw new ApiException(
        body.error.code,
        body.error.message,
        response.status,
        body.error.request_id || requestId,
      );
    }
    throw new ApiException("UPSTREAM_UNAVAILABLE", "", response.status, requestId);
  }
  if (!text) return null as T;
  return body as T;
}

/** Refresh một lần duy nhất, các request 401 song chia sẻ cùng promise (00 §2). */
async function refreshOnce(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const refresh = getRefreshToken();
    if (!refresh) return false;
    try {
      const response = await fetch(join("/auth/refresh"), {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Request-Id": newRequestId() },
        body: JSON.stringify({ refresh_token: refresh }),
      });
      if (!response.ok) return false;
      const tokens = (await response.json()) as AuthTokens;
      setSession(tokens.access_token, tokens.refresh_token);
      return true;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? "GET";
  const requestId = newRequestId();

  const buildHeaders = (): Record<string, string> => {
    const headers: Record<string, string> = { "X-Request-Id": requestId, ...options.headers };
    if (options.body !== undefined && !("Content-Type" in headers)) {
      headers["Content-Type"] = "application/json";
    }
    const token = getAccessToken();
    if (token && !options.anonymous) headers.Authorization = `Bearer ${token}`;
    return headers;
  };

  const send = () =>
    fetch(join(path), {
      method,
      headers: buildHeaders(),
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });

  let response: Response;
  try {
    response = await send();
  } catch {
    throw new ApiException("UPSTREAM_UNAVAILABLE", "", 0, requestId);
  }

  const isAuthEndpoint = path.startsWith("/auth/");
  if (response.status === 401 && !isAuthEndpoint) {
    const refreshed = await refreshOnce();
    if (!refreshed) {
      clearSession();
      redirectToAuth(window.location.pathname + window.location.search);
      throw new ApiException("UNAUTHENTICATED", "", 401, requestId);
    }
    try {
      response = await send();
    } catch {
      throw new ApiException("UPSTREAM_UNAVAILABLE", "", 0, requestId);
    }
  }

  return parse<T>(response, requestId);
}

export function apiUrl(path: string): string {
  return join(path);
}

export const apiBase = BASE;
