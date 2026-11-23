const fs = require("node:fs");
function project(identity) {
  const gateway = JSON.parse(JSON.stringify(identity));
  gateway.info.title = identity.info.title.replace(/^Identity/, "Gateway");
  gateway.servers = [{ url: "http://localhost:8080" }];
  gateway.paths = Object.fromEntries(
    Object.entries(gateway.paths)
      .filter(([path]) => !path.startsWith("/internal/"))
      .map(([path, item]) => {
        for (const op of Object.values(item)) {
          op.parameters = (op.parameters || []).filter(
            (p) => !["X-User-Id", "X-Session-Id"].includes(p.name),
          );
          op.security = op["x-gateway-auth"] ? [{ bearerAuth: [] }] : [];
        }
        return [path.endsWith("z") ? path : "/api" + path, item];
      }),
  );
  gateway.paths["/readyz"].get.responses["200"].description = "Identity ready";
  return gateway;
}
module.exports = { project };
if (require.main === module) {
  const identity = JSON.parse(
    fs.readFileSync("shared/contracts/http/identity.openapi.json", "utf8"),
  );
  fs.writeFileSync(
    "shared/contracts/http/gateway.openapi.json",
    JSON.stringify(project(identity), null, 2) + "\n",
  );
  console.log("Generated Gateway projection from canonical Identity contract");
}
