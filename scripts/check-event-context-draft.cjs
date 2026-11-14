// Offline contract/fixture checks only. Does not start a provider or adapter.
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const assert = require("node:assert/strict");
const Parser = require("@apidevtools/swagger-parser");
const Ajv = require("ajv");
const formats = require("ajv-formats");
const base = path.resolve(__dirname, "../shared/contracts/http");
const draftPath = path.join(base, "event-context.draft.openapi.json");
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
function checkRefs(value, allowIdentity) {
  if (!value || typeof value !== "object") return;
  for (const [key, ref] of Object.entries(value)) {
    if (key === "$ref")
      assert.ok(
        typeof ref === "string" &&
          (ref.startsWith("#/") ||
            (allowIdentity &&
              ref === "./identity.openapi.json#/components/schemas/Error")),
        "Unexpected reference; only document refs and canonical Identity Error allowed",
      );
    else checkRefs(ref, allowIdentity);
  }
}
(async () => {
  const draft = read(draftPath);
  checkRefs(draft, true);
  checkRefs(read(path.join(base, "identity.openapi.json")), false);
  assert.equal(draft["x-contract-status"], "DRAFT");
  await Parser.validate(draftPath, { resolve: { http: false } });
  const op =
    draft.paths["/internal/events/{eventId}/authorization-context"].get;
  const ajv = new Ajv({ strict: false });
  formats(ajv);
  const schema = draft.components.schemas.EventAuthorizationContext;
  const valid = ajv.compile(schema);
  const sample =
    op.responses["200"].content["application/json"].examples.existingDraftEvent
      .value;
  assert.ok(valid(sample));
  for (const invalid of [
    null,
    {},
    { event_id: sample.event_id },
    { ...sample, event_id: 1 },
    { ...sample, event_id: "invalid" },
    { ...sample, organization_id: null },
    { ...sample, organization_id: "invalid" },
    { ...sample, allowed: true },
  ])
    assert.equal(valid(invalid), false, "Invalid response must fail schema");
  // Syntax cannot establish trust: a different valid UUID passes the schema.
  // The future adapter must separately compare the requested ID and org.
  assert.ok(valid({ ...sample, event_id: sample.organization_id }));
  const errorDoc = read(path.join(base, "identity.openapi.json"));
  const error = ajv.compile({
    components: errorDoc.components,
    $ref: "#/components/schemas/Error",
  });
  for (const [status, code] of Object.entries({
    400: "VALIDATION_FAILED",
    404: "NOT_FOUND",
    429: "RATE_LIMITED",
    500: "INTERNAL_ERROR",
    503: "SERVICE_UNAVAILABLE",
  })) {
    assert.equal(
      op.responses[status].content["application/json"].schema.$ref,
      "./identity.openapi.json#/components/schemas/Error",
    );
    assert.ok(
      error({
        error: {
          code,
          message: "Synthetic error",
          request_id: sample.event_id,
        },
      }),
    );
  }
  const {
    default: openapiTS,
    astToString,
    COMMENT_HEADER,
  } = await import("openapi-typescript");
  for (const name of ["identity", "event-context.draft"]) {
    const generated =
      COMMENT_HEADER +
      astToString(
        await openapiTS(pathToFileURL(path.join(base, name + ".openapi.json"))),
      );
    const target = path.join(base, "generated", name + ".d.ts");
    assert.equal(
      fs.readFileSync(target, "utf8"),
      generated,
      "Regenerate " + name,
    );
  }
  console.log(
    "PASS: DRAFT OpenAPI/local reference allowlist, valid/invalid fixtures, canonical errors, generated type parity. Real Event provider/adapter NOT RUN.",
  );
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
