"use client";

import type { components } from "../../../shared/contracts/http/generated/identity";
import { request, type RequestOptions } from "./apiClient";
import { readSession } from "./auth";
import { isIdentityUuid } from "./authMode";
import { ApiException } from "./errors";
import { validCover, validOrganizationDescription } from "./organizationProfile";
import type { IdentityMutation } from "./identityOperation";
import { isIdentityLogoutPending, reloadProfile } from "./useSession";

type Schemas = components["schemas"];
export type Organization = Schemas["Organization"];
type ScopedAssignment = {
  code: string;
  resource_type: string;
  resource_id: string;
};
type Member = Omit<Schemas["OrganizationMembers"]["items"][number], "roles"> & {
  roles: ScopedAssignment[];
};
export type OrganizationMembers = Omit<
  Schemas["OrganizationMembers"],
  "items"
> & { items: Member[] };
export type OrganizationInvitations = Schemas["OrganizationInvitations"];
export type OrganizationInvitationSent = Schemas["OrganizationInvitationSent"];
export type RoleAssignment = Schemas["RoleAssignment"];
export type Invitations = Schemas["Invitations"];
export type Invitation = Schemas["Invitation"];
export type InvitationCreated = Schemas["InvitationCreated"];
export type InvitationRevoked = Schemas["InvitationRevoked"];
export type InvitationAccepted = Schemas["InvitationAccepted"];
export type InvitationDeclined = Schemas["InvitationDeclined"];
export type OrganizationCreated = Schemas["OrganizationCreatedResult"];

type Dictionary = Record<string, unknown>;
const obj = (value: unknown): value is Dictionary =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const str = (value: unknown): value is string => typeof value === "string";
const oneOf = (value: unknown, choices: readonly string[]) =>
  str(value) && choices.includes(value);
const ints = (n: unknown, min: number, max = Number.MAX_SAFE_INTEGER) =>
  typeof n === "number" && Number.isSafeInteger(n) && n >= min && n <= max;
const timestamp = (value: unknown) =>
  str(value) &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i.test(
    value,
  ) &&
  Number.isFinite(Date.parse(value));

function roles(value: unknown, orgId?: string) {
  if (!Array.isArray(value) || value.length > 100) return false;
  const unique = new Set<string>();
  for (const role of value) {
    if (
      !obj(role) ||
      !str(role.code) ||
      !role.code ||
      !str(role.resource_type) ||
      !role.resource_type ||
      !isIdentityUuid(role.resource_id)
    )
      return false;
    if (orgId !== undefined) {
      const valid =
        role.resource_type === "ORG"
          ? role.resource_id === orgId && oneOf(role.code, ["OWNER", "ADMIN"])
          : role.resource_type === "EVENT" &&
            oneOf(role.code, ["SPEAKER", "ATTENDEE"]);
      if (!valid) return false;
    }
    const key = `${role.code}:${role.resource_type}:${role.resource_id}`;
    if (unique.has(key)) return false;
    unique.add(key);
  }
  return true;
}

function invitation(
  value: unknown,
): value is Dictionary & { organization_id: string } {
  return (
    obj(value) &&
    isIdentityUuid(value.id) &&
    isIdentityUuid(value.organization_id) &&
    isIdentityUuid(value.inviter_user_id) &&
    roles(value.roles, value.organization_id) &&
    oneOf(value.status, [
      "PENDING",
      "ACCEPTED",
      "DECLINED",
      "REVOKED",
      "EXPIRED",
    ]) &&
    timestamp(value.created_at) &&
    timestamp(value.expires_at) &&
    (value.processed_at === null || timestamp(value.processed_at))
  );
}

function page(
  value: unknown,
  limit: number,
  offset: number,
  validItem: (item: unknown) => boolean,
) {
  return (
    obj(value) &&
    value.limit === limit &&
    value.offset === offset &&
    ints(value.limit, 1, 100) &&
    ints(value.offset, 0, 2147483647) &&
    ints(value.total, 0) &&
    Array.isArray(value.items) &&
    value.items.length <= limit &&
    value.items.every(validItem)
  );
}

async function call<T>(
  path: string,
  valid: (value: unknown) => boolean,
  options: RequestOptions,
): Promise<T> {
  const generation = options.generation ?? readSession().generation;
  try {
    return await request<T>(path, { ...options, generation, validate: valid });
  } catch (error) {
    if (
      error instanceof ApiException &&
      error.status === 403 &&
      !options.signal?.aborted &&
      readSession().generation === generation
    ) {
      void reloadProfile().catch(() => {});
    }
    throw error;
  }
}

function mutation<T>(
  method: IdentityMutation<T>["method"],
  path: string,
  valid: (value: unknown) => boolean,
  body?: unknown,
): IdentityMutation<T> {
  return {
    method,
    path,
    body,
    send: async (record, signal) => {
      if (isIdentityLogoutPending(record.generation))
        throw new ApiException("SESSION_LOGGING_OUT", "", 409, "");
      return call(record.path, valid, {
        method: record.method,
        body: record.body === undefined ? undefined : JSON.parse(record.body),
        headers: { "Idempotency-Key": record.key },
        generation: record.generation,
        signal,
      });
    },
  };
}

