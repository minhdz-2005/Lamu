import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  sanitizeNext,
  setSession,
  getAccessToken,
  subscribeAuth,
  setCachedProfile,
  getCachedProfile,
  isAuthenticated,
  clearSession,
  redirectToAuth,
} from "../src/lib/auth";

const data = new Map<string, string>();
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
    },
  });
});
test("T09: only same-origin allowlisted next, default /me", () => {
  for (const value of [
    null,
    "//evil.test",
    "/\\evil.test",
    "/%2f%2fevil",
    "/auth",
    "/events",
    "/me/../auth",
    "https://evil.test",
  ]) {
    assert.equal(sanitizeNext(value), "/me");
  }
  assert.equal(sanitizeNext("/me"), "/me");
});
test("F01/F02: atomic mode namespace, ignore legacy credential", async () => {
  data.set("luma.access", "legacy");
  assert.equal(getAccessToken(), null);
  await setSession("mock-access", "mock-refresh");
  const records = [...data.keys()].filter((k) =>
    k.startsWith("lamu.session.v2."),
  );
  assert.equal(records.length, 1);
  const record = JSON.parse(data.get(records[0])!);
  assert.equal(record.access, "mock-access");
  assert.equal(record.refresh, "mock-refresh");
  assert.ok(record.generation);
});
test("F06: proxy exact allowlist, strip spoofed IP, preserve headers and no fallback", async () => {
  const { proxyIdentity } = await import("../src/lib/identityProxy");
  process.env.IDENTITY_GATEWAY_URL = "http://127.0.0.1:8080";
  const original = globalThis.fetch;
  let count = 0;
  globalThis.fetch = async (url, init) => {
    count++;
    assert.equal(String(url), "http://127.0.0.1:8080/api/auth/login");
    const h = new Headers(init?.headers);
    for (const key of ["x-forwarded-for", "x-client-ip", "cookie", "x-user-id"])
      assert.equal(h.get(key), null);
    assert.match(h.get("x-request-id")!, /^[0-9a-f-]{36}$/);
    return Response.json(
      { error: { code: "RATE_LIMITED" } },
      {
        status: 429,
        headers: {
          "Retry-After": "60",
          "Cache-Control": "no-store",
          "X-Request-Id": h.get("x-request-id")!,
        },
      },
    );
  };
  try {
    const req = new Request("http://localhost/api/identity/auth/login", {
      method: "POST",
      headers: {
        "x-forwarded-for": "1.2.3.4",
        "x-client-ip": "fake",
        cookie: "secret",
        "x-user-id": "fake",
      },
      body: "{}",
    });
    const response = await proxyIdentity(req, ["auth", "login"]);
    assert.equal(response.status, 429);
    assert.equal(response.headers.get("retry-after"), "60");
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal((await proxyIdentity(req, ["organizations"])).status, 404);
    assert.equal(count, 1);
    globalThis.fetch = async () => {
      throw new Error("down");
    };
    assert.equal(
      (
        await proxyIdentity(
          new Request(req.url, { method: "POST", body: "{}" }),
          ["auth", "login"],
        )
      ).status,
      502,
    );
  } finally {
    globalThis.fetch = original;
  }
});
test("F02/F04: profile cache follows generation, events/focus read authoritative storage and cleanup subscribers", async () => {
  const events = new Map<string, Function>();
  let notifications = 0;
  window.addEventListener = ((type: string, fn: Function) =>
    events.set(type, fn)) as typeof window.addEventListener;
  window.removeEventListener = ((type: string) =>
    events.delete(type)) as typeof window.removeEventListener;
  const off = subscribeAuth(() => {
    notifications++;
  });
  await setSession("a", "r");
  assert.equal(isAuthenticated(), false);
  await setCachedProfile({
    id: "u",
    email: "a@b.test",
    display_name: "Name",
    memberships: [],
  });
  assert.equal(getCachedProfile()?.display_name, "Name");
  assert.equal(isAuthenticated(), true);
  events.get("storage")!({ key: "lamu.session.v2.mock" });
  events.get("focus")!();
  assert.equal(notifications, 4);
  off();
  assert.equal(events.size, 0);
  await clearSession();
  assert.equal(getCachedProfile(), null);
  assert.equal(isAuthenticated(), false);
  let assigned = "";
  Object.assign(window, {
    location: {
      pathname: "/private",
      assign: (target: string) => {
        assigned = target;
      },
    },
  });
  redirectToAuth("//evil.test");
  assert.equal(assigned, "/auth?next=%2Fme");
});
test("F02: writers use exclusive Web Lock with deadline and localize lock timeout", async () => {
  const prior = Object.getOwnPropertyDescriptor(navigator, "locks");
  let lockName = "";
  let signal: AbortSignal | undefined;
  try {
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: {
        request: async (
          name: string,
          options: { signal: AbortSignal; mode: string },
          work: () => Promise<unknown>,
        ) => {
          lockName = name;
          signal = options.signal;
          assert.equal(options.mode, "exclusive");
          return work();
        },
      },
    });
    await setSession("a", "r");
    assert.equal(lockName, "lamu.session.v2.mock");
    assert.ok(signal);
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: {
        request: async () => {
          throw new DOMException("timeout", "TimeoutError");
        },
      },
    });
    await assert.rejects(clearSession(), /Phiên đang được cập nhật/);
    assert.equal(getAccessToken(), "a");
  } finally {
    if (prior) Object.defineProperty(navigator, "locks", prior);
    else delete (navigator as any).locks;
  }
});
