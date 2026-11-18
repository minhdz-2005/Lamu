import type { Membership } from "@/lib/types";
import { emptyCover } from "@/lib/organizationProfile";
import { previewOrganizationCover } from "@/features/organizations/organizationsData";

export interface RoleAssignment {
  readonly code: string;
  readonly resource_type: string;
  readonly resource_id: string;
}

export interface OrganizationMember {
  readonly user_id: string;
  readonly display_name: string;
  readonly status: "ACTIVE" | "INACTIVE";
  readonly roles: readonly RoleAssignment[];
  readonly is_current_user?: boolean;
}

export interface OrganizationView {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly my_roles: readonly string[];
  readonly description: NonNullable<Membership["description"]> | null;
  readonly cover: NonNullable<Membership["cover"]>;
}

export type DetailPresentation = "owner" | "admin" | "member";
export type MembersState = "success" | "loading" | "empty" | "error";
export type DetailState = "success" | "loading" | "forbidden" | "not_found" | "error" | "anonymous" | "unavailable";
export type DetailDialogKind = "invite" | "roles" | "revoke";
export type DetailDialogPhase = "normal" | "inline_error" | "recipient_error" | "submitting" | "last_owner" | "unknown";
export type ReceiptStatus = "PENDING" | "ACCEPTED" | "DECLINED" | "REVOKED" | "EXPIRED";

export interface InvitationReceiptData {
  readonly id: string;
  readonly organization_id: string;
  readonly email: string;
  readonly status: ReceiptStatus;
  readonly expiresLabel: string;
  readonly expiresAt?: string;
  readonly roles: readonly RoleAssignment[];
}

export interface DetailFixture {
  readonly state: DetailState;
  readonly presentation: DetailPresentation;
  readonly membersState: MembersState;
  readonly initialTab: "overview" | "members";
  readonly organization: OrganizationView;
  readonly members: readonly OrganizationMember[];
  readonly receipt?: InvitationReceiptData;
}

