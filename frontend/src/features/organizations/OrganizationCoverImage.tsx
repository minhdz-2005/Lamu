"use client";

import { useState } from "react";
import { AccountIcon } from "@/features/account/AccountIcon";

export function OrganizationCoverImage({
  url,
  thumbnail,
  preview,
}: {
  url?: string | null;
  thumbnail?: boolean;
  preview?: boolean;
}) {
  const [failedUrl, setFailedUrl] = useState<string>();
  return (
    <div
      aria-hidden={thumbnail || undefined}
      style={{
        width: thumbnail ? "var(--organization-thumbnail-width, 96px)" : "100%",
        height: thumbnail ? 64 : undefined,
        flexShrink: 0,
        aspectRatio: "3 / 1",
        borderRadius: 12,
        overflow: "hidden",
        background: thumbnail ? "var(--secondary-soft)" : "var(--surface-3)",
        color: "var(--secondary)",
        position: "relative",
        display: "grid",
        placeItems: "center",
      }}
    >
      {url && failedUrl !== url ? (
        <img
          src={url}
          alt={
            preview ? "Xem trước ảnh bìa" : thumbnail ? "" : "Ảnh bìa tổ chức"
          }
          onError={() => setFailedUrl(url)}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: preview || thumbnail ? "cover" : "contain",
          }}
        />
      ) : thumbnail ? (
        <AccountIcon name="people" size={24} />
      ) : (
        <span className="muted small">
          {url ? "Không tải được ảnh bìa" : "Chưa có ảnh bìa"}
        </span>
      )}
    </div>
  );
}
