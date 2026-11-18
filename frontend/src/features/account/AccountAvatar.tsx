"use client";

import { useState } from "react";
import { AccountIcon } from "./AccountIcon";
import type { AccountProfile } from "./accountData";
import "./accountActions.css";

function AvatarImage({ url, initials }: { url: string; initials: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    initials
  ) : (
    <img src={url} alt="" onError={() => setFailed(true)} />
  );
}

export function AccountAvatar({
  profile,
  size,
  onChoose,
  busy,
}: {
  profile: AccountProfile;
  size: "Small" | "Large";
  onChoose?: () => void;
  busy?: boolean;
}) {
  const url = profile.avatar?.url;
  const image = url ? (
    <AvatarImage key={url} url={url} initials={profile.initials} />
  ) : (
    profile.initials
  );
  const className = `lamu-account-avatar lamu-account-avatar${size}`;
  return onChoose ? (
    <button
      className={className}
      type="button"
      onClick={onChoose}
      disabled={busy}
      aria-label="Đổi ảnh đại diện"
      title="Đổi ảnh đại diện"
    >
      {image}
      {size === "Large" && (
        <span className="lamu-account-avatarCamera" aria-hidden="true">
          <AccountIcon name="camera" size={15} />
        </span>
      )}
    </button>
  ) : (
    <span className={className} aria-hidden="true">
      {image}
    </span>
  );
}
