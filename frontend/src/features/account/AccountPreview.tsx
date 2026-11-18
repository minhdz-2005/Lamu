"use client";

import { useSearchParams } from "next/navigation";
import { AccountPage } from "./AccountPage";
import { LiveAccountPage } from "./LiveAccountPage";
import { useState } from "react";
import { avatarFormats, maxAvatarBytes } from "@/lib/avatar";
import { ApiException } from "@/lib/errors";
import { getAccountPreview, type AccountFixture } from "./accountData";
import { PasswordChangeForm } from "./PasswordChangeForm";

interface AccountPagePreviewProps {
  readonly children?: never;
}

/** Development-only fixture URLs, with no controls in the product page. */
export function AccountPagePreview({}: AccountPagePreviewProps = {}) {
  const params = useSearchParams();
  const fixture = getAccountPreview(params.get("accountPreview"));
  return fixture ? (
    <InteractivePreview key={params.get("accountPreview")} fixture={fixture} />
  ) : (
    <LiveAccountPage />
  );
}

function InteractivePreview({ fixture }: { fixture: AccountFixture }) {
  const [avatar, setAvatar] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const view =
    fixture.profile && avatar
      ? {
          ...fixture,
          profile: {
            ...fixture.profile,
            avatar: { url: avatar, revision: "1" },
          },
        }
      : fixture;
  async function select(file: File) {
    if (
      !avatarFormats.includes(file.type) ||
      file.size === 0 ||
      file.size > maxAvatarBytes
    ) {
      setMessage("Chọn ảnh JPG, PNG hoặc WebP có dung lượng tối đa 5 MB.");
      return;
    }
    setBusy(true);
    setMessage("Đang tải ảnh đại diện…");
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setAvatar(reader.result);
      setMessage("Đã cập nhật ảnh đại diện.");
    };
    reader.onerror = () =>
      setMessage("Không tải được ảnh lên. Vui lòng chọn ảnh và thử lại.");
    reader.onloadend = () => setBusy(false);
    reader.readAsDataURL(file);
  }
  return (
    <AccountPage
      preview
      fixture={view}
      avatarBusy={busy}
      avatarMessage={message}
      onAvatarFile={fixture.profile ? (file) => void select(file) : undefined}
      passwordForm={
        fixture.profile && (
          <PasswordChangeForm
            change={async ({ current_password }) => {
              await new Promise((resolve) => setTimeout(resolve, 350));
              if (current_password !== "password123")
                throw new ApiException(
                  "CURRENT_PASSWORD_INCORRECT",
                  "",
                  400,
                  "",
                );
            }}
          />
        )
      }
    />
  );
}
