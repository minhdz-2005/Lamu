import Link from "next/link";
import type { Theme } from "@/lib/theme";
import { authContent as copy } from "./content";

interface AuthHeaderProps {
  readonly theme: Theme | null;
  readonly onToggleTheme: () => void;
}

export function AuthHeader({ theme, onToggleTheme }: AuthHeaderProps) {
  return <header className="lamu-auth-theme lamu-auth-header">
    <Link href="/" className="lamu-auth-logo" aria-label={copy.home}>
      {/* Source SVG preserves the official mark and Vietnamese wordmark. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="lamu-auth-lightLogo" src={copy.logo} width={195} height={60} alt="Lamu" />
      <img className="lamu-auth-darkLogo" src={copy.darkLogo} width={195} height={60} alt="Lamu" />
    </Link>
    <nav className="lamu-auth-nav" aria-label="Điều hướng chính">
      <Link href="/events">{copy.explore}</Link>
      <Link className="lamu-auth-create" href="/organizer"><span aria-hidden="true">＋</span>{copy.create}</Link>
      <Link className="lamu-auth-loginLink" href="/auth">{copy.login}</Link>
    </nav>
    <button type="button" className="lamu-auth-themeToggle" onClick={onToggleTheme} aria-label={copy.theme}>
      <span aria-hidden="true">{theme === "dark" ? "☀️" : "🌙"}</span>
      <span>{theme === "dark" ? copy.light : copy.dark}</span>
    </button>
    <style>{`
      .lamu-auth-theme {
        --font-main: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        
        /* Light theme tokens */
        --bg: #FFFFFF;
        --bg-subtle: #FAF9F6;
        --surface-subtle: #F7F6F2;
        --card-bg: #FFFFFF;
        --border: #E9E7E0;
        --border-input: #D4D1C7;
        --text-main: #20201D;
        --text-sub: #4F4F49;
        --text-muted: #77766F;
        --btn-primary-bg: #22221F;
        --btn-primary-text: #FFFFFF;
        --btn-primary-hover: #33332D;
        --sage: #49735E;
        --sage-soft: #E9F0E9;
        --accent: #E9A45B;
        --accent-soft: #FDF4E9;
        --error-border: #D9534F;
        --error-bg: #FDF2F2;
        --error-text: #9E2B2B;
        --card-shadow: 0 4px 20px -2px rgba(32, 32, 29, 0.05), 0 2px 6px -1px rgba(32, 32, 29, 0.03);
        --card-radius: 22px;
        --input-radius: 12px;
        --tab-radius: 10px;
      }
      [data-theme="dark"] .lamu-auth-theme {
        --bg: #171815;
        --bg-subtle: #1C1D19;
        --surface-subtle: #272823;
        --card-bg: #20211D;
        --border: #373831;
        --border-input: #46483E;
        --text-main: #F4F2EB;
        --text-sub: #AAA99F;
        --text-muted: #8E8D84;
        --btn-primary-bg: #F3F1E9;
        --btn-primary-text: #171815;
        --btn-primary-hover: #E2DFD5;
        --sage: #A3C4AA;
        --sage-soft: #233127;
        --accent: #EFB876;
        --accent-soft: #382C1D;
        --error-border: #E57373;
        --error-bg: #2E1A1A;
        --error-text: #FCA5A5;
        --card-shadow: 0 8px 30px rgba(0, 0, 0, 0.35);
      }
      .lamu-auth-theme button { font-family: var(--font-main); cursor: pointer; }
      .lamu-auth-theme button:disabled { opacity: .65; cursor: not-allowed; }
      .lamu-auth-theme button:focus-visible, .lamu-auth-theme a:focus-visible, .lamu-auth-theme summary:focus-visible { outline: 2px solid var(--sage); outline-offset: 3px; }
      .lamu-auth-header { max-width: 1200px; min-height: 108px; margin: 0 auto; padding: 24px 20px; display: flex; align-items: center; gap: 16px; background: var(--bg); color: var(--text-main); font: 13.5px/1.5 var(--font-main); }
      .lamu-auth-logo { display: inline-flex; align-items: center; margin-right: auto; flex-shrink: 0; }
      .lamu-auth-logo img { display: block; max-width: 100%; height: auto; }
      .lamu-auth-logo .lamu-auth-darkLogo { display: none; }
      [data-theme="dark"] .lamu-auth-logo .lamu-auth-lightLogo { display: none; }
      [data-theme="dark"] .lamu-auth-logo .lamu-auth-darkLogo { display: block; }
      .lamu-auth-nav { display: flex; align-items: center; gap: 12px; }
      .lamu-auth-nav a { padding: 7px 14px; color: var(--text-sub); text-decoration: none; font-weight: 500; white-space: nowrap; }
      .lamu-auth-nav .lamu-auth-create, .lamu-auth-nav .lamu-auth-loginLink { border: 1px solid var(--border); border-radius: 20px; color: var(--text-main); font-weight: 600; }
      .lamu-auth-nav .lamu-auth-create { display: inline-flex; align-items: center; gap: 6px; background: var(--surface-subtle); }
      .lamu-auth-theme .lamu-auth-themeToggle { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border: 1px solid var(--border); border-radius: 20px; background: var(--surface-subtle); color: var(--text-main); font-size: 13px; font-weight: 500; box-shadow: none; white-space: nowrap; }
      .lamu-auth-theme .lamu-auth-themeToggle:hover, .lamu-auth-nav a:hover { background: var(--surface-subtle); color: var(--text-main); }
      @media (max-width: 640px) {
        .lamu-auth-header { min-height: 88px; padding: 14px 18px; gap: 8px; flex-wrap: wrap; }
        .lamu-auth-logo img { width: 156px; }
        .lamu-auth-nav { order: 3; width: 100%; justify-content: center; gap: 6px; }
        .lamu-auth-nav a { padding: 7px 10px; font-size: 12.5px; }
      }
    `}</style>
  </header>;
}
