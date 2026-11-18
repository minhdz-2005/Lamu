import { request } from "@/lib/apiClient";
import { validAvatar } from "@/lib/avatar";
import { uploadMedia } from "@/lib/mediaUpload";
import type { Avatar } from "@/lib/types";
import type { components } from "../../../../shared/contracts/http/generated/identity";

type Schemas = components["schemas"];

export function uploadAvatar(
  file: File, revision: string, generation: string, signal: AbortSignal, isCurrent: () => boolean,
) {
  return uploadMedia("/users/me/avatar", "/api/mock-avatar", file, revision, generation, signal, isCurrent);
}

export function commitAvatar(
  intentId: string,
  generation: string,
  signal: AbortSignal,
) {
  const body: Schemas["MediaCommitRequest"] = { intent_id: intentId };
  return request<Avatar>("/users/me/avatar", {
    method: "PUT",
    body,
    generation,
    signal,
    validate: (value) => validAvatar(value) && value.url !== null,
  });
}
