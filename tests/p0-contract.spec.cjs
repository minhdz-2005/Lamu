const fs = require("node:fs");
const path = require("node:path");
const Ajv = require("ajv");
const formats = require("ajv-formats");
const SwaggerParser = require("@apidevtools/swagger-parser");
const root = path.resolve(__dirname, "..");
describe("P0 canonical contracts", () => {
  it("defines all five public operations and health separately", async () => {
    const doc = await SwaggerParser.validate(
      path.join(root, "shared/contracts/http/identity.openapi.json"),
    );
    expect(Object.keys(doc.paths)).toEqual(
      expect.arrayContaining([
        "/auth/login",
        "/auth/logout",
        "/auth/refresh",
        "/auth/register",
        "/healthz",
        "/readyz",
        "/users/me",
      ]),
    );
    for (const p of [
      "/auth/login",
      "/auth/logout",
      "/auth/refresh",
      "/auth/register",
    ]) {
      expect(doc.paths[p].post.responses["200"]).toBeDefined();
      expect(doc.paths[p].post.responses["201"]).toBeUndefined();
    }
    const gw = await SwaggerParser.validate(
      path.join(root, "shared/contracts/http/gateway.openapi.json"),
    );
    expect(gw.paths["/api/users/me"]).toBeDefined();
    expect(Object.keys(gw.paths).some((p) => p.includes("internal"))).toBe(
      false,
    );
    expect(doc.paths["/auth/logout"].post.security).toEqual([]);
    expect(
      doc.paths["/auth/logout"].post.parameters
        .filter((p) => p.required)
        .map((p) => p.name)
        .sort(),
    ).toEqual(["X-Session-Id", "X-User-Id"]);
    expect(
      gw.paths["/api/auth/logout"].post.parameters.some(
        (p) => p.name === "X-User-Id",
      ),
    ).toBe(false);
    expect(gw.paths["/api/auth/logout"].post.security).toEqual([
      { bearerAuth: [] },
    ]);
  });
  it("validates UserRegistered and rejects credentials and incomplete payloads", () => {
    const schema = JSON.parse(
      fs.readFileSync(
        path.join(
          root,
          "shared/contracts/events/user-registered.v1.schema.json",
        ),
        "utf8",
      ),
    );
    const ajv = new Ajv();
    formats(ajv);
    const valid = ajv.compile(schema);
    const event = JSON.parse(
      fs.readFileSync(
        path.join(
          root,
          "shared/contracts/events/fixtures/user-registered.v1.json",
        ),
        "utf8",
      ),
    );
    expect(valid(event)).toBe(true);
    expect(
      valid({ ...event, payload: { ...event.payload, password: "leak" } }),
    ).toBe(false);
    expect(valid({ ...event, version: 2 })).toBe(false);
    expect(
      valid({ ...event, payload: { user_id: event.payload.user_id } }),
    ).toBe(false);
  });
});
