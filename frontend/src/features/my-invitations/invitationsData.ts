import type { RoleAssignment } from "@/features/organization-detail/detailData";

export type InvitationStatus = "PENDING" | "ACCEPTED" | "DECLINED" | "REVOKED" | "EXPIRED";
export type InvitationAction = "accept" | "decline";
export type InvitationActionPhase = "normal" | "submitting" | "unknown" | "expired" | "not_pending" | "already_member" | "forbidden";

export interface InboxInvitation {
  readonly id: string;
  readonly organization_id: string;
  readonly organization_name: string;
  readonly organization_slug: string;
  readonly inviter_user_id: string;
  readonly roles: readonly RoleAssignment[];
  readonly status: InvitationStatus;
  readonly created_at: string;
  readonly expires_at: string;
  readonly processed_at: string | null;
  /** Decorative organization monogram; not an avatar or inviter identity. */
  readonly mark: string;
}

export interface InvitationActionPreview {
  readonly invitationId: string;
  readonly action: InvitationAction;
  readonly phase: InvitationActionPhase;
}

export interface InboxFixture {
  readonly state: "success" | "empty" | "loading" | "error" | "rate_limit" | "profile_refresh_error";
  readonly invitations: readonly InboxInvitation[];
  readonly actionPreview?: InvitationActionPreview;
  readonly message?: string;
  readonly blocked?: boolean;
}

export const inboxCopy = {
  title: "Lời mời của tôi", account: "Tài khoản của tôi", context: "Lời mời tham gia",
  description: "Xem và phản hồi lời mời tham gia các tổ chức và sự kiện.",
  reload: "Tải lại", loading: "Đang tải danh sách lời mời…", empty: "Bạn chưa có lời mời nào",
  emptyDescription: "Các lời mời tham gia tổ chức sẽ xuất hiện tại đây.", organizations: "Tổ chức của tôi",
  accept: "Chấp nhận", decline: "Từ chối", open: "Mở tổ chức", details: "Xem chi tiết",
  invitedRoles: "Vai trò được mời", historicalRoles: "Vai trò tại thời điểm mời", noRole: "Không có vai trò quản trị",
  scope: "Phạm vi", orgScope: "Tổ chức (ORG)", eventScope: "Sự kiện (EVENT)", eventBlocked: "Phạm vi sự kiện chưa được tích hợp",
  invitedAt: "Được mời", expiresAt: "Hết hạn", processedAt: "Đã xử lý", unprocessed: "Chưa xử lý",
  invitationId: "Mã lời mời", inviterId: "ID người mời", organizationId: "ID tổ chức", scopeId: "ID phạm vi",
  status: { PENDING: "Đang chờ phản hồi", ACCEPTED: "Đã chấp nhận", DECLINED: "Đã từ chối", REVOKED: "Đã thu hồi", EXPIRED: "Đã hết hạn" } as Readonly<Record<InvitationStatus, string>>,
  terminal: "Không thể phản hồi lại", revokedHint: "Lời mời này không còn hiệu lực do tổ chức đã thu hồi.", expiredHint: "Đã quá thời hạn phản hồi.",
  acceptTitle: "Chấp nhận lời mời?", declineTitle: "Từ chối lời mời?", back: "Quay lại",
  acceptDescription: "Xác nhận tham gia tổ chức với vai trò được mời dưới đây.", declineDescription: "Bạn muốn từ chối lời mời tham gia tổ chức dưới đây?",
  snapshot: "Đây là vai trò tại thời điểm mời, không phải xác nhận quyền hiện tại của bạn.",
  submitting: "Đang xử lý…", unknown: "Chưa xác định được kết quả phản hồi. Vui lòng kiểm tra lại thao tác trước khi tiếp tục.", check: "Kiểm tra lại thao tác",
  error: "Không thể tải danh sách lời mời. Vui lòng thử lại.", rateLimit: "Bạn thao tác quá nhanh. Vui lòng chờ rồi thử lại.",
  expiredError: "Lời mời đã hết hạn. Vui lòng tải lại danh sách.", processedError: "Trạng thái lời mời đã thay đổi. Vui lòng tải lại danh sách.",
  memberError: "Bạn đã là thành viên của tổ chức này. Vui lòng kiểm tra lại thông tin tại Tổ chức của tôi.", forbiddenError: "Bạn không đủ quyền thực hiện thao tác này. Vui lòng tải lại danh sách.",
  profileWarning: "Đã chấp nhận lời mời nhưng chưa tải lại hồ sơ được. Bạn có thể mở tổ chức hoặc tải lại hồ sơ.", reloadProfile: "Tải lại hồ sơ",
  accepted: "Đã chấp nhận lời mời.", declined: "Đã từ chối lời mời.",
  show: "Hiển thị", of: "trên tổng số", invitations: "lời mời", size: "Kích thước", previous: "Trước", next: "Sau", perPage: "/ trang",
} as const;

