const fs = require("node:fs");
test("Recovery error code emitted by provider is part of canonical consumer contract", () => {
  const doc = JSON.parse(
    fs.readFileSync("shared/contracts/http/identity.openapi.json", "utf8"),
  );
  expect(
    doc.components.schemas.Error.properties.error.properties.code.enum,
  ).toContain("INVALID_RECOVERY");
});
