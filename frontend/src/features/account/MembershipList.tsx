import Link from "next/link";
import { AccountIcon } from "./AccountIcon";
import { accountCopy as copy, type AccountMembership } from "./accountData";

interface RoleBadgesProps { readonly roles: readonly string[]; }

export function RoleBadges({ roles }: RoleBadgesProps) {
  return <div className="lamu-account-badges">
    {roles.length ? roles.map((role) => <span key={role} className="lamu-account-badge" data-role={role}>
      {(role === "OWNER" || role === "ADMIN") && <span className="lamu-account-roleDot" aria-hidden="true" />}
      {copy.roles[role] ?? role}
    </span>) : <span className="lamu-account-badge">{copy.noRole}</span>}
  </div>;
}

interface MembershipListProps {
  readonly memberships: readonly AccountMembership[];
  readonly locked?: boolean;
}

export function MembershipList({ memberships, locked = false }: MembershipListProps) {
  return <section className="lamu-account-card" aria-labelledby="memberships-heading">
    <div className="lamu-account-orgHeader">
      <h2 id="memberships-heading">{copy.organizations}</h2>
      <Link href="/organizations" prefetch={false} className="lamu-account-viewAll" aria-disabled={locked || undefined} tabIndex={locked ? -1 : undefined}>{copy.viewAll}<AccountIcon name="chevron" size={14} /></Link>
    </div>
    {memberships.length ? <>
      <ul className="lamu-account-orgList">
        {memberships.map((org) => <li key={org.organizationId} className="lamu-account-orgItem">
          <div className="lamu-account-orgInfo"><h3>{org.name}</h3><p>{org.slug}</p></div>
          <div className="lamu-account-orgActions">
            <RoleBadges roles={org.roles} />
            <Link className="lamu-account-openOrg" href={`/organizations/${encodeURIComponent(org.organizationId)}`} prefetch={false} aria-label={`${copy.open}: ${org.name}`} aria-disabled={locked || undefined} tabIndex={locked ? -1 : undefined}>{copy.open}<AccountIcon name="external" size={14} /></Link>
          </div>
        </li>)}
      </ul>
      <div className="lamu-account-orgFooter"><Link href="/me/invitations" prefetch={false} className="lamu-account-invitations" aria-disabled={locked || undefined} tabIndex={locked ? -1 : undefined}>{copy.invitations}<AccountIcon name="arrow" size={15} /></Link></div>
    </> : <div className="lamu-account-empty">
      <span className="lamu-account-emptyIcon"><AccountIcon name="people" size={24} /></span>
      <h3>{copy.emptyTitle}</h3><p>{copy.emptyDescription}</p>
      <div className="lamu-account-emptyActions">
        <Link href="/organizations" prefetch={false} className="lamu-account-create"><AccountIcon name="plus" />{copy.create}</Link>
        <Link href="/me/invitations" prefetch={false} className="lamu-account-viewInvites">{copy.viewInvitations}</Link>
      </div>
    </div>}
  </section>;
}
