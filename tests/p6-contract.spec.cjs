const fs = require("node:fs");
const Ajv = require("ajv");
const formats = require("ajv-formats");
const read = (name) =>
  JSON.parse(
    fs.readFileSync("shared/contracts/http/" + name + ".openapi.json", "utf8"),
  );
describe("P6 approved invitation contract", () => {
  it("declares six authenticated operations and four idempotent commands with explicit responses", () => {
    const doc = read("identity"),
      gateway = read("gateway");
    for (const [path, method, status] of [
      ["/organizations/{orgId}/members/invitations", "post", "201"],
      ["/organizations/{orgId}/members/invitations", "get", "200"],
      ["/users/me/invitations", "get", "200"],
      ["/users/me/invitations/{id}/accept", "post", "200"],
      ["/users/me/invitations/{id}/decline", "post", "200"],
      ["/organizations/{orgId}/members/invitations/{id}/revoke", "post", "200"],
    ]) {
      const op = doc.paths[path]?.[method];
      expect(op).toBeDefined();
      expect(op.responses[status]).toBeDefined();
      expect(op["x-gateway-auth"]).toBe(true);
      expect(gateway.paths["/api" + path][method].security).toEqual([
        { bearerAuth: [] },
      ]);
      if (method === "post")
        expect(
          op.parameters.some((p) => p.name === "Idempotency-Key" && p.required),
        ).toBe(true);
    }
  });
  it("limits contact data to sent invitation items and marks the sent read no-store", () => {
    const doc = read("identity");
    const gateway = read("gateway");
    const path = "/organizations/{orgId}/members/invitations";
    const list = doc.paths[path].get;
    expect(list).not.toHaveProperty("requestBody");
    expect(
      list.parameters.filter((p) => p.in === "query").map((p) => p.name),
    ).toEqual(["limit", "offset"]);
    expect(list.responses["200"].headers["Cache-Control"].schema.enum).toEqual([
      "no-store",
    ]);
    expect(gateway.paths["/api" + path].get.responses["200"]).toEqual(
      list.responses["200"],
    );
    const ajv = new Ajv({ strict: false });
    formats(ajv);
    const sent = ajv.compile({
      components: doc.components,
      $ref: "#/components/schemas/OrganizationInvitationSent",
    });
    const uuid = "d54b23c8-24c2-49d8-af2a-350ba78e16cf";
    const sample = {
      id: uuid,
      organization_id: uuid,
      inviter_user_id: uuid,
      invitee_user_id: uuid,
      invitee_display_name: "Test Recipient",
      invitee_email: "recipient@example.test",
      roles: [],
      status: "PENDING",
      created_at: "2026-11-18T00:00:00Z",
      expires_at: "2026-11-25T00:00:00Z",
      processed_at: null,
    };
    expect(sent(sample)).toBe(true);
    expect(sent({ ...sample, invitee_email: "invalid" })).toBe(false);
    expect(sent({ ...sample, password_hash: "invalid" })).toBe(false);
    expect(doc.components.schemas.Invitation.properties).not.toHaveProperty(
      "invitee_email",
    );
  });
  it("rejects client roles at accept and models closed lifecycle and empty inbox", () => {
    const doc = read("identity");
    const ajv = new Ajv({ strict: false });
    formats(ajv);
    const compile = (name) =>
      ajv.compile({
        components: doc.components,
        $ref: "#/components/schemas/" + name,
      });
    const empty = compile("InvitationAction");
    expect(empty({})).toBe(true);
    expect(empty({ roles: [] })).toBe(false);
    const inbox = compile("Invitations");
    expect(inbox({ items: [], total: 0, limit: 20, offset: 0 })).toBe(true);
    expect(doc.components.schemas.Invitation.properties.status.enum).toEqual([
      "PENDING",
      "ACCEPTED",
      "DECLINED",
      "REVOKED",
      "EXPIRED",
    ]);
    expect(
      doc.components.schemas.CreateInvitation.properties.roles.items.$ref,
    ).toBe("#/components/schemas/RoleAssignment");
  });
});