export const detailCopy = {
  back: "Tổ chức của tôi", title: "Chi tiết tổ chức", slug: "Định danh (Slug):",
  overview: "Tổng quan", members: "Thành viên", sent: "Lời mời đã gửi", list: "Danh sách thành viên",
  basic: "Thông tin căn bản", organizationName: "Tên tổ chức", identifier: "Định danh tổ chức (Slug)",
  myRoles: "Vai trò của tôi", scopeHeading: "Phạm vi quản trị", administration: "Quyền quản trị",
  toMembers: "Đến trang Thành viên",
  scope: "Phạm vi", orgScope: "Tổ chức", eventScope: "Sự kiện (EVENT)", noRole: "Không có vai trò",
  owner: "Chủ sở hữu (OWNER)", admin: "Quản trị viên (ADMIN)", ordinaryMember: "Thành viên thường",
  ownerGuidance: "Với vai trò Chủ sở hữu (OWNER), bạn có thể quản lý thành viên, tạo lời mời và thay đổi tập vai trò ORG. Chuyển sang tab Thành viên để xem danh sách.",
  adminGuidance: "Quản trị viên (ADMIN) được xem danh sách thành viên. Chỉ OWNER mới có thao tác mời thành viên và đổi vai trò.",
  memberGuidance: "Bạn có thể xem thông tin tổng quan của tổ chức. Bạn không có quyền xem danh sách thành viên.",
  ownerPrivilege: "Đầy đủ (Quản trị tổ chức)", adminPrivilege: "Chỉ đọc danh sách thành viên", memberPrivilege: "Chỉ xem tổng quan",
  reload: "Tải lại", invite: "Mời thành viên", changeRole: "Đổi vai trò", status: "Trạng thái",
  assignments: "Vai trò & phạm vi", action: "Hành động", active: "Đang hoạt động", inactive: "Không hoạt động", you: "Bạn", viewOnly: "Chỉ xem",
  unsupported: "Có vai trò thuộc phạm vi EVENT hoặc assignment chưa được hỗ trợ. Không thể đổi vai trò của thành viên này tại cấp tổ chức.",
  noMembersAccess: "Bạn không có quyền xem danh sách thành viên.", noMembers: "Chưa có thành viên để hiển thị.",
  membersError: "Không tải được danh sách thành viên. Vui lòng thử lại.", loadingMembers: "Đang tải danh sách thành viên…", loadingOrganization: "Đang tải thông tin tổ chức…",
  forbidden: "Không có quyền truy cập (403)", forbiddenDescription: "Bạn không phải là thành viên của tổ chức này hoặc quyền truy cập không còn khả dụng.",
  notFound: "Không tìm thấy tổ chức (404)", notFoundDescription: "Tổ chức này không tồn tại hoặc không còn khả dụng.",
  show: "Hiển thị", of: "trên tổng số", memberUnit: "thành viên", pageSize: "Kích thước trang", perPage: "/ trang", previous: "Trước", next: "Sau",
  cancel: "Hủy", close: "Đóng cửa sổ", save: "Lưu thay đổi", createInvitation: "Tạo lời mời trong ứng dụng", submitting: "Đang xử lý…",
  inviteDescription: "Mời một tài khoản đã đăng ký tham gia tổ chức.", email: "Địa chỉ email", emailPlaceholder: "nguoidung@example.test",
  emailError: "Vui lòng nhập địa chỉ email hợp lệ.", recipientError: "Người nhận đã là thành viên của tổ chức này.",
  roleChoice: "Gán vai trò ORG", ownerChoice: "OWNER — Chủ sở hữu", adminChoice: "ADMIN — Quản trị viên",
  noneInvite: "Không gán vai trò quản trị", noneRole: "Không có vai trò", ownerHint: "Quản trị ở phạm vi tổ chức.", adminHint: "Vai trò quản trị viên ở phạm vi tổ chức.", noneHint: "Không gán OWNER hoặc ADMIN.",
  inAppNote: "Lời mời xuất hiện trong ứng dụng. Người nhận cần đăng nhập Lamu và mở mục Lời mời của tôi. Không gửi email.",
  replacement: "Thao tác này thay toàn bộ tập vai trò của thành viên. Các lựa chọn bên dưới chỉ dành cho phạm vi tổ chức.",
  lastOwner: "Tổ chức phải còn ít nhất một OWNER đang hoạt động.", unknown: "Chưa xác định được kết quả thao tác. Vui lòng kiểm tra lại trước khi thực hiện thao tác mới.",
  check: "Kiểm tra lại thao tác", receiptTitle: "Đã tạo lời mời trong ứng dụng", sentTo: "Gửi tới", proposed: "Vai trò đề xuất", expires: "Hết hạn",
  receiptDetails: "Chi tiết lời mời", pending: "Đang chờ chấp nhận", revoked: "Đã thu hồi", expired: "Đã hết hạn",
  revoke: "Thu hồi lời mời", revokeTitle: "Thu hồi lời mời?", revokeDescription: "Người nhận sẽ không thể chấp nhận lời mời này để tham gia tổ chức.",
  dismissReceipt: "Đóng biên nhận", invitationId: "Mã lời mời",
} as const;

export const sampleOrgId = "d1a20000-0000-4000-8000-000000000001";
export const pageSizes = [20, 50, 100] as const;
export const detailScenarioNames = ["owner", "admin", "member", "loading", "forbidden", "not_found", "members_loading", "members_empty", "members_error", "pagination", "long_content", "receipt_pending", "receipt_revoked", "receipt_expired"] as const;
export const dialogPreviewNames = ["invite", "invite_error", "invite_already_member", "invite_submitting", "invite_unknown", "roles", "roles_error", "roles_submitting", "last_owner", "roles_unknown", "revoke", "revoke_submitting", "revoke_unknown"] as const;

export function defaultDetailScenario(orgId: string): DetailPresentation {
  return orgId === "d1a20000-0000-4000-8000-000000000002" ? "admin" : orgId === "d1a20000-0000-4000-8000-000000000003" ? "member" : "owner";
}

