"use client";

import "@/features/account/identity.css";

import Link from "next/link";
import type { CSSProperties, KeyboardEvent, ReactNode } from "react";
import { Badge, Button, Skeleton } from "@/components/ui";
import { AccountIcon } from "@/features/account/AccountIcon";
import { OrganizationOverview, type OrganizationProfileActions } from "./OrganizationOverview";
import { detailCopy as copy, type DetailPresentation, type DetailState, type OrganizationView } from "./detailData";

export type DetailTab = "overview" | "members" | "sent";

interface OrganizationDetailPageProps {
  readonly orgId: string;
  readonly state: DetailState;
  readonly presentation?: DetailPresentation;
  readonly organization?: OrganizationView;
  readonly profileActions?: OrganizationProfileActions;
  readonly tab?: DetailTab;
  readonly setTab?: (value: DetailTab) => void;
  readonly membersTotal?: number;
  readonly panel?: ReactNode;
  readonly notice?: ReactNode;
  readonly dialog?: ReactNode;
  readonly message?: string;
  readonly onReload?: () => void;
}

const backStyle: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, color: "var(--text-soft)", fontSize: 14, textDecoration: "none" };
const stateCopy = {
  forbidden: [copy.forbidden, copy.forbiddenDescription],
  not_found: [copy.notFound, copy.notFoundDescription],
  error: ["Không tải được tổ chức", "Vui lòng tải lại trang."],
  anonymous: ["Đăng nhập để xem tổ chức", "Phiên đăng nhập của bạn hiện chưa có."],
  unavailable: ["Tài khoản không khả dụng", "Vui lòng đăng nhập bằng tài khoản đang hoạt động."],
} as const;

export function OrganizationDetailPage({ orgId, state, presentation = "member", organization: org, profileActions, tab = "overview", setTab, membersTotal, panel, notice, dialog, message, onReload }: OrganizationDetailPageProps) {
  const tabs: readonly DetailTab[] = presentation === "owner" ? ["overview", "members", "sent"] : ["overview", "members"];
  const navigateTabs = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const index = tabs.indexOf(tab);
    const direction = event.key === "ArrowLeft" ? -1 : 1;
    const next = event.key === "Home" ? tabs[0] : event.key === "End" ? tabs[tabs.length - 1] : tabs[(index + direction + tabs.length) % tabs.length];
    setTab?.(next);
    document.getElementById(`org-detail-tab-${next}`)?.focus();
  };

  return <div className="org-detail-page identity-page" style={{ minHeight: "calc(100svh - 72px)", display: "flex", flexDirection: "column", background: "var(--bg-tint)", color: "var(--text)", font: "15px/1.65 var(--font-sans)" }}>
    <div className="identity-wrap" style={{ flex: 1, width: "100%" }}>
      <nav aria-label={copy.back} className="identity-context"><Link href="/organizations" prefetch={false} style={backStyle}><span style={{ transform: "rotate(180deg)", display: "inline-flex" }}><AccountIcon name="arrow" /></span>{copy.back}</Link></nav>
      {notice}
      {state === "loading" ? <div className="stack" role="status" aria-label={copy.loadingOrganization} aria-busy="true"><Skeleton height={72} /><Skeleton height={320} /></div>
        : state !== "success" ? <section className="card stack" style={{ alignItems: "center", justifyItems: "center", padding: "64px 24px", textAlign: "center", background: "var(--surface-2)", borderRadius: 16 }}>
          <span style={{ color: "var(--danger)" }}><AccountIcon name="lock" size={32} /></span>
          <h1 style={{ fontSize: 24, margin: 0 }}>{stateCopy[state][0]}</h1>
          <p style={{ color: "var(--text-soft)", margin: 0, maxWidth: 480 }}>{message ?? stateCopy[state][1]}</p>
          {state === "anonymous" || state === "unavailable"
            ? <Link className="btn btn-primary" href={`/auth?next=${encodeURIComponent(`/organizations/${orgId}`)}`} prefetch={false}>Đăng nhập</Link>
            : onReload
              ? <Button variant="primary" onClick={onReload}>{copy.reload}</Button>
              : <Link className="btn btn-primary" href="/organizations" prefetch={false}>{copy.back}</Link>}
        </section> : org && <>
          <header className="identity-heading org-detail-heading">
            <div style={{ minWidth: 0 }}>
              <h1>{org.name}</h1>
              <div className="org-detail-meta"><Badge tone={presentation === "owner" ? "warn" : presentation === "admin" ? "success" : "muted"}>{presentation === "owner" ? copy.owner : presentation === "admin" ? copy.admin : copy.ordinaryMember}</Badge>
                <span className="small muted">{copy.slug} <code>{org.slug}</code></span>
              </div>
            </div>
          </header>
            <div className="org-detail-tabs" role="tablist" aria-label={copy.title}>
              {tabs.map((value) => <button key={value} type="button" role="tab" id={`org-detail-tab-${value}`} aria-selected={tab === value} tabIndex={tab === value ? 0 : -1} aria-controls="org-detail-panel" onKeyDown={navigateTabs} onClick={() => setTab?.(value)}>
                <AccountIcon name={value === "members" ? "people" : "notice"} size={18} />{copy[value]}{value === "members" && presentation !== "member" && membersTotal !== undefined && <span style={{ borderRadius: 9999, padding: "1px 8px", fontSize: 11, background: "var(--surface-3)" }}>{membersTotal}</span>}
              </button>)}
            </div>
          <div id="org-detail-panel" role="tabpanel" aria-labelledby={`org-detail-tab-${tab}`}>
            {tab === "overview" ? <OrganizationOverview organization={org} presentation={presentation} actions={profileActions} onMembers={() => setTab?.("members")} /> : panel}
          </div>
          {dialog}
        </>}
    </div>
  </div>;
}
