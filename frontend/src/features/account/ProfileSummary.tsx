import { AccountIcon } from "./AccountIcon";
import { AccountAvatar } from "./AccountAvatar";
import type { ReactNode } from "react";
import { accountCopy as copy, type AccountProfile } from "./accountData";

interface ProfileSummaryProps {
  readonly profile: AccountProfile;
  readonly locked?: boolean;
  readonly onReload?: () => void;
  readonly onChooseAvatar?: () => void;
  readonly avatarBusy?: boolean;
  readonly children?: ReactNode;
}

export function ProfileSummary({ profile, locked = false, onReload, onChooseAvatar, avatarBusy, children }: ProfileSummaryProps) {
  return <section className="lamu-account-card lamu-account-profile" aria-labelledby="profile-heading">
    <div className="lamu-account-profileHeader">
      <h2 id="profile-heading">{copy.profileTitle}</h2>
      <button type="button" className="lamu-account-reload" disabled={locked || !onReload} onClick={onReload} title={copy.reloadTitle}>
        <AccountIcon name="reload" size={15} />{copy.reload}
      </button>
    </div>
    <div className="lamu-account-profileGrid">
      <AccountAvatar size="Large" profile={profile} onChoose={onChooseAvatar} busy={avatarBusy} />
      <dl className="lamu-account-profileDetails">
        <div><dt>{copy.name}</dt><dd>{profile.displayName}</dd></div>
        <div><dt>{copy.email}</dt><dd>{profile.email}</dd></div>
      </dl>
    </div>
    {children}
  </section>;
}