const orgIds = ["d1a20000-0000-4000-8000-000000000001", "d1a20000-0000-4000-8000-000000000002", "d1a20000-0000-4000-8000-000000000003", "d1a20000-0000-4000-8000-000000000004", "d1a20000-0000-4000-8000-000000000005", "d1a20000-0000-4000-8000-000000000006", "d1a20000-0000-4000-8000-000000000007"] as const;
const orgRole = (index: number, code: string): RoleAssignment => ({ code, resource_type: "ORG", resource_id: orgIds[index] });
const base = { inviter_user_id: "f0000000-0000-4000-8000-000000000001", created_at: "2026-11-14T02:00:00Z", expires_at: "2026-11-21T02:00:00Z", processed_at: null } as const;

export const sampleInvitations: readonly InboxInvitation[] = [
  { ...base, id: "c0000000-0000-4000-8000-000000000001", organization_id: orgIds[0], organization_name: "Nhóm nghiên cứu", organization_slug: "nhom-nghien-cuu", roles: [orgRole(0, "ADMIN")], status: "PENDING", mark: "NC" },
  { ...base, id: "c0000000-0000-4000-8000-000000000002", organization_id: orgIds[1], organization_name: "Cộng đồng sáng tạo", organization_slug: "cong-dong-sang-tao", roles: [orgRole(1, "OWNER")], status: "ACCEPTED", created_at: "2026-11-01T02:00:00Z", expires_at: "2026-11-08T02:00:00Z", processed_at: "2026-11-02T03:30:00Z", mark: "ST" },
  { ...base, id: "c0000000-0000-4000-8000-000000000003", organization_id: orgIds[2], organization_name: "Nhóm học tập", organization_slug: "nhom-hoc-tap", roles: [], status: "PENDING", mark: "HT" },
  { ...base, id: "c0000000-0000-4000-8000-000000000004", organization_id: orgIds[3], organization_name: "Diễn đàn Công nghệ", organization_slug: "dien-dan-cong-nghe", roles: [orgRole(3, "ADMIN"), { code: "SPEAKER", resource_type: "EVENT", resource_id: "e0000000-0000-4000-8000-000000000001" }], status: "PENDING", mark: "CN" },
  { ...base, id: "c0000000-0000-4000-8000-000000000005", organization_id: orgIds[4], organization_name: "Câu lạc bộ cộng đồng", organization_slug: "cau-lac-bo-cong-dong", roles: [orgRole(4, "ADMIN")], status: "DECLINED", processed_at: "2026-11-14T05:30:00Z", mark: "CL" },
  { ...base, id: "c0000000-0000-4000-8000-000000000006", organization_id: orgIds[5], organization_name: "Nhóm kết nối", organization_slug: "nhom-ket-noi", roles: [orgRole(5, "ADMIN")], status: "REVOKED", processed_at: "2026-11-14T08:00:00Z", mark: "KN" },
  { ...base, id: "c0000000-0000-4000-8000-000000000007", organization_id: orgIds[6], organization_name: "Nhóm nghiên cứu mở", organization_slug: "nhom-nghien-cuu-mo", roles: [orgRole(6, "ADMIN")], status: "EXPIRED", created_at: "2026-10-29T02:00:00Z", expires_at: "2026-11-05T02:00:00Z", mark: "MO" },
];

export const inboxPreviewNames = ["success", "empty", "loading", "error", "rate_limit", "pagination", "long_content", "profile_refresh_error"] as const;
export const actionPreviewNames = ["accept", "decline", "accept_submitting", "decline_submitting", "unknown", "expired", "not_pending", "already_member", "forbidden", "event_decline"] as const;

export function createInboxFixture(scenario = "success", actionName = ""): InboxFixture {
  const state = scenario === "empty" || scenario === "loading" || scenario === "error" || scenario === "rate_limit" || scenario === "profile_refresh_error" ? scenario : "success";
  const invitations = state === "empty" || state === "loading" || state === "error" ? []
    : scenario === "pagination" ? [...sampleInvitations, ...Array.from({ length: 38 }, (_, index): InboxInvitation => ({ ...sampleInvitations[0], id: `c0000000-0000-4000-8000-${String(index + 8).padStart(12, "0")}`, organization_name: `Cộng đồng mẫu ${index + 8}` }))]
    : scenario === "long_content" ? [{ ...sampleInvitations[3], organization_name: "Cộng đồng nghiên cứu và sáng tạo những trải nghiệm kết nối dành cho tất cả mọi người", organization_slug: "dinh-danh-to-chuc-rat-dai-".repeat(7) }, ...sampleInvitations.slice(0, 3)]
    : state === "profile_refresh_error" ? [{ ...sampleInvitations[0], status: "ACCEPTED" as const, processed_at: "2026-11-15T03:00:00Z" }, ...sampleInvitations.slice(1)] : sampleInvitations;
  const action: InvitationAction = actionName.startsWith("decline") || actionName === "event_decline" ? "decline" : "accept";
  const phase: InvitationActionPhase = actionName.includes("submitting") ? "submitting" : actionName === "unknown" || actionName === "expired" || actionName === "not_pending" || actionName === "already_member" || actionName === "forbidden" ? actionName : "normal";
  return { state, invitations, actionPreview: actionName ? { invitationId: actionName === "event_decline" ? sampleInvitations[3].id : sampleInvitations[0].id, action, phase } : undefined };
}

const timestampFormatter = new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
export function formatInvitationTime(value: string | null): string {
  return value === null ? inboxCopy.unprocessed : timestampFormatter.format(new Date(value));
}
