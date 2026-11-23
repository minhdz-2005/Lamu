import { request } from "@/lib/apiClient";
import { ApiException } from "@/lib/errors";
import { uploadMedia } from "@/lib/mediaUpload";
import { validCover } from "@/lib/organizationProfile";
import type { Membership } from "@/lib/types";
import type { components } from "../../../../shared/contracts/http/generated/identity";

type Cover = NonNullable<Membership["cover"]>;
type MediaCommitRequest = components["schemas"]["MediaCommitRequest"];
const uncertain = (error: unknown) =>
  error instanceof ApiException && (error.status === 0 || error.status >= 500);
const revisionConflict = (error: unknown) =>
  error instanceof ApiException && error.code === "REVISION_CONFLICT";

export async function updateCover({
  orgId,
  generation,
  file,
  revision,
  isCurrent,
  reconcile,
  onStage,
}: {
  orgId: string;
  generation: string;
  file: File;
  revision: string;
  isCurrent: () => boolean;
  reconcile: () => Promise<Cover>;
  onStage: (stage: "upload" | "commit") => void;
}): Promise<Cover | null> {
  const path = `/organizations/${orgId}/cover`;
  let intentId: string | null;
  try {
    onStage("upload");
    intentId = await uploadMedia(
      path,
      "/api/mock-cover",
      file,
      revision,
      generation,
      AbortSignal.timeout(80000),
      isCurrent,
    );
  } catch (error) {
    if (revisionConflict(error) && isCurrent()) await reconcile();
    throw error;
  }
  if (!intentId || !isCurrent()) return null;

  onStage("commit");
  const body: MediaCommitRequest = { intent_id: intentId };
  const commit = () =>
    request<Cover>(path, {
      method: "PUT",
      generation,
      body,
      validate: (value) => validCover(value) && value.url !== null,
    });
  try {
    return await commit();
  } catch (error) {
    if (!isCurrent()) return null;
    if (revisionConflict(error)) {
      await reconcile();
      throw error;
    }
    if (!uncertain(error)) throw error;

    let replay: Cover | undefined;
    try {
      replay = await commit();
    } catch {
      // The intent replay may also fail after the original commit reached Identity.
    }
    if (!isCurrent()) return null;
    const current = await reconcile();
    if (replay && BigInt(current.revision) >= BigInt(replay.revision))
      return current;
    throw new Error(
      "Chưa xác nhận được kết quả lưu ảnh. Hãy kiểm tra ảnh hiện tại trước khi thử lại.",
    );
  }
}
