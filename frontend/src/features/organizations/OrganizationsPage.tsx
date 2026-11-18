"use client";

import "@/features/account/identity.css";

import Link from "next/link";
import { useCallback, useState, type CSSProperties } from "react";
import { Banner, Button } from "@/components/ui";
import { AccountIcon } from "@/features/account/AccountIcon";
import { OrganizationList } from "./OrganizationList";
import { CreateOrganizationDialog } from "./CreateOrganizationDialog";
import { organizationsCopy as copy, dialogFixtures, type OrganizationsFixture, type CreateDialogFixture } from "./organizationsData";

interface OrganizationsPageProps {
  readonly fixture: OrganizationsFixture;
  readonly dialogFixture?: CreateDialogFixture;
  readonly createDisabled?: boolean;
  readonly onSubmit?: (name: string, description: string | null) => void;
  readonly onCheck?: () => void;
  readonly onCloseDialog?: () => void;
  readonly onReload?: () => void;
  readonly reloading?: boolean;
}

const pageStyle: CSSProperties = { minHeight: "calc(100svh - 72px)", background: "var(--bg-tint)", color: "var(--text)", font: "15px/1.65 var(--font-sans)" };
const createStyle: CSSProperties = { minHeight: 48, height: 48, borderRadius: 9999, padding: "12px 22px", fontSize: 14.5, gap: 8, border: 0, boxShadow: "var(--neu)" };

export function OrganizationsPage({ fixture, dialogFixture, createDisabled, onSubmit, onCheck, onCloseDialog, onReload, reloading }: OrganizationsPageProps) {
  const [dialogOpen, setDialogOpen] = useState(Boolean(dialogFixture && !onSubmit));
  const openDialog = useCallback(() => setDialogOpen(true), []);
  const closeDialog = () => { setDialogOpen(false); onCloseDialog?.(); };
  const blocked = fixture.state === "unavailable" || fixture.state === "anonymous";

  return <div className="organizations-page identity-page" style={pageStyle}>
    <div className="identity-wrap">
      <header className="identity-heading identity-heading-actions">
        <div style={{ minWidth: 0 }}>
          <h1>Tổ chức <em>của tôi</em></h1>
        </div>
        <div className="identity-actions">
          {fixture.memberships.length > 0 && !blocked && fixture.state !== "error" && (
            <Link href="/me/invitations" prefetch={false} className="btn">{copy.invitations}<AccountIcon name="arrow" size={15} /></Link>
          )}
          <Button variant="primary" style={createStyle} onClick={openDialog} disabled={blocked || fixture.state === "loading" || fixture.state === "error" || createDisabled}><AccountIcon name="plus" size={18} />{copy.create}</Button>
        </div>
      </header>
      {fixture.notice && <div style={{ marginBottom: 24 }}><Banner kind={fixture.notice.kind}>
        <div className="spread" style={{ gap: 12, flexWrap: "wrap" }}>
          <span>{fixture.notice.text}</span>
          {(fixture.state === "error" || fixture.state === "ratelimit") && <Button size="sm" onClick={onReload} disabled={!onReload || reloading} style={{ borderRadius: 9999, color: "inherit" }}><AccountIcon name="reload" size={14} />{copy.retry}</Button>}
          {blocked && <Link href="/auth?next=/organizations" prefetch={false} className="btn btn-sm">Đăng nhập</Link>}
        </div>
      </Banner></div>}
      {!blocked && fixture.state !== "error" && <>
        <OrganizationList memberships={fixture.memberships} loading={fixture.state === "loading"} onCreate={openDialog} createDisabled={createDisabled} />
      </>}
    </div>
    {dialogOpen && !blocked && <CreateOrganizationDialog fixture={dialogFixture ?? dialogFixtures.initial} onClose={closeDialog} onSubmit={createDisabled ? undefined : onSubmit} onCheck={onCheck} onReload={reloading ? undefined : onReload} />}
  </div>;
}
