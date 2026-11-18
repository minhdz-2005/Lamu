import { request } from "./apiClient";
import { authMode, isIdentityUuid } from "./authMode";
import type { components } from "../../../shared/contracts/http/generated/identity";

type Schemas = components["schemas"];

function validIntent(
  value: unknown,
  mockPath: string,
): value is Schemas["MediaIntent"] {
  const intent = value as Schemas["MediaIntent"];
  if (
    !isIdentityUuid(intent?.intent_id) ||
    typeof intent.cloud_name !== "string" ||
    typeof intent.api_key !== "string" ||
    !intent.api_key ||
    !intent.params ||
    typeof intent.upload_url !== "string"
  )
    return false;
  const { timestamp, public_id, overwrite, upload_preset, signature } =
    intent.params;
  if (
    !Number.isSafeInteger(timestamp) ||
    typeof public_id !== "string" ||
    overwrite !== false ||
    typeof upload_preset !== "string" ||
    typeof signature !== "string"
  )
    return false;
  if (authMode === "mock")
    return (
      intent.upload_url ===
      new URL(`${mockPath}/${intent.intent_id}`, location.origin).href
    );
  return (
    /^[\w-]+$/.test(intent.cloud_name) &&
    intent.upload_url ===
      `https://api.cloudinary.com/v1_1/${intent.cloud_name}/image/upload`
  );
}

export async function uploadMedia(
  path: string,
  mockPath: string,
  file: File,
  revision: string,
  generation: string,
  signal: AbortSignal,
  isCurrent: () => boolean,
) {
  const body: Schemas["MediaIntentRequest"] = { expected_revision: revision };
  const intent = await request<Schemas["MediaIntent"]>(
    `${path}/upload-intents`,
    {
      method: "POST",
      body,
      generation,
      signal,
      validate: (value) => validIntent(value, mockPath),
    },
  );
  if (!isCurrent()) return null;
  const data = new FormData();
  data.append("file", file);
  data.append("api_key", intent.api_key);
  const { timestamp, public_id, overwrite, upload_preset, signature } =
    intent.params;
  for (const [key, value] of Object.entries({
    timestamp,
    public_id,
    overwrite,
    upload_preset,
    signature,
  }))
    data.append(key, String(value));
  try {
    const response = await fetch(intent.upload_url, {
      method: "POST",
      body: data,
      credentials: "omit",
      redirect: "error",
      signal: AbortSignal.any([signal, AbortSignal.timeout(60000)]),
    });
    if (!response.ok) throw new Error();
  } catch {
    throw new Error("Không tải được ảnh lên. Vui lòng chọn ảnh và thử lại.");
  }
  return isCurrent() ? intent.intent_id : null;
}
