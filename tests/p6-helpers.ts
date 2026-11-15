import { randomUUID } from "node:crypto";
import request from "supertest";
import { pair } from "./helpers";
import { OrganizationsService } from "../services/identity-service/src/modules/organizations/organizations.service";
export type Pair = Awaited<ReturnType<typeof pair>>;
export const orgRole = (org: string, code = "ADMIN") => ({
  code,
  resource_type: "ORG",
  resource_id: org,
});
export async function fixture(p: Pair) {
  const make = () =>
    p.db.user.create({
      data: {
        id: randomUUID(),
        email: randomUUID() + "@p6.test",
        display_name: "P6 synthetic",
        password_hash: "synthetic-not-login",
      },
    });
  const owner = await make(),
    recipient = await make(),
    other = await make();
  for (const u of [owner, recipient, other])
    await p.db.refreshSession.create({
      data: {
        id: u.id,
        user_id: u.id,
        token_hash: randomUUID(),
        expires_at: new Date(Date.now() + 86400000),
      },
    });
  const result = await p.identity
    .get(OrganizationsService)
    .create(owner.id, randomUUID(), { name: "P6", slug: "p6-" + randomUUID() });
  const org = String(result.body.organization_id);
  const post = (
    actor: string,
    path: string,
    body: object = {},
    key: string | undefined = randomUUID(),
  ) => {
    const r = request(p.identity.getHttpServer())
      .post(path)
      .set("X-User-Id", actor)
      .set("X-Session-Id", actor);
    if (key) r.set("Idempotency-Key", key);
    return r.send(body);
  };
  const invite = (roles: unknown[] = [orgRole(org)], key = randomUUID()) =>
    post(
      owner.id,
      `/organizations/${org}/members/invitations`,
      { email: recipient.email, roles },
      key,
    );
  const action = (
    actor: string,
    id: string,
    kind = "accept",
    key = randomUUID(),
    body: object = {},
  ) => post(actor, `/users/me/invitations/${id}/${kind}`, body, key);
  const revoke = (id: string, key = randomUUID()) =>
    post(
      owner.id,
      `/organizations/${org}/members/invitations/${id}/revoke`,
      {},
      key,
    );
  return { owner, recipient, other, org, post, invite, action, revoke };
}
