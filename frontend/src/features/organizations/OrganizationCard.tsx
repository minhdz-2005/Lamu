"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { Badge, cx } from "@/components/ui";
import { AccountIcon } from "@/features/account/AccountIcon";
import type { AccountMembership } from "@/features/account/accountData";
import { organizationsCopy as copy } from "./organizationsData";

interface OrganizationCardProps { readonly membership: AccountMembership; }

const titleStyle: CSSProperties = { margin: 0, fontSize: 16, fontWeight: 600, color: "var(--text)", lineHeight: 1.65, overflowWrap: "anywhere" };
const slugStyle: CSSProperties = { margin: "3px 0 0", font: "12.5px/1.65 var(--font-mono)", color: "var(--muted)", overflowWrap: "anywhere" };
const openStyle: CSSProperties = { minHeight: 34, height: "auto", padding: "7px 16px", borderRadius: 9999, fontSize: 13.5, fontWeight: 500, background: "var(--bg)", color: "var(--text)", boxShadow: "none", whiteSpace: "nowrap" };

export function OrganizationCard({ membership: org }: OrganizationCardProps) {
  const roles = org.roles.length ? org.roles : [""];
  return <tr className="organizations-row" style={{ borderBottom: "1px solid var(--border)" }}>
    <td className="organizations-cell"><h2 style={titleStyle}>{org.name}</h2><p style={slugStyle}>{org.slug}</p></td>
    <td className="organizations-cell">
      <span className="organizations-role-label muted small">{copy.roles}</span>
      <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
        {roles.map((role) => <span key={role} className="organizations-badge" style={{ display: "inline-flex", background: role === "OWNER" ? "var(--accent-soft)" : role === "ADMIN" ? "var(--secondary-soft)" : "var(--surface-2)", color: role === "OWNER" ? "var(--warn)" : role === "ADMIN" ? "var(--secondary)" : "var(--muted)", borderColor: role === "OWNER" ? "var(--accent-line)" : role === "ADMIN" ? "color-mix(in srgb, var(--secondary) 35%, var(--border))" : "var(--border)", borderRadius: 9999 }}>
          <Badge tone={role === "OWNER" ? "warn" : role === "ADMIN" ? "success" : "muted"}>
            {role ? copy.roleLabels[role] ?? role : copy.noRole}
          </Badge>
        </span>)}
      </div>
    </td>
    <td className="organizations-cell organizations-action">
      <Link href={`/organizations/${encodeURIComponent(org.organizationId)}`} prefetch={false} className={cx("btn", "organizations-open")} style={openStyle} aria-label={`${copy.open}: ${org.name}`}>{copy.open}<AccountIcon name="external" size={14} /></Link>
    </td>
    <style jsx>{`
      .organizations-cell { padding: 20px 24px; vertical-align: middle; border: 0; }
      .organizations-action { text-align: right; }
      .organizations-row:last-child { border-bottom: 0 !important; }
      .organizations-row:hover { background: var(--surface-2); }
      .organizations-role-label { display: none; }
      .organizations-badge :global(.badge) { display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border: 1px solid; border-color: inherit; border-radius: 9999px; background: inherit; color: inherit; font-size: 12px; font-weight: 600; letter-spacing: .02em; white-space: normal; line-height: 1.65; }
      .organizations-badge :global(.badge::before) { width: 6px; height: 6px; opacity: 1; }
      .organizations-action :global(.organizations-open:hover) { border-color: var(--text); }
      .organizations-action :global(.organizations-open:focus-visible) { outline: 2px solid var(--accent); outline-offset: 3px; }
      @media (max-width: 768px) {
        .organizations-row { display: grid; grid-template-columns: minmax(0, 1fr); padding: 20px; gap: 16px; }
        .organizations-cell { display: block; padding: 0; min-width: 0; }
        .organizations-action { text-align: left; }
        .organizations-role-label { display: block; margin-bottom: 6px; }
      }
    `}</style>
  </tr>;
}
