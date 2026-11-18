import assert from "node:assert/strict";
import { test } from "node:test";
import { toAccountProfile } from "../src/features/account/accountView";
import { keepNewestAvatar } from "../src/lib/avatar";
import { rawRequest, validProfile } from "../src/lib/apiClient";
import { normalizeOrganizationName } from "../src/features/organizations/createOrganization";
import {
  canRespondToInvitation,
  lastInboxPage,
} from "../src/features/my-invitations/inboxPolicy";

test("maps profile memberships without inferring roles or slugs", () => {
  const id = "b0000000-0000-4000-8000-000000000001";
  const profile = toAccountProfile({
    id,
    display_name: "Nguyễn An",
    email: "an@example.test",
    memberships: [
      {
        organization_id: id,
        name: "Tổ chức",
        slug: "server-assigned",
        roles: [],
      },
    ],
  });
  assert.deepEqual(profile, {
    displayName: "Nguyễn An",
    email: "an@example.test",
    initials: "NA",
    memberships: [
      {
        organizationId: id,
        name: "Tổ chức",
        slug: "server-assigned",
        roles: [],
        description: null,
        cover: { url: null, revision: "0" },
      },
    ],
  });
});

test("membership description and the existing cover URL survive both profile mappings", async () => {
  const row = {
    organization_id: "b0000000-0000-4000-8000-000000000001",
    name: "Tổ chức",
    slug: "to-chuc",
    roles: ["OWNER"],
    description: "Dòng đầu\nDòng sau",
    cover: {
      url: "https://res.cloudinary.com/demo/image/upload/w_1500,h_500/sample.jpg",
      revision: "9007199254740993",
    },
  };
  const incoming = {
    id: "u",
    email: "a@example.test",
    display_name: "A",
    memberships: [row],
  };
  const original = fetch;
  globalThis.fetch = async () => Response.json(incoming);
  try {
    const mapped = await rawRequest<typeof incoming>("/users/me");
    assert.deepEqual(mapped.memberships, [row]);
    assert.equal(
      toAccountProfile(mapped).memberships[0].description,
      row.description,
    );
    assert.deepEqual(toAccountProfile(mapped).memberships[0].cover, row.cover);
    assert.equal(
      validProfile({ ...incoming, memberships: [{ ...row, description: 42 }] }),
      false,
    );
    assert.equal(
      validProfile({
        ...incoming,
        memberships: [{ ...row, cover: { ...row.cover, revision: "-1" } }],
      }),
      false,
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("profile transport preserves avatar revisions and old profiles render initials", async () => {
  const bare = {
    id: "a",
    email: "an@example.test",
    display_name: "Nguyễn An",
    memberships: [],
  };
  const avatar = {
    url: "https://res.cloudinary.com/lamu/avatar.png",
    revision: "9007199254740993",
  };
  const stale = { url: null, revision: "9007199254740992" };
  const incoming = { ...bare, avatar };
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json({ ...incoming, extra: "ignored" });
  try {
    assert.deepEqual(await rawRequest("/users/me"), incoming);
    assert.deepEqual(toAccountProfile(incoming).avatar, avatar);
    assert.equal(toAccountProfile(bare).initials, "NA");
    assert.ok(validProfile(bare));
    assert.ok(
      !validProfile({
        ...bare,
        avatar: { url: "javascript:example", revision: "-1" },
      }),
    );
    assert.deepEqual(
      keepNewestAvatar({ ...bare, avatar: stale }, incoming),
      incoming,
    );
    assert.deepEqual(keepNewestAvatar(bare, incoming), incoming);
    assert.deepEqual(keepNewestAvatar({ ...bare, id: "b" }, incoming), {
      ...bare,
      id: "b",
    });
  } finally {
    globalThis.fetch = original;
  }
});

test("validates and trims only the name sent for auto-slug creation", () => {
  assert.equal(normalizeOrganizationName("  CLB Công nghệ  "), "CLB Công nghệ");
  assert.equal(normalizeOrganizationName("😀".repeat(100)), "😀".repeat(100));
  assert.equal(normalizeOrganizationName(" "), null);
  assert.equal(normalizeOrganizationName("a".repeat(101)), null);
});

test("fresh invite actions enforce PENDING and ORG scope without blocking EVENT decline", () => {
  const organization_id = "b0000000-0000-4000-8000-000000000002";
  const base = { status: "PENDING", organization_id, roles: [] } as const;
  const event = {
    ...base,
    roles: [
      { resource_type: "EVENT", resource_id: organization_id, code: "SPEAKER" },
    ],
  };
  const otherOrg = {
    ...base,
    roles: [{ resource_type: "ORG", resource_id: "wrong-org", code: "ADMIN" }],
  };
  assert.equal(canRespondToInvitation(base, "accept"), true);
  assert.equal(canRespondToInvitation(event, "accept"), false);
  assert.equal(canRespondToInvitation(event, "decline"), true);
  assert.equal(canRespondToInvitation(otherOrg, "accept"), false);
  assert.equal(
    canRespondToInvitation({ ...base, status: "REVOKED" }, "decline"),
    false,
  );
});

test("resolves out-of-bounds inbox pages using the server total", () => {
  assert.equal(lastInboxPage(0, 20), 0);
  assert.equal(lastInboxPage(20, 20), 0);
  assert.equal(lastInboxPage(21, 20), 1);
  assert.equal(lastInboxPage(100, 20), 4);
});
