import assert from "node:assert/strict";
import { test } from "node:test";
import { sanitizeNext } from "../src/lib/auth";
import { allowsIdentityRequest, identityPath } from "../src/lib/authMode";
import { proxyIdentity } from "../src/lib/identityProxy";

const org = "b899e38d-3fcb-4568-9cf6-11d92bdbde40";
const user = "257093ad-c7d4-4a0d-97d6-aa7a36af0802";

test("Identity routing recognizes only supported paths; deep links accept literal UUIDs", () => {
  assert.ok(
    identityPath(
      `/organizations/${org}/members/invitations?limit=20&offset=40`,
    ),
  );
  assert.ok(identityPath("/users/me/invitations?offset=0"));
  assert.ok(!identityPath("/organizations/not-an-id/members"));
  assert.equal(sanitizeNext(`/organizations/${org}`), `/organizations/${org}`);
  assert.equal(sanitizeNext("/me/invitations"), "/me/invitations");
  assert.equal(sanitizeNext("/organizations?next=//evil.test"), "/me");
});

test("profile mutations expose only the required method and path pairs", () => {
  const routes = [
    ["/users/me/avatar/upload-intents", "POST"],
    ["/users/me/avatar", "PUT"],
    ["/users/me/password", "POST"],
    [`/organizations/${org}/cover/upload-intents`, "POST"],
    [`/organizations/${org}/cover`, "PUT"],
  ];
  for (const [path, method] of routes) {
    assert.ok(identityPath(path));
    for (const candidate of ["GET", "POST", "PUT", "PATCH", "DELETE"])
      assert.equal(
        allowsIdentityRequest(candidate, path),
        candidate === method,
      );
    assert.ok(!allowsIdentityRequest(method, path + "/"));
  }
  assert.ok(!allowsIdentityRequest("POST", "/users/me/password/reset"));
  assert.ok(allowsIdentityRequest("PATCH", `/organizations/${org}`));
  assert.ok(allowsIdentityRequest("GET", `/organizations/${org}`));
  assert.ok(!allowsIdentityRequest("PATCH", `/organizations/${org}/members`));
});

test("proxy forwards organization description and cover writes only at the contracted paths", async () => {
  const original = fetch;
  const observed: { path: string; method?: string; body?: BodyInit | null }[] =
    [];
  globalThis.fetch = async (url, init) => {
    observed.push({
      path: new URL(String(url)).pathname,
      method: init?.method,
      body: init?.body,
    });
    assert.equal(
      new Headers(init?.headers).get("authorization"),
      "Bearer owner",
    );
    return Response.json({});
  };
  const detail = `/organizations/${org}`;
  try {
    const routes = [
      [detail, "PATCH", '{"description":null}'],
      [detail + "/cover/upload-intents", "POST", '{"expected_revision":"1"}'],
      [detail + "/cover", "PUT", `{"intent_id":"${user}"}`],
    ];
    for (const [path, method, body] of routes) {
      const request = (candidate: string, suffix = "") =>
        new Request("http://localhost/api/identity" + path + suffix, {
          method: candidate,
          headers: { authorization: "Bearer owner" },
          body,
        });
      const parts = path.slice(1).split("/");
      assert.equal((await proxyIdentity(request(method), parts)).status, 200);
      assert.equal((await proxyIdentity(request("DELETE"), parts)).status, 404);
      assert.equal(
        (await proxyIdentity(request(method, "?limit=1"), parts)).status,
        400,
      );
    }
    assert.deepEqual(
      observed,
      routes.map(([path, method, body]) => ({
        path: "/api" + path,
        method,
        body,
      })),
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("proxy forwards pagination, role replacement and idempotency, with a private response", async () => {
  const original = globalThis.fetch;
  const path = ["organizations", org, "members", "invitations"];
  const base = "http://localhost/api/identity/";
  const read = base + path.join("/");
  const writePath = ["organizations", org, "members", user, "roles"];
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return Response.json(
      { status: "OK" },
      {
        status: init?.method === "PUT" ? 409 : 200,
        headers: { "cache-control": "public", "set-cookie": "unsafe=1" },
      },
    );
  };
  try {
    const headers = {
      authorization: "Bearer example",
      cookie: "session=example",
      "idempotency-key": "key",
      "x-user-id": user,
    };
    const response = await proxyIdentity(
      new Request(read + "?limit=20&offset=40", { headers }),
      path,
    );
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("set-cookie"), null);
    assert.match(
      calls[0].url,
      /\/api\/organizations\/.*\/members\/invitations\?limit=20&offset=40$/,
    );
    const replaced = await proxyIdentity(
      new Request(base + writePath.join("/"), {
        method: "PUT",
        headers,
        body: '{"roles":[]}',
      }),
      writePath,
    );
    assert.equal(replaced.status, 409);
    assert.equal(calls[1].init?.body, '{"roles":[]}');
    const passed = new Headers(calls[1].init?.headers);
    assert.equal(passed.get("idempotency-key"), "key");
    assert.equal(passed.get("authorization"), "Bearer example");
    assert.equal(passed.get("cookie"), null);
    assert.equal(passed.get("x-user-id"), null);
    for (const query of [
      "?offset=0&offset=10",
      "?email=secret",
      "?limit=101",
      "?offset=-1",
    ]) {
      assert.equal(
        (await proxyIdentity(new Request(read + query), path)).status,
        400,
      );
    }
    const oversized = new Request(base + writePath.join("/"), {
      method: "PUT",
      body: " ".repeat(65537),
    });
    assert.equal((await proxyIdentity(oversized, writePath)).status, 413);
    assert.equal(
      (
        await proxyIdentity(new Request(read), [
          "organizations",
          "..",
          "members",
        ])
      ).status,
      404,
    );
    assert.equal(
      (
        await proxyIdentity(new Request(read), [
          "organizations",
          org + "/members/invitations",
        ])
      ).status,
      404,
    );
    assert.equal(calls.length, 2);
  } finally {
    globalThis.fetch = original;
  }
});
