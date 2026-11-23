"use client";

import { useEffect, useRef, useState } from "react";
import { readSession } from "@/lib/auth";
import { avatarFormats, maxAvatarBytes, validAvatar } from "@/lib/avatar";
import { ApiException } from "@/lib/errors";
import {
  isIdentityLogoutPending,
  reloadProfile,
  updateSessionAvatar,
} from "@/lib/useSession";
import type { MeProfile } from "@/lib/types";
import { commitAvatar, uploadAvatar } from "./avatarApi";

const uncertain = (error: unknown) =>
  error instanceof ApiException && (error.status === 0 || error.status >= 500);

export function useAvatarChange(profile: MeProfile | null, generation: string) {
  const pending = useRef<AbortController | null>(null);
  const [status, setStatus] = useState({
    generation,
    message: "",
    busy: false,
  });
  // A failed reconciliation requires a fresh profile before the next intent.
  const needsReload = useRef<string | null>(null);
  useEffect(
    () => () => {
      pending.current?.abort();
      pending.current = null;
    },
    [generation],
  );

  async function change(file: File) {
    if (
      !profile ||
      pending.current ||
      readSession().generation !== generation ||
      isIdentityLogoutPending(generation)
    )
      return;
    if (
      !avatarFormats.includes(file.type) ||
      file.size === 0 ||
      file.size > maxAvatarBytes
    ) {
      setStatus({
        generation,
        message: "Chọn ảnh JPG, PNG hoặc WebP có dung lượng tối đa 5 MB.",
        busy: false,
      });
      return;
    }
    const controller = new AbortController();
    pending.current = controller;
    const { signal } = controller;
    const isCurrent = () =>
      !signal.aborted &&
      readSession().generation === generation &&
      !isIdentityLogoutPending(generation);
    const setMessage = (message: string) =>
      setStatus({ generation, message, busy: true });
    setMessage("Đang tải ảnh đại diện…");
    let stage = "profile";
    try {
      const current =
        !validAvatar(profile.avatar) || needsReload.current === generation
          ? await reloadProfile(generation)
          : profile;
      if (!isCurrent() || current.id !== profile.id) return;
      if (!validAvatar(current.avatar)) throw new Error();
      needsReload.current = null;
      stage = "upload";
      const intent = await uploadAvatar(
        file,
        current.avatar.revision,
        generation,
        signal,
        isCurrent,
      );
      if (!intent || !isCurrent()) return;
      stage = "commit";
      let avatar;
      try {
        avatar = await commitAvatar(intent, generation, signal);
      } catch (error) {
        if (!uncertain(error) || !isCurrent()) throw error;
        // Committing the same intent returns the original result if it already committed.
        try {
          avatar = await commitAvatar(intent, generation, signal);
        } catch (replayError) {
          if (
            replayError instanceof ApiException &&
            replayError.code === "REVISION_CONFLICT"
          )
            throw replayError;
          throw error;
        }
      }
      if (!isCurrent()) return;
      stage = "sync";
      await updateSessionAvatar(generation, profile.id, avatar);
      await reloadProfile(generation);
      if (isCurrent()) setMessage("Đã cập nhật ảnh đại diện.");
    } catch (error) {
      if (!isCurrent()) return;
      const conflict =
        error instanceof ApiException && error.code === "REVISION_CONFLICT";
      if (conflict || (stage === "commit" && uncertain(error))) {
        needsReload.current = generation;
        try {
          const latest = await reloadProfile(generation);
          if (isCurrent())
            needsReload.current = validAvatar(latest.avatar)
              ? null
              : generation;
        } catch {
          // Keep the current image and require reconciliation before another upload.
        }
        if (isCurrent())
          setMessage(
            conflict
              ? "Ảnh đại diện đã thay đổi ở phiên khác. Vui lòng chọn lại ảnh."
              : "Chưa xác nhận được kết quả lưu ảnh. Hãy kiểm tra ảnh hiện tại trước khi thử lại.",
          );
      } else {
        const messages: Record<string, string> = {
          profile: "Không tải được phiên bản ảnh hiện tại. Vui lòng thử lại.",
          upload: "Không tải được ảnh lên. Vui lòng chọn ảnh và thử lại.",
          commit: "Không lưu được ảnh đại diện. Vui lòng chọn ảnh và thử lại.",
          sync: "Ảnh đã lưu. Không đồng bộ được hồ sơ. Bạn có thể bấm Tải lại.",
        };
        setMessage(messages[stage]);
      }
    } finally {
      if (pending.current === controller) {
        pending.current = null;
        setStatus((previous) => ({ ...previous, busy: false }));
      }
    }
  }
  return {
    busy: status.generation === generation && status.busy,
    message: status.generation === generation ? status.message : "",
    change,
  };
}
