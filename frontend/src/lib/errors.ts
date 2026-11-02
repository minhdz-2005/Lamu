import type { ApiErrorBody, ErrorCode } from "./types";

/** Bảng map mã lỗi -> câu tiếng Việt, theo 00-conventions.md §3. */
const FALLBACK: Record<ErrorCode, string> = {
  VALIDATION_FAILED: "Thông tin nhập chưa hợp lệ, kiểm tra lại các trường được đánh dấu.",
  UNAUTHENTICATED: "Phiên hết hạn, đăng nhập lại.",
  FORBIDDEN: "Bạn không có quyền làm việc này trên sự kiện/tổ chức đó.",
  NOT_FOUND: "Không tìm thấy dữ liệu.",
  IDEMPOTENCY_KEY_REQUIRED: "Thiếu khóa chống trùng yêu cầu.",
  CONFLICT: "Trạng thái đã thay đổi, tải lại dữ liệu.",
  SOLD_OUT: "Vé này đã hết. Chọn loại vé khác hoặc số lượng ít hơn.",
  SALES_CLOSED: "Sự kiện chưa mở bán hoặc đã đóng bán.",
  TIME_LOCKED: "Đã có người giữ chỗ nên không đổi được giờ event.",
  EMAIL_TAKEN: "Email này đã có tài khoản.",
  SLUG_TAKEN: "Đường dẫn (slug) này đã tồn tại.",
  ALREADY_CHECKED_IN: "Mã vé này đã được check-in.",
  TICKET_VOIDED: "Vé đã bị hủy vì sự kiện bị hủy.",
  UPSTREAM_UNAVAILABLE: "Một phần dịch vụ đang tạm lỗi, thử lại sau ít phút.",
};

export class ApiException extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly requestId: string;

  constructor(code: ErrorCode, message: string, status: number, requestId: string) {
    super(message);
    this.name = "ApiException";
    this.code = code;
    this.status = status;
    this.requestId = requestId;
  }

  /** message từ server là tiếng Việt thì dùng nguyên văn, không tự soạn lại. */
  get displayMessage(): string {
    const fromServer = this.message && this.message.trim().length > 0;
    return fromServer ? this.message : FALLBACK[this.code];
  }
}

export function isApiErrorBody(body: unknown): body is ApiErrorBody {
  if (typeof body !== "object" || body === null) return false;
  const error = (body as { error?: unknown }).error;
  return typeof error === "object" && error !== null && "code" in error;
}

export function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError || (err instanceof ApiException && err.status === 0);
}

export function describeError(err: unknown): { message: string; requestId?: string } {
  if (err instanceof ApiException) return { message: err.displayMessage, requestId: err.requestId };
  if (err instanceof TypeError) {
    return { message: "Không kết nối được server. Chạy `docker compose up` rồi thử lại." };
  }
  if (err instanceof Error) return { message: err.message };
  return { message: "Đã xảy ra lỗi không xác định." };
}
