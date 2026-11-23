import Link from "next/link";
import "./identity.css";
import type { Theme } from "@/lib/theme";
import { authContent } from "@/features/auth/content";
import { accountCopy as copy, type AccountFixture } from "./accountData";
import { AccountIcon } from "./AccountIcon";
import { AccountAvatar } from "./AccountAvatar";

interface IdentityHeaderProps {
  readonly activeHref?: "/me" | "/organizations" | "/me/invitations";
  readonly fixture: AccountFixture;
  readonly theme: Theme | null;
  readonly onToggleTheme: () => void;
  readonly onLogout?: () => void;
  readonly logoutNotice?: string;
  readonly signInHref?: string;
  readonly onChooseAvatar?: () => void;
  readonly avatarBusy?: boolean;
}

export function IdentityHeader({ fixture, theme, onToggleTheme, activeHref = "/me", onLogout, logoutNotice, signInHref, onChooseAvatar, avatarBusy }: IdentityHeaderProps) {
  const loggingOut = fixture.state === "logging_out";
  return <header className="lamu-account-theme lamu-account-header">
    <div className="lamu-account-headerInner">
      <div className="lamu-account-headerLeft">
        <Link href="/" prefetch={false} className="lamu-account-logo" aria-label={authContent.home}>
          <img src={authContent.logo} width={156} height={48} className="lamu-account-lightLogo" alt="Lamu" />
          <img src={authContent.darkLogo} width={156} height={48} className="lamu-account-darkLogo" alt="Lamu" />
        </Link>
        <nav aria-label={copy.navigation} className="lamu-account-navigation">
          <ul>{copy.nav.map((item) => <li key={item.href}><Link href={item.href} prefetch={false} aria-current={item.href === activeHref ? "page" : undefined} aria-disabled={loggingOut || undefined} tabIndex={loggingOut ? -1 : undefined}>{item.label}</Link></li>)}</ul>
        </nav>
      </div>
      <div className="lamu-account-headerRight">
        <button type="button" className="lamu-account-themeToggle" onClick={onToggleTheme} aria-label={authContent.theme}>
          <span aria-hidden="true">{theme === "dark" ? "☀️" : "🌙"}</span><span>{theme === "dark" ? authContent.light : authContent.dark}</span>
        </button>
        {fixture.profile && <div className="lamu-account-userSummary">
          <AccountAvatar size="Small" profile={fixture.profile} onChoose={onChooseAvatar} busy={avatarBusy || loggingOut} />
          <span className="lamu-account-userName">{fixture.profile.displayName}</span>
        </div>}
        {fixture.state === "loading" && <span aria-hidden="true" className="lamu-account-skeleton lamu-account-headerSkeleton" />}
        {(fixture.profile || loggingOut) && <button type="button" className="lamu-account-logout" onClick={onLogout} disabled={loggingOut || !onLogout}>
          <AccountIcon name="logout" /><span>{loggingOut ? copy.loggingOut : copy.logout}</span>
        </button>}
        {signInHref && <Link href={signInHref} className="lamu-account-logout" prefetch={false}>{copy.login}</Link>}
      </div>
    </div>
    {logoutNotice && <p role="status" className="lamu-account-logoutNotice">{logoutNotice}</p>}
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
      .lamu-account-theme .lamu-account-logout, .lamu-account-theme .lamu-account-themeToggle { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 38px; padding: 0 14px; background: var(--bg-base); color: var(--text-sub); border: 1px solid var(--border-subtle); border-radius: var(--radius-pill); font-size: 13.5px; font-weight: 500; white-space: nowrap; }
      .lamu-account-theme .lamu-account-themeToggle:hover { background: var(--surface-subtle); color: var(--text-main); border-color: var(--border-strong); }
      .lamu-account-theme .lamu-account-logout { background: transparent; }
      .lamu-account-logoutNotice { margin: 0 auto; width: min(100%, 1240px); padding: 0 28px 12px; color: var(--accent-text); }
      .lamu-account-theme .lamu-account-logout:hover { background: var(--surface-subtle); color: var(--danger-base); border-color: var(--border-strong); }
      .lamu-account-avatarSmall { display: flex; align-items: center; justify-content: center; flex-shrink: 0; border-radius: var(--radius-pill); background: var(--btn-primary-bg); color: var(--btn-primary-text); font-weight: 700; letter-spacing: -.02em; }
      .lamu-account-skeleton { border-radius: 6px; background: linear-gradient(90deg, var(--surface-subtle) 25%, var(--border-subtle) 50%, var(--surface-subtle) 75%); background-size: 200% 100%; animation: lamu-account-shimmer 1.5s infinite; }
      .lamu-account-headerSkeleton { width: 120px; height: 38px; border-radius: var(--radius-pill); }
      @keyframes lamu-account-shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }
      .lamu-account-header { position: sticky; top: 0; z-index: 50; height: 72px; background: var(--bg-base); border-bottom: 1px solid var(--border-subtle); }
      .lamu-account-headerInner { max-width: 1240px; height: 100%; margin: 0 auto; padding: 0 28px; display: flex; align-items: center; justify-content: space-between; gap: 20px; }
      .lamu-account-headerLeft { display: flex; align-items: center; gap: 36px; min-width: 0; }
      .lamu-account-logo { display: inline-flex; align-items: center; flex-shrink: 0; }
      .lamu-account-logo img { display: block; width: 132px; height: auto; }
      .lamu-account-logo .lamu-account-darkLogo { display: none; }
      [data-theme="dark"] .lamu-account-logo .lamu-account-lightLogo { display: none; }
      [data-theme="dark"] .lamu-account-logo .lamu-account-darkLogo { display: block; }
      .lamu-account-navigation ul { display: flex; align-items: center; gap: 6px; padding: 0; list-style: none; }
      .lamu-account-navigation a { display: inline-flex; padding: 8px 14px; color: var(--text-sub); border-radius: var(--radius-pill); font-size: 14.5px; font-weight: 500; white-space: nowrap; }
      .lamu-account-navigation a:hover, .lamu-account-navigation a[aria-current="page"] { color: var(--text-main); background: var(--surface-subtle); }
      .lamu-account-navigation a[aria-current="page"] { font-weight: 600; }
      .lamu-account-headerRight { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
      .lamu-account-userSummary { display: inline-flex; align-items: center; gap: 10px; padding: 4px 10px 4px 4px; background: var(--surface-subtle); border: 1px solid var(--border-subtle); border-radius: var(--radius-pill); }
      .lamu-account-avatarSmall { width: 32px; height: 32px; font-size: 13px; }
      .lamu-account-userName { max-width: 140px; color: var(--text-main); font-size: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      @media (max-width: 1050px) {
        .lamu-account-headerLeft { gap: 16px; }
        .lamu-account-headerInner { gap: 12px; }
        .lamu-account-headerRight { gap: 8px; }
        .lamu-account-userName { display: none; }
        .lamu-account-userSummary { padding-right: 4px; }
      }
      @media (max-width: 768px) {
        .lamu-account-header { height: auto; min-height: 72px; }
        .lamu-account-headerInner { padding: 12px 18px; flex-wrap: wrap; gap: 12px; }
        .lamu-account-headerLeft { display: contents; }
        .lamu-account-logo { margin-right: auto; }
        .lamu-account-navigation { order: 3; width: 100%; }
        .lamu-account-navigation ul { justify-content: center; flex-wrap: wrap; }
        .lamu-account-navigation a { padding: 7px 14px; font-size: 14px; }
        .lamu-account-headerRight { margin-left: auto; gap: 8px; }
      }
      @media (max-width: 480px) {
        .lamu-account-logo img { width: 112px; }
        .lamu-account-headerRight { gap: 6px; }
        .lamu-account-userSummary:not(:has(button)), .lamu-account-headerSkeleton { display: none; }
        .lamu-account-theme .lamu-account-themeToggle { padding: 0 10px; }
        .lamu-account-theme .lamu-account-logout { padding: 0 10px; font-size: 12.5px; }
      }
      @media (prefers-reduced-motion: reduce) {
        .lamu-account-skeleton { animation: none; }
      }
    `}</style>
  </header>;
}
