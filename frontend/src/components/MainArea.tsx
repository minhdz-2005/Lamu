"use client";

import { usePathname } from "next/navigation";

/** Trang giới thiệu chiếm toàn bề ngang; các trang nghiệp vụ giữ lưới container. */
export function MainArea({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/me") return children;
  const isLanding = pathname === "/";
  return (
    <main id="main" className={isLanding || pathname === "/auth" || pathname === "/me/invitations" || pathname === "/organizations" || /^\/organizations\/[^/]+$/.test(pathname) ? "landing-shell" : "container"}>
      {children}
    </main>
  );
}
