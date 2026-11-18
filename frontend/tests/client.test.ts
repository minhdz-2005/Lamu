import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { request, validProfile, validTokens } from "../src/lib/apiClient";
import {
  describeError,
  formatIdentityError,
  isNetworkError,
  ApiException,
} from "../src/lib/errors";
import { setSession, readSession, clearSession } from "../src/lib/auth";
const data = new Map<string, string>();
test("error copy exposes only a readable message and preserves the request ID on the exception", () => {
  const id = "cc921c45-73ee-4ce1-813f-ea410ac7f0c6";
  const error = new ApiException(
    "FORBIDDEN",
    "private server message",
    403,
    id,
  );
  const message = "Tài khoản không được phép thực hiện yêu cầu này.";
  assert.equal(formatIdentityError(error), message);
  assert.deepEqual(describeError(error), { message });
  assert.equal(error.requestId, id);
  assert.equal(
    describeError(new ApiException("constructor", "", 502, id)).message,
    "Dịch vụ tạm thời không sẵn sàng. Vui lòng thử lại sau.",
  );
  assert.match(
    describeError(new TypeError("Failed to fetch")).message,
    /kiểm tra kết nối mạng/,
  );
  assert.doesNotMatch(describeError(new Error(id)).message, new RegExp(id));
});
beforeEach(() => {
  data.clear();
  Object.assign(globalThis, {
    window: {
      localStorage: {
        getItem: (k: string) => data.get(k) ?? null,
        setItem: (k: string, v: string) => data.set(k, v),
        removeItem: (k: string) => data.delete(k),
      },
      addEventListener() {},
      removeEventListener() {},
      location: { pathname: "/auth", search: "", assign() {} },
    },
  });
});
test("T16: successful invalid JSON tokens must fail, UUID and bounded signal", async () => {
  const original = fetch;
  let observed: RequestInit | undefined;
  globalThis.fetch = async (_url, init) => {
    observed = init;
    return new Response("not json", { status: 200 });
  };
  try {
    await assert.rejects(
      request("/auth/login", { method: "POST", anonymous: true }),
    );
    assert.match(
      new Headers(observed?.headers).get("x-request-id")!,
      /^[0-9a-f-]{36}$/,
    );
    assert.ok(observed?.signal);
  } finally {
    globalThis.fetch = original;
  }
});
test("T05/T06: single flight refresh, transient failure preserves session and cannot replay lost rotation", async () => {
  await setSession("old", "refresh");
  let refreshes = 0;
  const original = fetch;
  globalThis.fetch = async (url) => {
    if (String(url).endsWith("/auth/refresh")) {
      refreshes++;
      return Response.json(
        { error: { code: "UPSTREAM_UNAVAILABLE", message: "down" } },
        { status: 502 },
      );
    }
    return Response.json(
      { error: { code: "UNAUTHENTICATED", message: "" } },
      { status: 401 },
    );
  };
  try {
    await Promise.allSettled([request("/users/me"), request("/users/me")]);
    assert.equal(readSession().access, "old");
    assert.equal(refreshes, 1);
    await assert.rejects(request("/users/me"));
    assert.equal(refreshes, 1);
    await clearSession();
    await assert.rejects(request("/users/me"));
  } finally {
    globalThis.fetch = original;
  }
});
test("T15: Retry-After metadata, localized unknown errors", async () => {
  const original = fetch;
  globalThis.fetch = async () =>
    Response.json(
      { error: { code: "RATE_LIMITED", message: "English backend error" } },
      {
        status: 429,
        headers: { "Retry-After": "42", "X-Request-Id": "server-id" },
      },
    );
  try {
    await assert.rejects(
      request("/auth/login", { method: "POST" }),
      (error: any) =>
        error.retryAfter === 42 &&
        error.requestId === "server-id" &&
        !error.displayMessage.includes("English"),
    );
  } finally {
    globalThis.fetch = original;
  }
});
test("T16: profile validator rejects null membership instead of throwing", () => {
  assert.equal(
    validProfile({
      id: "u",
      email: "a@b.test",
      display_name: "A",
      memberships: [null],
    }),
    false,
  );
});
test("T16: validate canonical consumer shapes and map unknown/network errors", async () => {
  assert.equal(
    validTokens({ access_token: "a", refresh_token: "r", expires_in: 900 }),
    true,
  );
  assert.equal(
    validTokens({ access_token: "a", refresh_token: "r", expires_in: 1 }),
    false,
  );
  assert.equal(
    validProfile({
      id: "u",
      email: "a@b.test",
      display_name: "A",
      memberships: [],
    }),
    true,
  );
  assert.equal(isNetworkError(new TypeError("down")), true);
  assert.equal(
    isNetworkError(new ApiException("UPSTREAM_UNAVAILABLE", "", 0, "id")),
    true,
  );
  assert.ok(
    describeError(new ApiException("UNKNOWN", "private", 502, "id")).message,
  );
  assert.ok(describeError(new TypeError("down")).message);
  assert.ok(describeError({}).message);
  const original = fetch;
  try {
    for (const [path, body] of [
      ["/auth/register", { user_id: "u" }],
      [
        "/auth/verify-reset-code",
        { reset_token: "a".repeat(43), expires_in: 300 },
      ],
      ["/auth/forgot-password", { status: "OK" }],
      [
        "/users/me",
        { id: "u", email: "a@b.test", display_name: "A", memberships: [] },
      ],
    ]) {
      globalThis.fetch = async () => Response.json(body);
      assert.ok(await request(path as string, { anonymous: true }));
    }
  } finally {
    globalThis.fetch = original;
  }
});
