"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { useSession } from "@/lib/useSession";
import { applyTheme, readTheme, type Theme } from "@/lib/theme";

function initials(name: string | undefined): string {
  if (!name) return "•";
  const parts = name.trim().split(/\s+/);
  const last = parts.length > 1 ? parts[parts.length - 1] : parts[0];
  return (parts[0][0] + (last[0] ?? "")).toUpperCase();
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

export function Header() {
  const pathname = usePathname();
  const { state, profile, organizations, logout } = useSession();
  const [theme, setTheme] = useState<Theme | null>(null);
  const [scrolled, setScrolled] = useState(false);

  const authed = state === "AUTHENTICATED";
  const isOrganizer = organizations.length > 0;

  // SSR không biết người dùng chọn gì: chỉ gắn icon sau khi mount, tránh hydration mismatch.
  useEffect(() => setTheme(readTheme()), []);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const toggleTheme = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    applyTheme(next);
    setTheme(next);
  };

  const linkClass = (href: string) => (pathname === href || pathname.startsWith(`${href}/`) ? "active" : undefined);

  // CTA một điểm chạm cho nước đi chính của từng trạng thái tài khoản.
  const cta = !authed
    ? { href: "/auth?next=/organizer", label: "Tạo sự kiện", variant: "btn-accent" }
    : isOrganizer
      ? { href: "/organizer?tab=sell", label: "Bán vé", variant: "btn-primary" }
      : { href: "/organizer", label: "Tổ chức sự kiện", variant: "btn-primary" };

  return (
    <header className="site-header no-print" data-scrolled={scrolled}>
      <div className="inner">
        <Link href="/" className="brand">
          <span className="brand-mark" aria-hidden="true">
            L
          </span>
          Lamu
        </Link>

        <nav className="nav">
          <Link href="/events" className={linkClass("/events")}>
            Khám phá
          </Link>
          {authed && (
            <Link href="/me/tickets" className={linkClass("/me/tickets")}>
              Vé của tôi
            </Link>
          )}
          {authed && isOrganizer && (
            <Link href="/organizer" className={linkClass("/organizer")}>
              Tổ chức
            </Link>
          )}
        </nav>

        <div className="nav-actions">
          <button
            type="button"
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Chuyển sang nền sáng" : "Chuyển sang nền tối"}
            title={theme === "dark" ? "Nền sáng" : "Nền tối"}
          >
            {theme === "dark" ? <SunIcon /> : <MoonIcon />}
          </button>

          <Link href={cta.href} className={`btn ${cta.variant} btn-sm btn-pill`} title="Một bước tới thao tác chính">
            {cta.label}
          </Link>

          {authed ? (
            <>
              <span className="user-chip" title={profile?.email}>
                <span className="avatar" aria-hidden="true">
                  {initials(profile?.display_name)}
                </span>
                <span>{profile?.display_name || "Khách"}</span>
              </span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => void logout()}>
                Đăng xuất
              </button>
            </>
          ) : (
            <Link href="/auth" className={linkClass("/auth")}>
              Đăng nhập
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}


