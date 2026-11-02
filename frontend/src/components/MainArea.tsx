"use client";

import { usePathname } from "next/navigation";

/** Trang giới thiệu chiếm toàn bề ngang; các trang nghiệp vụ giữ lưới container. */
export function MainArea({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLanding = pathname === "/";
  return (
    <main id="main" className={isLanding ? "landing-shell" : "container"}>
      {children}
    </main>
  );
}
