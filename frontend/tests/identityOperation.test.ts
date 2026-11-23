import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { request } from "../src/lib/apiClient";
import {
  clearSession,
  readSession,
  setSession,
  writeSession,
} from "../src/lib/auth";
import { ApiException } from "../src/lib/errors";
import { identityApi } from "../src/lib/identityApi";
import { createIdentityOperation } from "../src/lib/identityOperation";

const org = "b899e38d-3fcb-4568-9cf6-11d92bdbde40";
const storage = new Map<string, string>();
beforeEach(() => {
  storage.clear();
  Object.assign(globalThis, {
    window: {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      },
      addEventListener() {},
      removeEventListener() {},
    },
  });
});

test("business 403 after refresh preserves the rotated session; profile 403 invalidates it", async (t) => {
  await setSession("expired", "old");
  let rotations = 0;
  t.mock.method(
    globalThis,
    "fetch",
    (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).endsWith("/auth/refresh")) {
        rotations++;
        return Response.json({
          access_token: "fresh",
          refresh_token: "rotated",
          expires_in: 900,
        });
      }
      const hasFresh =
        new Headers(init?.headers).get("authorization") === "Bearer fresh";
      return Response.json(
        { error: { code: hasFresh ? "FORBIDDEN" : "UNAUTHENTICATED" } },
        { status: hasFresh ? 403 : 401 },
      );
    },
  );
  await assert.rejects(request(`/organizations/${org}`), { status: 403 });
  assert.equal(rotations, 1);
  assert.equal(readSession().access, "fresh");
  await assert.rejects(request("/users/me"), { status: 403 });
  assert.equal(rotations, 1);
  assert.equal(readSession().unavailable, true);
  assert.equal(readSession().refresh, null);
});

test("refresh-only shared bootstrap never sends a tokenless Profile request", async (t) => {
  writeSession({
    version: 2,
    generation: "refresh-only",
    access: null,
    refresh: "old",
  });
  let rotations = 0;
  t.mock.method(
    globalThis,
    "fetch",
    (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).endsWith("/auth/refresh")) {
        rotations++;
        return Response.json({
          access_token: "fresh",
          refresh_token: "rotated",
          expires_in: 900,
        });
      }
      if (new Headers(init?.headers).get("authorization") !== "Bearer fresh") {
        return Response.json(
          { error: { code: "UNAUTHENTICATED" } },
          { status: 401 },
        );
      }
      return Response.json({
        id: org,
        display_name: "Profile",
        email: "account@example.test",
        memberships: [],
      });
    },
  );
  const profiles = await Promise.all([
    request("/users/me"),
    request("/users/me"),
  ]);
  assert.equal(rotations, 1);
  assert.deepEqual(profiles[0], profiles[1]);
});

test("unknown mutation keeps immutable request and key through bounded retry; stale work is discarded", async (t) => {
  await setSession("access", "refresh");
  const original = readSession().generation;
  const operation = createIdentityOperation<{ organization_id: string }>(
    original,
  );
  const sent: Array<{ url: string; body: unknown; key: string | null }> = [];
  t.mock.method(
    globalThis,
    "fetch",
    (url: RequestInfo | URL, init?: RequestInit) => {
      sent.push({
        url: String(url),
        body: init?.body,
        key: new Headers(init?.headers).get("idempotency-key"),
      });
      return sent.length === 1
        ? Response.json({}, { status: 504 })
        : Response.json({ organization_id: org }, { status: 201 });
    },
  );
  const pending = operation.start(
    identityApi.createOrganization("  Hội Lamu "),
  );
  await operation.start(identityApi.createOrganization("unrelated"));
  await pending;
  assert.equal(operation.getSnapshot().status, "outcome-unknown");
  assert.deepEqual(await operation.retry(), { organization_id: org });
  assert.equal(operation.getSnapshot().status, "confirmed");
  assert.equal(sent.length, 2);
  assert.ok(sent[0].key);
  assert.equal(sent[0].body, '{"name":"Hội Lamu"}');
  assert.deepEqual(sent[0], sent[1]);
  await clearSession();
  assert.equal(
    await operation.start(identityApi.createOrganization("wrong actor")),
    undefined,
  );
  assert.equal(sent.length, 2);
});

test("operation disconnect discards late success; malformed or cross-org lists fail closed", async (t) => {
  await setSession("access", "refresh");
  const operation = createIdentityOperation();
  const off = operation.connect();
  let finish!: (value: string) => void;
  const pending = operation.start({
    method: "POST",
    path: "/organizations",
    send: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  });
  await setSession("another", "another-proof");
  finish("late");
  assert.equal(await pending, undefined);
  assert.equal(operation.getSnapshot().status, "idle");
  off();
  t.mock.method(globalThis, "fetch", () =>
    Response.json({
      items: [
        { organization_id: "other", invitee_email: "private@example.test" },
      ],
      total: 1,
      limit: 20,
      offset: 0,
    }),
  );
  await assert.rejects(
    identityApi.sentInvitations(org, 20, 0),
    (err: unknown) => err instanceof ApiException && err.status === 502,
  );
});

test("runtime validation accepts complete scoped snapshots and rejects wrong org, enum or pagination", async (t) => {
  await setSession("access", "refresh");
  const invitationId = "98e8fec0-cff1-422d-8796-c3c8bc5117a6";
  const when = "2026-11-18T02:00:00.000Z";
  const row = {
    id: invitationId,
    organization_id: org,
    inviter_user_id: org,
    invitee_user_id: invitationId,
    invitee_display_name: "Recipient",
    invitee_email: "recipient@example.test",
    roles: [
      { code: "ADMIN", resource_type: "ORG", resource_id: org },
      { code: "SPEAKER", resource_type: "EVENT", resource_id: invitationId },
    ],
    status: "PENDING",
    created_at: when,
    expires_at: when,
    processed_at: null,
  };
  let response: unknown = { items: [row], total: 1, limit: 20, offset: 0 };
  t.mock.method(globalThis, "fetch", () => Response.json(response));
  assert.deepEqual(
    (await identityApi.sentInvitations(org, 20, 0)).items[0].roles,
    row.roles,
  );
  for (const malformed of [
    { ...row, organization_id: invitationId },
    { ...row, status: "UNKNOWN" },
    { ...row, processed_at: "tomorrow" },
    {
      ...row,
      roles: [
        { code: "OWNER", resource_type: "EVENT", resource_id: invitationId },
      ],
    },
  ]) {
    response = { items: [malformed], total: 1, limit: 20, offset: 0 };
    await assert.rejects(identityApi.sentInvitations(org, 20, 0), {
      status: 502,
    });
  }
  response = { items: [row], total: 1, limit: 20, offset: 20 };
  await assert.rejects(identityApi.sentInvitations(org, 20, 0), {
    status: 502,
  });
});

test("after the idempotency window, an unknown operation cannot submit another write", async (t) => {
  await setSession("access", "refresh");
  const now = Date.now();
  const date = t.mock.method(Date, "now", () => now);
  const operation = createIdentityOperation();
  let writes = 0;
  await operation.start({
    method: "POST",
    path: "/organizations",
    async send() {
      writes++;
      throw new ApiException("UPSTREAM_TIMEOUT", "", 504, "");
    },
  });
  date.mock.mockImplementation(() => now + 24 * 60 * 60 * 1000);
  assert.equal(await operation.retry(), undefined);
  assert.equal(writes, 1);
  assert.equal(operation.getSnapshot().status, "outcome-unknown");
  assert.equal(
    (operation.getSnapshot().error as ApiException).code,
    "OPERATION_RETRY_EXPIRED",
  );
});
