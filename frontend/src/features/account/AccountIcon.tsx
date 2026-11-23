import type { ReactNode } from "react";

interface AccountIconProps {
  readonly name: "reload" | "logout" | "external" | "chevron" | "arrow" | "plus" | "people" | "notice" | "lock" | "clock" | "camera";
  readonly size?: number;
  readonly className?: string;
}

const paths: Readonly<Record<AccountIconProps["name"], ReactNode>> = {
  reload: <><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" /></>,
  logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5M21 12H9" /></>,
  external: <><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3" /></>,
  chevron: <path d="m9 18 6-6-6-6" />,
  arrow: <path d="M5 12h14m-7-7 7 7-7 7" />,
  plus: <path d="M12 5v14M5 12h14" />,
  people: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /><circle cx="9" cy="7" r="4" /></>,
  notice: <><circle cx="12" cy="12" r="10" /><path d="M12 8v4m0 4h.01" /></>,
  lock: <><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>,
  clock: <><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></>,
  camera: <><path d="M3 7h4l2-3h6l2 3h4a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z" /><circle cx="12" cy="13" r="3" /></>,
};

export function AccountIcon({ name, size = 16, className }: AccountIconProps) {
  return <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
