const fs = require("node:fs");
const assert = require("node:assert/strict");
const Parser = require("@apidevtools/swagger-parser");
const base = "shared/contracts/http/";
function read(name) {
  return JSON.parse(fs.readFileSync(base + name, "utf8"));
}
function refs(value) {
  if (!value || typeof value !== "object") return;
  for (const [k, v] of Object.entries(value)) {
    if (k === "$ref")
      assert.ok(
        typeof v === "string" && v.startsWith("#/"),
        "Only local document references allowed",
      );
    else refs(v);
  }
}
(async () => {
  const identity = read("identity.openapi.json"),
    gateway = read("gateway.openapi.json");
  refs(identity);
  refs(gateway);
  await Parser.validate(identity);
  await Parser.validate(gateway);
  assert.deepEqual(
    require("./contract-projection.cjs").project(identity),
    gateway,
  );
  console.log(
    "PASS: local references, OpenAPI documents and Gateway projection",
  );
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
