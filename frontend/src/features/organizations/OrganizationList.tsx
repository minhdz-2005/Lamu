"use client";

import type { CSSProperties } from "react";
import { Button, Skeleton } from "@/components/ui";
import Link from "next/link";
import { AccountIcon } from "@/features/account/AccountIcon";
import type { AccountMembership } from "@/features/account/accountData";
import { OrganizationCard } from "./OrganizationCard";
import { organizationsCopy as copy } from "./organizationsData";

interface OrganizationListProps {
  readonly memberships: readonly AccountMembership[];
  readonly loading?: boolean;
  readonly onCreate: () => void;
}

const containerStyle: CSSProperties = { padding: 0, borderRadius: 16, border: "1px solid var(--border)", boxShadow: "var(--neu)", background: "var(--bg)", overflow: "hidden" };
const headingStyle: CSSProperties = { padding: "16px 24px", background: "var(--bg-tint)", color: "var(--muted)", fontSize: 12.5, fontWeight: 600, letterSpacing: ".05em", textTransform: "uppercase", borderBottom: "1px solid var(--border)" };
const pillStyle: CSSProperties = { borderRadius: 9999, minHeight: 44, fontSize: 14, padding: "10px 18px" };

export function OrganizationList({ memberships, loading = false, onCreate }: OrganizationListProps) {
  if (loading) return <div className="card stack" style={{ ...containerStyle, padding: 24, gap: 20 }} role="status" aria-label={copy.loading} aria-busy="true">
    {[0, 1, 2].map((key) => <Skeleton key={key} height={70} />)}
  </div>;
  if (!memberships.length) return <section className="card stack" style={{ ...containerStyle, padding: "64px 24px", alignItems: "center", justifyItems: "center", textAlign: "center", gap: 0 }} aria-labelledby="organizations-empty-title">
    <span style={{ width: 64, height: 64, display: "grid", placeItems: "center", borderRadius: "50%", background: "var(--surface-2)", color: "var(--muted)", marginBottom: 20 }}><AccountIcon name="people" size={28} /></span>
    <h2 id="organizations-empty-title" style={{ margin: "0 0 8px", fontSize: 22, letterSpacing: "-.02em" }}>{copy.empty}</h2>
    <p className="muted" style={{ maxWidth: 400, margin: "0 0 24px", fontSize: 14 }}>{copy.emptyDescription}</p>
    <div className="row" style={{ justifyContent: "center", flexWrap: "wrap", gap: 12 }}>
      <Button variant="primary" style={pillStyle} onClick={onCreate}><AccountIcon name="plus" />{copy.create}</Button>
      <Link className="btn" style={pillStyle} href="/me/invitations" prefetch={false}>{copy.viewInvitations}</Link>
    </div>
  </section>;
  return <div className="card organizations-list" style={containerStyle}>
    <table className="organizations-table" aria-label={copy.title} style={{ width: "100%", tableLayout: "fixed", borderCollapse: "collapse", margin: 0, textAlign: "left" }}>
      <thead><tr>
        <th scope="col" style={{ ...headingStyle, width: "50%" }}>{copy.organization}</th>
        <th scope="col" style={{ ...headingStyle, width: "30%" }}>{copy.roles}</th>
        <th scope="col" style={{ ...headingStyle, width: "20%", textAlign: "right" }}>{copy.action}</th>
      </tr></thead>
      <tbody>{memberships.map((org) => <OrganizationCard key={org.organizationId} membership={org} />)}</tbody>
    </table>
    <style jsx>{`
      @media (max-width: 768px) {
        .organizations-table { display: block; }
        .organizations-table thead { display: none; }
        .organizations-table tbody { display: block; width: 100%; }
      }
    `}</style>
  </div>;
}
