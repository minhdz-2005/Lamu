export type Theme = "light" | "dark";

/** Cùng namespace với các khóa lưu trữ ở 00 §1 (luma.access, luma.refresh, luma.profile). */
export const THEME_KEY = "luma.theme";

/** Đọc theme đã chọn; chưa chọn thì theo hệ điều hành. */
export function readTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const stored = window.localStorage.getItem(THEME_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Safari chế độ riêng tư chặn localStorage: theme vẫn có hiệu lực tới hết phiên.
  }
}

/** Inline trong <head>: gắn data-theme trước paint để không nhấp nháy theme sai. */
export const THEME_BOOTSTRAP = `(function(){try{var s=localStorage.getItem("${THEME_KEY}");var d=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches;var t=(s==="light"||s==="dark")?s:(d?"dark":"light");document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t;}catch(e){document.documentElement.dataset.theme="light";}})();`;