function id(value: string) {
  if (!isIdentityUuid(value)) throw new ApiException("NOT_FOUND", "", 404, "");
  return encodeURIComponent(value.toLowerCase());
}
const orgPath = (orgId: string) => `/organizations/${id(orgId)}`;
const inboxPath = "/users/me/invitations";
const query = (limit: number, offset: number) =>
  `?limit=${limit}&offset=${offset}`;

export const identityApi = {
  organization(orgId: string, signal?: AbortSignal) {
    const path = orgPath(orgId);
    return call<Organization>(
      path,
      (value) =>
        obj(value) &&
        value.id === id(orgId) &&
        str(value.name) &&
        str(value.slug) &&
        validCover(value.cover) &&
        validOrganizationDescription(value.description) &&
        Array.isArray(value.my_roles) &&
        value.my_roles.every((role) =>
          oneOf(role, ["OWNER", "ADMIN", "SPEAKER", "ATTENDEE"]),
        ),
      { signal },
    );
  },
  updateOrganizationDescription(
    orgId: string, description: Schemas["UpdateOrganizationDescription"]["description"], generation: string,
  ) {
    const body: Schemas["UpdateOrganizationDescription"] = { description };
    return call<Schemas["OrganizationDescriptionResult"]>(
      orgPath(orgId),
      (value) => obj(value) && validOrganizationDescription(value.description),
      { method: "PATCH", body, generation },
    );
  },
  members(orgId: string, limit: number, offset: number, signal?: AbortSignal) {
    return call<OrganizationMembers>(
      `${orgPath(orgId)}/members${query(limit, offset)}`,
      (value) =>
        page(
          value,
          limit,
          offset,
          (item) =>
            obj(item) &&
            isIdentityUuid(item.user_id) &&
            str(item.display_name) &&
            oneOf(item.status, ["ACTIVE", "INACTIVE"]) &&
            roles(item.roles),
        ),
      { signal },
    );
  },
  sentInvitations(
    orgId: string,
    limit: number,
    offset: number,
    signal?: AbortSignal,
  ) {
    return call<OrganizationInvitations>(
      `${orgPath(orgId)}/members/invitations${query(limit, offset)}`,
      (value) =>
        page(
          value,
          limit,
          offset,
          (item) =>
            invitation(item) &&
            item.organization_id === id(orgId) &&
            isIdentityUuid(item.invitee_user_id) &&
            str(item.invitee_display_name) &&
            str(item.invitee_email),
        ),
      { signal },
    );
  },
  inbox(limit: number, offset: number, signal?: AbortSignal) {
    return call<Invitations>(
      inboxPath + query(limit, offset),
      (value) =>
        page(
          value,
          limit,
          offset,
          (item) =>
            invitation(item) &&
            str(item.organization_name) &&
            str(item.organization_slug),
        ),
      { signal },
    );
  },
  createOrganization(name: string, description?: string | null) {
    const body: Schemas["CreateOrganization"] = {
      name: name.trim(),
      ...(description ? { description } : {}),
    };
    return mutation<OrganizationCreated>(
      "POST",
      "/organizations",
      (value) => obj(value) && isIdentityUuid(value.organization_id),
      body,
    );
  },
  replaceRoles(orgId: string, userId: string, assignments: RoleAssignment[]) {
    return mutation<Schemas["LoggedOut"]>(
      "PUT",
      `${orgPath(orgId)}/members/${id(userId)}/roles`,
      (value) => obj(value) && value.status === "OK",
      { roles: assignments },
    );
  },
  invite(orgId: string, email: string, assignments: RoleAssignment[]) {
    return mutation<InvitationCreated>(
      "POST",
      `${orgPath(orgId)}/members/invitations`,
      (value) =>
        obj(value) &&
        isIdentityUuid(value.invitation_id) &&
        value.status === "PENDING" &&
        timestamp(value.expires_at),
      { email: email.trim().toLowerCase(), roles: assignments },
    );
  },
  revoke(orgId: string, invitationId: string) {
    return mutation<InvitationRevoked>(
      "POST",
      `${orgPath(orgId)}/members/invitations/${id(invitationId)}/revoke`,
      (value) =>
        obj(value) &&
        value.invitation_id === id(invitationId) &&
        value.status === "REVOKED",
    );
  },
  invitationAction(invitationId: string, action: "accept" | "decline") {
    return mutation<InvitationAccepted | InvitationDeclined>(
      "POST",
      `${inboxPath}/${id(invitationId)}/${action}`,
      (value) =>
        obj(value) &&
        value.invitation_id === id(invitationId) &&
        (action === "accept"
          ? value.status === "ACCEPTED" && isIdentityUuid(value.membership_id)
          : value.status === "DECLINED"),
    );
  },
};
