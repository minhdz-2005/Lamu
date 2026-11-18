import Ajv, { type ValidateFunction } from "ajv";
import formats from "ajv-formats";
import fs from "node:fs";
import path from "node:path";
import type { Envelope } from "./outbox.repository";

export const EXCHANGE = "lamu.events";
export const QUEUE = "identity.m3.delivery.v1";
export const ROUTES: Readonly<Record<string, string>> = Object.freeze({
  UserRegistered: "identity.user.registered.v1",
  OrganizationCreated: "identity.organization.created.v1",
  MembershipChanged: "identity.membership.changed.v1",
});
const ajv = new Ajv({ strict: true, allErrors: false });
formats(ajv);
const validators = new Map<string, ValidateFunction>();
for (const [type, file] of Object.entries({
  UserRegistered: "user-registered",
  OrganizationCreated: "organization-created",
  MembershipChanged: "membership-changed",
})) {
  const schema = JSON.parse(
    fs.readFileSync(
      path.resolve(
        __dirname,
        `../../../../shared/contracts/events/${file}.v1.schema.json`,
      ),
      "utf8",
    ),
  );
  validators.set(type, ajv.compile(schema));
}
export function validEnvelope(envelope: Envelope): boolean {
  if (!validators.get(envelope.event_type)?.(envelope)) return false;
  const field: Record<string, string> = {
    UserRegistered: "user_id",
    OrganizationCreated: "organization_id",
    MembershipChanged: "membership_id",
  };
  if (envelope.aggregate_id !== envelope.payload[field[envelope.event_type]])
    return false;
  if (envelope.event_type === "MembershipChanged") {
    const roles = envelope.payload.roles as {
      resource_type: string;
      resource_id: string;
    }[];
    if (
      roles.some(
        (r) =>
          r.resource_type === "ORG" &&
          r.resource_id !== envelope.payload.organization_id,
      )
    )
      return false;
  }
  return true;
}
