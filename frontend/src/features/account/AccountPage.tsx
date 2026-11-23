"use client";

import { useRef, type ReactNode } from "react";
import { avatarFormats } from "@/lib/avatar";
import "./identity.css";
import { AccountHeader } from "./AccountHeader";
import { type AccountFixture } from "./accountData";
import { ProfileSummary } from "./ProfileSummary";
import { MembershipList } from "./MembershipList";
import { SessionNotice } from "./SessionNotice";
import { AccountSkeleton } from "./AccountSkeleton";

interface AccountPageProps {
  readonly fixture: AccountFixture;
  readonly onReload?: () => void;
  readonly reloading?: boolean;
  readonly onAvatarFile?: (file: File) => void;
  readonly avatarBusy?: boolean;
  readonly avatarMessage?: string;
  readonly passwordForm?: ReactNode;
  readonly preview?: boolean;
  readonly showHeader?: boolean;
}

export function AccountPage({ fixture, onReload, reloading = false, onAvatarFile,
  avatarBusy, avatarMessage, passwordForm, preview, showHeader = true }: AccountPageProps) {
  const locked = fixture.state === "logging_out";
  const picker = useRef<HTMLInputElement>(null);
  const chooseAvatar = onAvatarFile && !locked ? () => picker.current?.click() : undefined;
  return <>
    {showHeader && <AccountHeader previewFixture={preview ? fixture : undefined}
      onChooseAvatar={chooseAvatar} avatarBusy={avatarBusy} />}
    <main id="main" className="landing-shell lamu-account-theme lamu-account-page identity-page">
    <div className="identity-wrap">
      <header className="identity-heading"><h1>Tài khoản <em>của tôi</em></h1></header>
      {fixture.notice && <SessionNotice notice={fixture.notice} onRetry={onReload} reloading={reloading} />}
      {fixture.state === "loading" ? <AccountSkeleton /> : fixture.profile && <div className="lamu-account-content" inert={locked || undefined} aria-busy={locked || undefined}>
        <ProfileSummary profile={fixture.profile} locked={locked || reloading} onReload={onReload}
          onChooseAvatar={chooseAvatar} avatarBusy={avatarBusy}>
          {onAvatarFile && <>
            <input ref={picker} type="file" hidden accept={avatarFormats.join(",")} onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (file) onAvatarFile(file);
            }} />
            <p className="lamu-account-avatarStatus" role="status">{avatarMessage}</p>
          </>}
        </ProfileSummary>
        <MembershipList memberships={fixture.profile.memberships} locked={locked} />
        {passwordForm && <section className="lamu-account-card lamu-account-security" aria-labelledby="account-security">
          <h2 id="account-security">Bảo mật</h2>
          {passwordForm}
        </section>}
      </div>}
    </div>
    <style>{`
      .lamu-account-theme { color: var(--text-main); font: 15px/1.65 var(--font-family); }
      .lamu-account-theme *, .lamu-account-theme *::before, .lamu-account-theme *::after { box-sizing: border-box; }
      .lamu-account-theme h1, .lamu-account-theme h2, .lamu-account-theme h3, .lamu-account-theme p, .lamu-account-theme dl, .lamu-account-theme dd, .lamu-account-theme ul { margin: 0; }
      .lamu-account-theme h1, .lamu-account-theme h2, .lamu-account-theme h3 { font-family: inherit; line-height: 1.65; }
      .lamu-account-theme a { color: inherit; text-decoration: none; }
      .lamu-account-theme button { font-family: inherit; line-height: inherit; cursor: pointer; box-shadow: none; }
      .lamu-account-theme a:focus-visible, .lamu-account-theme button:focus-visible, .lamu-account-theme summary:focus-visible { outline: 2px solid var(--secondary); outline-offset: 3px; }
      .lamu-account-theme svg { flex-shrink: 0; }
      .lamu-account-theme [aria-disabled="true"] { cursor: default; }
      .lamu-account-theme a[aria-disabled="true"] { pointer-events: none; }
      .lamu-account-theme button:disabled { cursor: not-allowed; opacity: .6; }
      .lamu-account-page { min-height: calc(100svh - 72px); background: var(--bg-page); }
      .lamu-account-content { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 3fr); grid-template-rows: auto 1fr; gap: 24px; align-items: start; }
      .lamu-account-content > .lamu-account-memberships { grid-column: 2; grid-row: 1 / span 2; }
      .lamu-account-security { grid-column: 1; }
      .lamu-account-content .lamu-account-card { margin-bottom: 0; }
      .lamu-account-card { padding: 28px; margin-bottom: 32px; background: var(--surface-card); border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); }
      .lamu-account-card h2 { color: var(--text-main); font-size: 21px; font-weight: 700; letter-spacing: -.02em; }
      .lamu-account-profileHeader, .lamu-account-orgHeader { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
      .lamu-account-profileHeader { margin-bottom: 24px; padding-bottom: 18px; border-bottom: 1px solid var(--border-subtle); }
      .lamu-account-theme .lamu-account-reload, .lamu-account-theme .lamu-account-openOrg, .lamu-account-theme .lamu-account-viewInvites, .lamu-account-theme .lamu-account-create { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 44px; padding: 7px 14px; background: var(--bg-base); color: var(--text-sub); border: 1px solid var(--border-subtle); border-radius: var(--radius-pill); font-size: 13.5px; font-weight: 500; white-space: nowrap; }
      .lamu-account-theme .lamu-account-reload:hover, .lamu-account-theme .lamu-account-viewInvites:hover { background: var(--surface-subtle); color: var(--text-main); border-color: var(--border-strong); }
      .lamu-account-profileGrid { display: flex; align-items: flex-start; gap: 24px; }
      .lamu-account-avatarLarge { display: flex; align-items: center; justify-content: center; flex-shrink: 0; border-radius: var(--radius-pill); background: var(--btn-primary-bg); color: var(--btn-primary-text); font-weight: 700; letter-spacing: -.02em; }
      .lamu-account-avatarLarge { width: 72px; height: 72px; font-size: 26px; box-shadow: var(--shadow-sm); }
      .lamu-account-profileDetails { display: grid; grid-template-columns: minmax(0, 1fr); gap: 14px; flex: 1; min-width: 0; }
      .lamu-account-profileDetails > div { min-width: 0; }
      .lamu-account-profileDetails dt { margin-bottom: 4px; color: var(--text-muted); font-size: 13px; font-weight: 600; }
      .lamu-account-profileDetails dd { color: var(--text-main); font-size: 17px; font-weight: 600; letter-spacing: -.01em; overflow-wrap: anywhere; }
      .lamu-account-profileDetails dd { font-size: 16px; }
      .lamu-account-orgHeader { margin-bottom: 16px; }
      .lamu-account-theme .lamu-account-viewAll { display: inline-flex; align-items: center; gap: 4px; min-height: 44px; color: var(--text-sub); font-size: 14px; font-weight: 600; flex-shrink: 0; }
      .lamu-account-theme .lamu-account-viewAll:hover { color: var(--text-main); text-decoration: underline; }
      .lamu-account-orgList { display: flex; flex-direction: column; gap: 12px; padding: 0; list-style: none; }
      .lamu-account-orgItem { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 18px 22px; background: var(--surface-subtle); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); min-width: 0; }
      .lamu-account-orgItem:hover { border-color: var(--border-strong); }
      .lamu-account-orgInfo { display: flex; flex-direction: column; gap: 4px; min-width: 0; flex: 1; }
      .lamu-account-orgInfo h3 { font-size: 16px; font-weight: 700; letter-spacing: -.01em; overflow-wrap: anywhere; }
      .lamu-account-orgInfo p { color: var(--text-muted); font: 13px/1.65 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; overflow-wrap: anywhere; }
      .lamu-account-orgActions { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 8px; max-width: 55%; }
      .lamu-account-badges { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }
      .lamu-account-badge { display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px; border-radius: var(--radius-pill); background: var(--bg-base); color: var(--text-muted); border: 1px solid var(--border-subtle); font-size: 12px; font-weight: 500; letter-spacing: .02em; overflow-wrap: anywhere; }
      .lamu-account-badge[data-role="OWNER"] { background: var(--accent-soft); color: var(--accent-text); border-color: rgb(233 164 91 / 40%); font-weight: 600; }
      .lamu-account-badge[data-role="ADMIN"] { background: var(--sage-soft); color: var(--sage-text); border-color: rgb(73 115 94 / 35%); font-weight: 600; }
      .lamu-account-roleDot { width: 6px; height: 6px; flex-shrink: 0; border-radius: var(--radius-pill); background: currentColor; }
      .lamu-account-theme .lamu-account-openOrg { padding: 0 16px; color: var(--text-main); font-weight: 600; box-shadow: var(--shadow-sm); }
      .lamu-account-theme .lamu-account-openOrg:hover { background: var(--btn-primary-bg); border-color: var(--btn-primary-bg); color: var(--btn-primary-text); }
      .lamu-account-orgFooter { display: flex; align-items: center; justify-content: flex-end; margin-top: 24px; padding-top: 20px; border-top: 1px solid var(--border-subtle); }
      .lamu-account-theme .lamu-account-invitations { display: inline-flex; align-items: center; gap: 6px; min-height: 44px; padding: 8px 16px; border-radius: var(--radius-pill); color: var(--text-sub); font-size: 14.5px; font-weight: 600; }
      .lamu-account-theme .lamu-account-invitations:hover { color: var(--text-main); background: var(--surface-subtle); }
      .lamu-account-empty { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 48px 24px; background: var(--surface-subtle); border: 1px dashed var(--border-strong); border-radius: var(--radius-md); }
      .lamu-account-emptyIcon { display: flex; align-items: center; justify-content: center; width: 52px; height: 52px; margin-bottom: 16px; border-radius: var(--radius-pill); background: var(--bg-base); border: 1px solid var(--border-subtle); color: var(--text-muted); }
      .lamu-account-empty h3 { margin-bottom: 6px; font-size: 17px; font-weight: 700; }
      .lamu-account-empty p { max-width: 380px; margin-bottom: 22px; color: var(--text-sub); font-size: 14px; }
      .lamu-account-emptyActions { display: flex; align-items: center; justify-content: center; gap: 12px; flex-wrap: wrap; }
      .lamu-account-theme .lamu-account-create, .lamu-account-theme .lamu-account-viewInvites { min-height: 44px; padding: 6px 18px; font-size: 14px; font-weight: 600; }
      .lamu-account-theme .lamu-account-create { background: var(--btn-primary-bg); border-color: var(--btn-primary-bg); color: var(--btn-primary-text); }
      .lamu-account-theme .lamu-account-create:hover { background: var(--btn-primary-hover); }
      .lamu-account-notice { display: flex; align-items: flex-start; gap: 14px; padding: 16px 20px; margin-bottom: 24px; border-radius: var(--radius-md); font-size: 14.5px; line-height: 1.55; }
      .lamu-account-notice > svg { margin-top: 1px; }
      .lamu-account-notice[data-kind="info"] { background: var(--surface-subtle); border: 1px solid var(--border-subtle); color: var(--text-sub); }
      .lamu-account-notice[data-kind="danger"] { background: var(--danger-soft); border: 1px solid var(--danger-base); color: var(--danger-text); }
      .lamu-account-notice[data-kind="warning"] { background: var(--accent-soft); border: 1px solid var(--accent-warm); color: var(--accent-text); }
      .lamu-account-noticeContent { min-width: 0; flex: 1; overflow-wrap: anywhere; }
      .lamu-account-noticeContent p { margin-top: 4px; font-size: 13px; }
      .lamu-account-noticeActions { display: flex; gap: 12px; margin-top: 10px; }
      .lamu-account-skeleton { border-radius: 6px; background: linear-gradient(90deg, var(--surface-subtle) 25%, var(--border-subtle) 50%, var(--surface-subtle) 75%); background-size: 200% 100%; animation: lamu-account-shimmer 1.5s infinite; }
      .lamu-account-skeletonHeading { width: 120px; height: 18px; }
      .lamu-account-skeletonButton { width: 80px; height: 36px; border-radius: var(--radius-pill); }
      .lamu-account-skeletonAvatar { width: 72px; height: 72px; flex-shrink: 0; border-radius: var(--radius-pill); }
      .lamu-account-skeletonLabel { width: 120px; max-width: 100%; height: 18px; margin-bottom: 6px; }
      .lamu-account-skeletonValue { width: 100%; max-width: 300px; height: 18px; margin-bottom: 8px; }
      .lamu-account-skeletonOrg { height: 74px; border-radius: var(--radius-md); }
      .lamu-account-srOnly { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }
      @keyframes lamu-account-shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }
      body:has(.lamu-account-page) { background: var(--bg); }
      @media (max-width: 900px) {
        .lamu-account-content { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto; gap: 16px; }
        .lamu-account-content > .lamu-account-memberships { grid-column: auto; grid-row: auto; }
        .lamu-account-profileDetails { width: 100%; }
        .lamu-account-orgItem { flex-direction: column; align-items: stretch; gap: 16px; }
        .lamu-account-orgActions { width: 100%; max-width: none; justify-content: space-between; }
      }
      @media (max-width: 480px) {
        .lamu-account-card { padding: 22px 18px; margin-bottom: 24px; }
        .lamu-account-card h2 { font-size: 19px; }
        .lamu-account-profileHeader, .lamu-account-orgHeader { align-items: flex-start; gap: 10px; }
        .lamu-account-profileGrid { gap: 16px; align-items: flex-start; }
        .lamu-account-avatarLarge { width: 56px; height: 56px; font-size: 20px; }
        .lamu-account-orgHeader { flex-wrap: wrap; }
        .lamu-account-orgItem { padding: 18px 16px; }
        .lamu-account-orgActions { align-items: flex-start; gap: 12px; }
        .lamu-account-empty { padding: 32px 16px; }
        .lamu-account-theme .lamu-account-invitations { padding-inline: 0; }
      }
      @media (prefers-reduced-motion: reduce) {
        .lamu-account-skeleton { animation: none; }
      }
    `}</style>
  </main></>;
}