export function createDetailFixture(orgId: string, scenario: string = defaultDetailScenario(orgId)): DetailFixture {
  const orgRole = (code: string): RoleAssignment => ({ code, resource_type: "ORG", resource_id: orgId });
  const presentation: DetailPresentation = scenario === "admin" ? "admin" : scenario === "member" ? "member" : "owner";
  const names: Readonly<Record<string, readonly [string, string]>> = {
    [sampleOrgId]: ["Nhóm nghiên cứu", "nhom-nghien-cuu"],
    "d1a20000-0000-4000-8000-000000000002": ["Cộng đồng sáng tạo", "cong-dong-sang-tao"],
    "d1a20000-0000-4000-8000-000000000003": ["Nhóm học tập", "nhom-hoc-tap"],
  };
  const [name, slug] = names[orgId] ?? names[sampleOrgId];
  const members: readonly OrganizationMember[] = [
    { user_id: "a0000000-0000-4000-8000-000000000001", display_name: "Nguyễn An", status: "ACTIVE", roles: presentation === "member" ? [] : [orgRole(presentation === "admin" ? "ADMIN" : "OWNER")], is_current_user: true },
    { user_id: "a0000000-0000-4000-8000-000000000002", display_name: "Trần Bình", status: "ACTIVE", roles: [orgRole(presentation === "owner" ? "ADMIN" : "OWNER")] },
    { user_id: "a0000000-0000-4000-8000-000000000003", display_name: "Lê Chi", status: "ACTIVE", roles: [] },
    { user_id: "a0000000-0000-4000-8000-000000000004", display_name: "Phạm Dũng", status: "INACTIVE", roles: [] },
    { user_id: "a0000000-0000-4000-8000-000000000005", display_name: "Hoàng Mai", status: "ACTIVE", roles: [orgRole("ADMIN"), { code: "SPEAKER", resource_type: "EVENT", resource_id: "e0000000-0000-4000-8000-000000000001" }] },
  ];
  const state: DetailState = scenario === "loading" || scenario === "forbidden" || scenario === "not_found" ? scenario : "success";
  const membersState: MembersState = scenario === "members_loading" ? "loading" : scenario === "members_empty" ? "empty" : scenario === "members_error" ? "error" : "success";
  const receiptStatus: ReceiptStatus | undefined = scenario === "receipt_pending" ? "PENDING" : scenario === "receipt_revoked" ? "REVOKED" : scenario === "receipt_expired" ? "EXPIRED" : undefined;
  return {
    state, presentation, membersState, initialTab: presentation === "member" ? "overview" : "members",
    organization: {
      id: orgId,
      name: scenario === "long_content" ? "Cộng đồng nghiên cứu, thiết kế và sáng tạo những trải nghiệm kết nối dành cho tất cả mọi người" : name,
      slug: scenario === "long_content" ? "dinh-danh-to-chuc-rat-dai-".repeat(7) : slug,
      my_roles: presentation === "member" ? [] : [presentation === "admin" ? "ADMIN" : "OWNER"],
      description: presentation === "member" ? null : "Không gian để chia sẻ dự án và cùng học hỏi.\nGặp gỡ và trao đổi vào thứ Năm hằng tuần.",
      cover: presentation === "member" ? emptyCover : previewOrganizationCover,
    },
    members: membersState === "empty" ? [] : scenario === "pagination" ? [...members, ...Array.from({ length: 40 }, (_, index): OrganizationMember => ({ user_id: `a0000000-0000-4000-8000-${String(index + 6).padStart(12, "0")}`, display_name: `Thành viên mẫu ${index + 6}`, status: "ACTIVE", roles: [] }))] : members,
    receipt: receiptStatus ? { id: "b0000000-0000-4000-8000-000000000001", organization_id: orgId, email: "mai.tran@example.test", status: receiptStatus, expiresLabel: "22/11/2026 · 10:00", roles: [orgRole("ADMIN")] } : undefined,
  };
}

/** Presentation eligibility only; not an authorization or permission engine. */
export function supportsOrgEditor(member: OrganizationMember, orgId: string): boolean {
  return member.roles.every((role) => role.resource_type === "ORG" && role.resource_id === orgId && (role.code === "OWNER" || role.code === "ADMIN"));
}

export function resolveDetailPresentation(orgRoles: readonly string[], profileRoles: readonly string[]): DetailPresentation {
  const canOwn = orgRoles.includes("OWNER") && profileRoles.includes("OWNER");
  if (canOwn) return "owner";
  const canAdminister = (orgRoles.includes("OWNER") || orgRoles.includes("ADMIN")) &&
    (profileRoles.includes("OWNER") || profileRoles.includes("ADMIN"));
  return canAdminister ? "admin" : "member";
}

export function lastPageOffset(offset: number, limit: number, total: number): number {
  return offset > 0 && offset >= total ? Math.floor(Math.max(0, total - 1) / limit) * limit : offset;
}

export const invitationStatusLabel: Record<ReceiptStatus, string> = {
  PENDING: detailCopy.pending,
  ACCEPTED: "Đã chấp nhận",
  DECLINED: "Đã từ chối",
  REVOKED: detailCopy.revoked,
  EXPIRED: detailCopy.expired,
};

const invitationDate = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Asia/Saigon",
});
export const formatInvitationDate = (timestamp: string) => invitationDate.format(new Date(timestamp));
export const canRevokeInvitation = (status: ReceiptStatus, expiresAt: string, now = Date.now()) =>
  status === "PENDING" && Date.parse(expiresAt) > now;
