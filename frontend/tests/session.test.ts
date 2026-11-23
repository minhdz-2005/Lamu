import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  readSession,
  setSession,
  clearSession,
  setCachedProfile,
  setCachedAvatar,
  writeSession,
  withSessionLock,
} from "../src/lib/auth";
import { request, logoutSession, retrySeconds } from "../src/lib/apiClient";
import { loginAccount } from "../src/features/auth/authApi";
import { loadProfile, updateSessionOrganization } from "../src/lib/useSession";
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
test("T07: late cache and login response cannot restore a logged out generation", async () => {
  await setSession("a", "r");
  const generation = readSession().generation;
  await clearSession();
  await setCachedProfile(
    { id: "u", email: "a@b.test", display_name: "A", memberships: [] },
    generation,
  );
  assert.equal(readSession().profile, undefined);
  const original = fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw new Error("must not send");
  };
  try {
    await assert.rejects(
      loginAccount(
        { email: "a@b.test", password: "12345678" },
        undefined,
        generation,
      ),
    );
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = original;
  }
});

test("a profile read begun before the save preserves the saved description and highest cover revision", async () => {
  await setSession("access", "refresh");
  const { generation } = readSession();
  const first = {
    organization_id: "org-a",
    name: "A",
    slug: "a",
    roles: ["OWNER"],
    description: "old",
  };
  const other = { ...first, organization_id: "org-b" };
  const profile = {
    id: "actor",
    email: "a@example.test",
    display_name: "A",
    memberships: [first, other],
  };
  await setCachedProfile(profile, generation);
  const original = fetch;
  let release!: (value: Response) => void;
  globalThis.fetch = () =>
    new Promise<Response>((resolve) => {
      release = resolve;
    });
  try {
    const pending = loadProfile();
    const cover = {
      url: "https://res.cloudinary.com/demo/cover.png",
      revision: "9007199254740993",
    };
    await updateSessionOrganization(
      generation,
      profile.id,
      first.organization_id,
      { cover, description: null },
    );
    await updateSessionOrganization(
      generation,
      profile.id,
      first.organization_id,
      {
        cover: { url: null, revision: "9007199254740992" },
      },
    );
    assert.deepEqual(readSession().profile?.memberships[0], {
      ...first,
      description: null,
      cover,
    });
    release(Response.json(profile));
    const returned = await pending;
    assert.deepEqual(returned.memberships[0], {
      ...first,
      description: null,
      cover,
    });
    assert.deepEqual(
      readSession().profile?.memberships[0],
      returned.memberships[0],
    );
    assert.equal(returned.memberships[1].description, "old");

    globalThis.fetch = async () => Response.json(profile);
    assert.equal((await loadProfile()).memberships[0].description, "old");
    await setSession("new-access", "new-refresh");
    await setCachedProfile(profile);
    await updateSessionOrganization(
      generation,
      profile.id,
      first.organization_id,
      { description: "old login" },
    );
    assert.equal(readSession().profile?.memberships[0].description, "old");
  } finally {
    globalThis.fetch = original;
  }
});
test("avatar commits and password cleanup are scoped to the originating login", async () => {
  await setSession("first", "refresh-first");
  const first = readSession().generation;
  const profile = {
    id: "first",
    email: "first@example.test",
    display_name: "First",
    memberships: [],
  };
  const avatar = {
    url: "https://res.cloudinary.com/example/avatar.png",
    revision: "2",
  };
  await setCachedProfile(
    { ...profile, display_name: "Updated profile", avatar },
    first,
  );
  await setCachedAvatar(profile, { url: null, revision: "1" }, first);
  assert.equal(readSession().profile?.display_name, "Updated profile");
  assert.deepEqual(readSession().profile?.avatar, avatar);

  await setSession("second", "refresh-second");
  const second = { ...profile, id: "second" };
  await setCachedProfile(second);
  await setCachedAvatar(profile, avatar, first);
  assert.equal(await clearSession(first), false);
  assert.deepEqual(readSession().profile, second);
  assert.equal(readSession().access, "second");
});
test("T07: logout uses current Bearer and refresh pair and clears local record on upstream failure", async () => {
  await setSession("access", "refresh");
  const original = fetch;
  let header = "",
    proof = "";
  globalThis.fetch = async (_url, init) => {
    header = new Headers(init?.headers).get("authorization")!;
    proof = JSON.parse(init?.body as string).refresh_token;
    return Response.json(
      { error: { code: "UPSTREAM_UNAVAILABLE" } },
      { status: 502 },
    );
  };
  try {
    await assert.rejects(logoutSession());
    assert.equal(header, "Bearer access");
    assert.equal(proof, "refresh");
    assert.equal(readSession().access, null);
  } finally {
    globalThis.fetch = original;
  }
});
test("T06: retry still 401 ends in finite anonymous state; later login can refresh again", async () => {
  const original = fetch;
  let rotations = 0;
  globalThis.fetch = async (url) =>
    String(url).endsWith("/auth/refresh")
      ? (rotations++,
        Response.json({
          access_token: "new",
          refresh_token: "next",
          expires_in: 900,
        }))
      : Response.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 });
  try {
    for (let i = 0; i < 2; i++) {
      await setSession("old", "refresh");
      await assert.rejects(request("/users/me"));
      assert.equal(readSession().access, null);
    }
    assert.equal(rotations, 2);
  } finally {
    globalThis.fetch = original;
  }
});
test("T15: Retry-After delta, HTTP-date, absent, invalid and cap are bounded", () => {
  assert.equal(retrySeconds("42"), 42);
  assert.equal(retrySeconds(null), 60);
  assert.equal(retrySeconds("bad"), 60);
  assert.equal(retrySeconds("9999999"), 3600);
  assert.equal(retrySeconds(new Date(120000).toUTCString(), 60000), 60);
});
test("T06: direct profile 403 clears forbidden session without refresh; network keeps it", async () => {
  const original = fetch;
  let count = 0;
  try {
    await setSession("access", "refresh");
    globalThis.fetch = async () => {
      count++;
      return Response.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
    };
    await assert.rejects(request("/users/me"));
    assert.equal(readSession().access, null);
    assert.equal(count, 1);
    await setSession("access", "refresh");
    globalThis.fetch = async () => {
      throw new Error("network");
    };
    await assert.rejects(request("/users/me"));
    assert.equal(readSession().access, "access");
  } finally {
    globalThis.fetch = original;
  }
});
test("T07: delayed profile cannot repopulate cache after logout; inflight releases for next login", async () => {
  const original = fetch;
  let release!: (value: Response) => void;
  try {
    await setSession("a", "r");
    globalThis.fetch = () =>
      new Promise<Response>((resolve) => {
        release = resolve;
      });
    const pending = loadProfile();
    await clearSession();
    release(
      Response.json({
        id: "old",
        email: "a@b.test",
        display_name: "Old",
        memberships: [],
      }),
    );
    await assert.rejects(pending);
    assert.equal(readSession().profile, undefined);
    await setSession("b", "s");
    globalThis.fetch = async () =>
      Response.json({
        id: "new",
        email: "b@b.test",
        display_name: "New",
        memberships: [],
      });
    assert.equal((await loadProfile()).id, "new");
    assert.equal(readSession().profile?.id, "new");
  } finally {
    globalThis.fetch = original;
  }
});
test("T07: expired access logout refreshes once and retries with current rotated pair", async () => {
  await setSession("expired", "old-refresh");
  const original = fetch;
  const calls: Array<{ url: string; bearer: string | null; proof: string }> =
    [];
  globalThis.fetch = async (url, init) => {
    calls.push({
      url: String(url),
      bearer: new Headers(init?.headers).get("Authorization"),
      proof: JSON.parse(init?.body as string).refresh_token,
    });
    if (String(url).endsWith("/auth/refresh"))
      return Response.json({
        access_token: "current",
        refresh_token: "rotated",
        expires_in: 900,
      });
    if (calls.length === 1)
      return Response.json(
        { error: { code: "UNAUTHENTICATED" } },
        { status: 401 },
      );
    return Response.json({ status: "OK" });
  };
  try {
    await logoutSession();
    assert.equal(calls.length, 3);
    assert.equal(calls[2].bearer, "Bearer current");
    assert.equal(calls[2].proof, "rotated");
    assert.equal(readSession().access, null);
  } finally {
    globalThis.fetch = original;
  }
});
