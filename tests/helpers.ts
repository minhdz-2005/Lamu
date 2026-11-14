import "reflect-metadata";
import { randomUUID } from "node:crypto";
import Ajv from "ajv";
import formats from "ajv-formats";
import fs from "node:fs";
import { validateConfig } from "../shared/libraries/runtime/src";
import { createDatabase } from "../services/identity-service/src/database";
import { createIdentityApp } from "../services/identity-service/src/app";
import { createGatewayApp } from "../gateway/src/app";
export const config = () => validateConfig(process.env, "identity");
export async function pair() {
  const db = createDatabase(process.env.DATABASE_URL!);
  const identity = await createIdentityApp(config(), db);
  await identity.listen(0, "127.0.0.1");
  const gateway = await createGatewayApp({
    ...config(),
    identityUrl: await identity.getUrl(),
  });
  await gateway.init();
  return {
    db,
    identity,
    gateway,
    close: async () => {
      await gateway.close();
      await identity.close();
    },
  };
}
export const registration = () => ({
  email: randomUUID() + "@test.example",
  password: "RealPassword!2026",
  display_name: " Test User ",
});
const doc = JSON.parse(
  fs.readFileSync("shared/contracts/http/identity.openapi.json", "utf8"),
);
const ajv = new Ajv({ strict: false });
formats(ajv);
export function contract(schema: string, body: unknown) {
  const validate = ajv.compile({
    components: doc.components,
    $ref: "#/components/schemas/" + schema,
  });
  expect(validate(body)).toBe(true);
}
