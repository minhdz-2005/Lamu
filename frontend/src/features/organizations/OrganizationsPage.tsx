"use client";

import Link from "next/link";
import { useCallback, useState, type CSSProperties } from "react";
import { Banner, Button } from "@/components/ui";
import { AccountIcon } from "@/features/account/AccountIcon";
import { OrganizationList } from "./OrganizationList";
import { CreateOrganizationDialog } from "./CreateOrganizationDialog";
import { organizationsCopy as copy, organizationsFixtures, dialogFixtures, type OrganizationsFixture, type CreateDialogFixture } from "./organizationsData";

interface OrganizationsPageProps {
  readonly fixture?: OrganizationsFixture;
  readonly dialogFixture?: CreateDialogFixture;
}

const pageStyle: CSSProperties = { minHeight: "calc(100svh - 72px)", background: "var(--bg)", color: "var(--text)", font: "15px/1.65 var(--font-sans)" };
const createStyle: CSSProperties = { minHeight: 48, height: 48, borderRadius: 9999, padding: "12px 22px", fontSize: 14.5, gap: 8, border: 0, boxShadow: "var(--neu)" };

export function OrganizationsPage({ fixture = organizationsFixtures.success, dialogFixture }: OrganizationsPageProps) {
  const [dialogOpen, setDialogOpen] = useState(Boolean(dialogFixture));
  const openDialog = useCallback(() => setDialogOpen(true), []);
  const closeDialog = useCallback(() => setDialogOpen(false), []);
  const blocked = fixture.state === "unavailable";

  return <div className="organizations-page" style={pageStyle}>
    <div className="organizations-wrapper">
      <header className="spread" style={{ alignItems: "flex-start", flexWrap: "wrap", gap: 20, marginBottom: 32 }}>
        <div style={{ minWidth: 0 }}>
          <h1 className="organizations-title" style={{ margin: "0 0 6px", fontWeight: 700, lineHeight: 1.65, letterSpacing: "-.025em" }}>{copy.title}</h1>
          <p className="muted" style={{ margin: 0, fontSize: 15 }}>{copy.description}</p>
        </div>
        <Button variant="primary" style={createStyle} onClick={openDialog} disabled={blocked}><AccountIcon name="plus" size={18} />{copy.create}</Button>
      </header>
      {fixture.notice && <div style={{ marginBottom: 24 }}><Banner kind={fixture.notice.kind}>
        <div className="spread" style={{ gap: 12, flexWrap: "wrap" }}>
          <span>{fixture.notice.text}</span>
          {fixture.state === "error" && <Button size="sm" aria-disabled="true" style={{ borderRadius: 9999, color: "inherit" }}><AccountIcon name="reload" size={14} />{copy.retry}</Button>}
        </div>
      </Banner></div>}
      {!blocked && fixture.state !== "error" && <>
        <OrganizationList memberships={fixture.memberships} loading={fixture.state === "loading"} onCreate={openDialog} />
        {fixture.memberships.length > 0 && <div className="row" style={{ justifyContent: "flex-end", marginTop: 24 }}>
          <Link href="/me/invitations" prefetch={false} className="btn organizations-invitations" style={{ padding: "8px 16px", fontSize: 14.5, fontWeight: 500, color: "var(--text-soft)", background: "transparent", borderColor: "transparent", borderRadius: 9999, boxShadow: "none" }}>{copy.invitations}<AccountIcon name="arrow" size={15} /></Link>
        </div>}
      </>}
    </div>
    {dialogOpen && <CreateOrganizationDialog fixture={dialogFixture ?? dialogFixtures.initial} onClose={closeDialog} />}
    <style jsx>{`
      .organizations-wrapper { max-width: 1240px; width: 100%; margin: 0 auto; padding: 40px 28px 80px; }
      .organizations-title { font-size: 32px; }
      .organizations-page :global(button:focus-visible), .organizations-page :global(a:focus-visible) { outline: 2px solid var(--accent); outline-offset: 3px; }
      .organizations-page :global(.organizations-invitations:hover) { text-decoration: underline; }
      @media (max-width: 768px) {
        .organizations-wrapper { padding: 24px 18px 64px; }
        .organizations-title { font-size: 26px; }
      }
    `}</style>
  </div>;
}
