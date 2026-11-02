import type { Metadata, Viewport } from "next";

import { Header } from "@/components/Header";
import { MainArea } from "@/components/MainArea";
import { ToastProvider } from "@/components/Toast";
import { THEME_BOOTSTRAP } from "@/lib/theme";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Lamu — Sự kiện hay bắt đầu từ đây",
    template: "%s · Lamu",
  },
  description:
    "Khám phá sự kiện cộng đồng, giữ chỗ và tạo những cuộc gặp gỡ đáng nhớ cùng Lamu.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Serif+Display:ital@0;1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <ToastProvider>
          <a className="skip-link no-print" href="#main">
            Nhảy tới nội dung
          </a>
          <Header />
          <MainArea>{children}</MainArea>
        </ToastProvider>
      </body>
    </html>
  );
}

