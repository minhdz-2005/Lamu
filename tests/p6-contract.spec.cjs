const fs = require("node:fs");
const Ajv = require("ajv");
const formats = require("ajv-formats");
const read = (name) =>
  JSON.parse(
    fs.readFileSync("shared/contracts/http/" + name + ".openapi.json", "utf8"),
  );
describe("P6 approved invitation contract", () => {
  it("declares five authenticated routes and four idempotent commands with explicit responses", () => {
    const doc = read("identity"),
      gateway = read("gateway");
    for (const [path, method, status] of [
      ["/organizations/{orgId}/members/invitations", "post", "201"],
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
