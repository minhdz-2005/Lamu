import { AccountIcon } from "./AccountIcon";
import { accountCopy as copy, type AccountProfile } from "./accountData";

interface ProfileSummaryProps {
  readonly profile: AccountProfile;
  readonly locked?: boolean;
}

export function ProfileSummary({ profile, locked = false }: ProfileSummaryProps) {
  return <section className="lamu-account-card" aria-labelledby="profile-heading">
    <div className="lamu-account-profileHeader">
      <h2 id="profile-heading">{copy.profileTitle}</h2>
      <button type="button" className="lamu-account-reload" aria-disabled="true" disabled={locked} title={copy.reloadTitle}>
        <AccountIcon name="reload" size={15} />{copy.reload}
      </button>
    </div>
    <div className="lamu-account-profileGrid">
      <span className="lamu-account-avatarLarge" aria-hidden="true">{profile.initials}</span>
      <dl className="lamu-account-profileDetails">
        <div><dt>{copy.name}</dt><dd>{profile.displayName}</dd></div>
        <div><dt>{copy.email}</dt><dd>{profile.email}</dd></div>
      </dl>
    </div>
  </section>;
}
