import assert from "node:assert/strict";
import test from "node:test";
import {
  canRevokeInvitation,
  lastPageOffset,
  resolveDetailPresentation,
  supportsOrgEditor,
  type OrganizationMember,
} from "../src/features/organization-detail/detailData";

test("detail permissions use organization roles and stop granting OWNER controls when profile changes", () => {
  assert.equal(resolveDetailPresentation(["OWNER", "ATTENDEE"], ["OWNER"]), "owner");
  assert.equal(resolveDetailPresentation(["OWNER", "ADMIN"], ["ADMIN"]), "admin");
  assert.equal(resolveDetailPresentation(["ADMIN"], ["OWNER"]), "admin");
  assert.equal(resolveDetailPresentation(["SPEAKER"], ["SPEAKER"]), "member");
});

test("role editor preserves EVENT, foreign ORG, and unknown assignments by disabling replacement", () => {
  const member: OrganizationMember = { user_id: "user", display_name: "Member", status: "ACTIVE", roles: [] };
  assert.equal(supportsOrgEditor(member, "org"), true);
  assert.equal(supportsOrgEditor({ ...member, roles: [{ resource_type: "ORG", resource_id: "org", code: "OWNER" }] }, "org"), true);
  for (const role of [
    { resource_type: "EVENT", resource_id: "event", code: "SPEAKER" },
    { resource_type: "ORG", resource_id: "other", code: "ADMIN" },
    { resource_type: "ORG", resource_id: "org", code: "CUSTOM" },
  ]) {
    assert.equal(supportsOrgEditor({ ...member, roles: [role] }, "org"), false);
  }
});

test("out-of-range server page moves to last valid offset", () => {
  assert.equal(lastPageOffset(0, 20, 40), 0);
  assert.equal(lastPageOffset(40, 20, 40), 20);
  assert.equal(lastPageOffset(41, 20, 41), 40);
  assert.equal(lastPageOffset(41, 20, 0), 0);
});

test("only pending, unexpired invitations offer a fresh revoke", () => {
  const expires = "2026-11-18T01:00:00.000Z";
  const deadline = Date.parse(expires);
  assert.equal(canRevokeInvitation("PENDING", expires, deadline - 1), true);
  assert.equal(canRevokeInvitation("PENDING", expires, deadline), false);
  for (const status of ["ACCEPTED", "DECLINED", "REVOKED", "EXPIRED"] as const) {
    assert.equal(canRevokeInvitation(status, expires, deadline - 1), false);
  }
});
