const fs = require("node:fs");
const Ajv = require("ajv");
const formats = require("ajv-formats");
const { project } = require("../scripts/contract-projection.cjs");
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
describe("P5 approved contracts", () => {
  it("declares the seven P5 routes, statuses, scope input and idempotency", () => {
    const doc = read("shared/contracts/http/identity.openapi.json");
    for (const p of [
      "/organizations",
      "/organizations/{orgId}",
      "/organizations/{orgId}/members",
      "/organizations/{orgId}/members/{userId}/roles",
      "/public/organizations/{slug}",
      "/internal/authorization/check",
      "/internal/users/{userId}/public-profile",
    ])
      expect(doc.paths[p]).toBeDefined();
    expect(doc.paths["/organizations"].post.responses["201"]).toBeDefined();
    expect(
      doc.paths["/organizations"].post.parameters.some(
        (p) => p.name === "Idempotency-Key" && p.required,
      ),
    ).toBe(true);
    expect(doc.components.schemas.AuthorizationInput.required).toEqual([
      "user_id",
      "organization_id",
      "resource_type",
      "resource_id",
      "permission",
    ]);
    expect(doc.components.schemas.RoleAssignment.required).toEqual([
      "code",
      "resource_type",
      "resource_id",
    ]);
  });
  it("never projects internal paths even when canonical includes them", () => {
    const doc = read("shared/contracts/http/identity.openapi.json");
    doc.paths["/internal/probe"] = {
      get: { responses: { 200: { description: "internal" } } },
    };
    expect(
      Object.keys(project(doc).paths).some((p) => p.includes("/internal/")),
    ).toBe(false);
  });
  it.each(["organization-created", "membership-changed"])(
    "validates %s v1 fixtures and rejects extra/invalid data",
    (name) => {
      const ajv = new Ajv();
      formats(ajv);
      const schema = read(`shared/contracts/events/${name}.v1.schema.json`);
      const valid = ajv.compile(schema);
      const sample = read(`shared/contracts/events/fixtures/${name}.v1.json`);
      expect(valid(sample)).toBe(true);
      expect(valid({ ...sample, version: 2 })).toBe(false);
      expect(
        valid({
          ...sample,
          payload: { ...sample.payload, password: "forbidden" },
        }),
      ).toBe(false);
      if (name === "membership-changed") {
        expect(
          valid({
            ...sample,
            payload: { ...sample.payload, membership_revision: 0 },
          }),
        ).toBe(false);
        expect(
          valid({
            ...sample,
            payload: {
              ...sample.payload,
              roles: [
                {
                  code: "OWNER",
                  resource_type: "EVENT",
                  resource_id: sample.payload.organization_id,
                },
              ],
            },
          }),
        ).toBe(false);
      }
    },
  );
});
