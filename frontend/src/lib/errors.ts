import type { ApiErrorBody } from "./types";

/** Bảng map mã lỗi -> câu tiếng Việt, theo 00-conventions.md §3. */
const FALLBACK: Record<string, string> = {
  RATE_LIMITED: "Bạn đã thử quá nhiều lần. Vui lòng chờ rồi thử lại.",
  INVALID_RECOVERY:
    "Mã hoặc liên kết khôi phục không còn hợp lệ. Hãy yêu cầu mã mới.",
  UPSTREAM_TIMEOUT:
    "Yêu cầu quá thời gian. Kết quả có thể đã được xử lý; hãy kiểm tra trước khi thử lại.",
  VALIDATION_FAILED: "Thông tin chưa hợp lệ. Vui lòng kiểm tra và thử lại.",
  UNAUTHENTICATED: "Phiên hết hạn, đăng nhập lại.",
  FORBIDDEN: "Tài khoản không được phép thực hiện yêu cầu này.",
  NOT_FOUND: "Không tìm thấy dữ liệu.",
  IDEMPOTENCY_KEY_REQUIRED:
    "Không thể gửi yêu cầu. Hãy tải lại trang rồi thử lại.",
  IDEMPOTENCY_IN_PROGRESS:
    "Yêu cầu vẫn đang được xử lý. Hãy thử lại thao tác này sau ít phút.",
  OPERATION_RETRY_EXPIRED:
    "Đã hết thời hạn thử lại. Hãy tải lại trang để kiểm tra kết quả hiện tại.",
  SESSION_LOGGING_OUT: "Phiên đang đăng xuất. Vui lòng chờ.",
  LAST_OWNER_REQUIRED: "Tổ chức phải có ít nhất một chủ sở hữu đang hoạt động.",
  ALREADY_MEMBER: "Người nhận đã là thành viên của tổ chức.",
  INVITATION_ALREADY_PENDING: "Người nhận đã có lời mời đang chờ xử lý.",
  INVITATION_EXPIRED: "Lời mời đã hết hạn.",
  INVITATION_NOT_PENDING: "Lời mời đã được xử lý.",
  EVENT_SCOPE_UNVERIFIED: "Phạm vi sự kiện của lời mời chưa được xác thực.",
  CONFLICT: "Trạng thái đã thay đổi, tải lại dữ liệu.",
  SOLD_OUT: "Vé này đã hết. Chọn loại vé khác hoặc số lượng ít hơn.",
  SALES_CLOSED: "Sự kiện chưa mở bán hoặc đã đóng bán.",
  TIME_LOCKED: "Đã có người giữ chỗ nên không thể đổi giờ tổ chức sự kiện.",
  EMAIL_TAKEN: "Email này đã có tài khoản.",
  SLUG_TAKEN: "Đường dẫn (slug) này đã tồn tại.",
  ALREADY_CHECKED_IN: "Mã vé này đã được check-in.",
  TICKET_VOIDED: "Vé đã bị hủy vì sự kiện bị hủy.",
  UPSTREAM_UNAVAILABLE: "Một phần dịch vụ đang tạm lỗi, thử lại sau ít phút.",
};

export class ApiException extends Error {
  readonly code: string;
  readonly status: number;
  readonly requestId: string;

  constructor(
    code: string,
    message: string,
    status: number,
    requestId: string,
    readonly retryAfter = 0,
  ) {
    super(message);
    this.name = "ApiException";
    this.code = code;
    this.status = status;
    this.requestId = requestId;
  }

  /** Stable Vietnamese copy; never expose arbitrary upstream messages. */
  get displayMessage(): string {
    return Object.hasOwn(FALLBACK, this.code)
      ? FALLBACK[this.code]
      : "Dịch vụ tạm thời không sẵn sàng. Vui lòng thử lại sau.";
  }
}

export function isApiErrorBody(body: unknown): body is ApiErrorBody {
  if (typeof body !== "object" || body === null) return false;
  const error = (body as { error?: unknown }).error;
  return typeof error === "object" && error !== null && "code" in error;
}

export function isNetworkError(err: unknown): boolean {
  return (
    err instanceof TypeError ||
    (err instanceof ApiException && err.status === 0)
  );
}

export function formatIdentityError(error: unknown): string {
  if (
    error instanceof TypeError ||
    (error instanceof ApiException &&
      error.status === 0 &&
      error.code === "UPSTREAM_UNAVAILABLE")
  )
    return "Không thể kết nối. Hãy kiểm tra kết nối mạng và thử lại.";
  return error instanceof ApiException
    ? error.displayMessage
    : "Không thể hoàn tất yêu cầu. Vui lòng thử lại.";
}

export function describeError(error: unknown): { message: string } {
  return { message: formatIdentityError(error) };
}
