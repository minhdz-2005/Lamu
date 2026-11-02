// Quy ước 00-conventions.md §6: giá là string decimal, thời gian RFC3339, hiển thị vi-VN.

export function formatMoney(value: string | number | null | undefined, currency = "VND"): string {
  if (value === null || value === undefined) return "—";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return String(value);
  if (amount === 0) return "Miễn phí";
  return `${new Intl.NumberFormat("vi-VN").format(amount)} ₫`;
}

const time = new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit" });
const dateOnly = new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${time.format(date)} · ${dateOnly.format(date)}`;
}

export function formatDateTimeWithZone(iso: string | null | undefined, timezone?: string): string {
  const base = formatDateTime(iso);
  if (!iso) return base;
  const zone = timezone && timezone !== "Asia/Ho_Chi_Minh" ? ` (${timezone})` : " (GMT+7)";
  return `${base}${zone}`;
}

export function isPast(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const time = new Date(iso).getTime();
  return Number.isFinite(time) && time < Date.now();
}

/** ms còn lại tới `expires_at`, tối thiểu 0. */
export function msLeft(iso: string | null | undefined): number {
  if (!iso) return 0;
  const time = new Date(iso).getTime();
  if (!Number.isFinite(time)) return 0;
  return Math.max(0, time - Date.now());
}

export function formatCountdown(ms: number): string {
  const total = Math.floor(ms / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  const hours = Math.floor(total / 3600);
  const mm = pad(Math.floor((total % 3600) / 60));
  const ss = pad(total % 60);
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** datetime-local -> RFC3339 với offset +07:00 (quy ước MUST ở 00 §6). */
export function toRfc3339(localValue: string): string | null {
  if (!localValue) return null;
  const date = new Date(localValue);
  if (Number.isNaN(date.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:00+07:00`
  );
}

/** RFC3339 -> giá trị cho <input type="datetime-local">. */
export function toInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** VND input là số nguyên; gửi lên "150000.00" để khớp NUMERIC(12,2). */
export function toDecimal(value: number | string): string {
  const amount = typeof value === "string" ? Number(value.replace(/[^\d]/g, "")) : value;
  if (!Number.isFinite(amount) || amount < 0) return "0.00";
  return `${Math.round(amount)}.00`;
}

const SLUG_RE = /^[a-z0-9](?:-?[a-z0-9]){2,59}$/;

/** Bỏ dấu tiếng Việt + khoảng trắng -> slug khớp SLUG_RE (00 §10). */
export function slugify(value: string): string {
  const latin = value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d");
  const dashed = latin
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 60);
  return dashed.replace(/-+$/, "");
}

export function isValidSlug(value: string): boolean {
  return SLUG_RE.test(value);
}
