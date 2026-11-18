import type { AccountMembership } from "@/features/account/accountData";

export const organizationsCopy = {
  title: "Tổ chức của tôi",
  description: "Chọn tổ chức bạn muốn làm việc hoặc tạo một tổ chức mới.",
  create: "Tạo tổ chức",
  organization: "Tổ chức",
  roles: "Vai trò của tôi",
  action: "Hành động",
  open: "Mở tổ chức",
  invitations: "Xem lời mời của tôi",
  viewInvitations: "Xem lời mời",
  noRole: "Không có vai trò",
  roleLabels: { OWNER: "Chủ sở hữu (OWNER)", ADMIN: "Quản trị viên (ADMIN)", MEMBER: "Thành viên (MEMBER)" } as Readonly<Record<string, string>>,
  empty: "Bạn chưa tham gia tổ chức nào",
  emptyDescription: "Tạo tổ chức mới hoặc xem lời mời để bắt đầu kết nối cùng cộng đồng.",
  loading: "Đang tải danh sách tổ chức…",
  retry: "Tải lại",
  dialogDescription: "Bắt đầu một không gian chung cho nhóm hoặc cộng đồng của bạn.",
  name: "Tên tổ chức",
  namePlaceholder: "Ví dụ: Cộng đồng sáng tạo",
  ownerPrefix: "Bạn sẽ trở thành ",
  owner: "Chủ sở hữu (OWNER)",
  ownerSuffix: " của tổ chức mới.",
  cancel: "Hủy",
  close: "Đóng cửa sổ",
  creating: "Đang tạo…",
  check: "Kiểm tra lại thao tác",
  openCreated: "Mở tổ chức vừa tạo",
  reloadList: "Tải lại danh sách",
  validation: "Tên tổ chức cần từ 1 đến 100 ký tự.",
} as const;

export type OrganizationsState = "success" | "empty" | "loading" | "error" | "unavailable" | "anonymous" | "ratelimit" | "long_content";
export type DialogState = "initial" | "validation_error" | "conflict" | "creating" | "success" | "reload_error" | "unknown_result" | "processing";

export interface OrganizationNoticeData {
  readonly kind: "error" | "warn" | "ok";
  readonly text: string;
}

export interface CreateDialogFixture {
  readonly state: DialogState;
  readonly name: string;
  readonly description?: string;
  readonly nameError?: string;
  readonly notice?: OrganizationNoticeData;
  readonly organizationId?: string;
}

export interface OrganizationsFixture {
  readonly state: OrganizationsState;
  readonly memberships: readonly AccountMembership[];
  readonly notice?: OrganizationNoticeData;
}

// Independent presentation data; not derived from organizer/Event or a session.
export const previewOrganizationCover = { url: "/preview/organization-cover.png", revision: "1" };

const memberships: readonly AccountMembership[] = [
  { organizationId: "d1a20000-0000-4000-8000-000000000001", name: "Nhóm nghiên cứu", slug: "nhom-nghien-cuu", roles: ["OWNER"], description: "Không gian để chia sẻ dự án và cùng học hỏi.\nGặp gỡ và trao đổi vào thứ Năm hằng tuần.\nThành viên có thể đề xuất chủ đề mới.", cover: previewOrganizationCover },
  { organizationId: "d1a20000-0000-4000-8000-000000000002", name: "Cộng đồng sáng tạo", slug: "cong-dong-sang-tao", roles: ["ADMIN"] },
  { organizationId: "d1a20000-0000-4000-8000-000000000003", name: "Nhóm học tập", slug: "nhom-hoc-tap", roles: [] },
];

export const organizationsFixtures: Readonly<Record<OrganizationsState, OrganizationsFixture>> = {
  success: { state: "success", memberships },
  empty: { state: "empty", memberships: [] },
  loading: { state: "loading", memberships: [] },
  error: { state: "error", memberships: [], notice: { kind: "error", text: "Không tải được danh sách tổ chức. Vui lòng thử lại." } },
  unavailable: { state: "unavailable", memberships: [], notice: { kind: "error", text: "Tài khoản hiện không khả dụng. Vui lòng liên hệ người quản trị." } },
  anonymous: { state: "anonymous", memberships: [], notice: { kind: "warn", text: "Vui lòng đăng nhập để xem tổ chức của bạn." } },
  ratelimit: { state: "ratelimit", memberships, notice: { kind: "warn", text: "Bạn thao tác quá nhanh. Vui lòng chờ rồi thử lại." } },
  long_content: { state: "long_content", memberships: [{ ...memberships[0], name: "Cộng đồng nghiên cứu và sáng tạo những trải nghiệm kết nối dành cho tất cả mọi người", slug: "duong-dan-to-chuc-rat-dai-".repeat(8), roles: ["OWNER", "ADMIN", "MEMBER"] }, memberships[2]] },
};

const exampleName = "Hội thiết kế giao diện";
export const createdOrganizationId = "d1a20000-0000-4000-8000-000000000004";
export const dialogFixtures: Readonly<Record<DialogState, CreateDialogFixture>> = {
  initial: { state: "initial", name: "" },
  validation_error: { state: "validation_error", name: "", nameError: organizationsCopy.validation },
  conflict: { state: "conflict", name: exampleName, notice: { kind: "error", text: "Chưa thể hoàn tất việc tạo tổ chức. Vui lòng kiểm tra lại thao tác." } },
  creating: { state: "creating", name: exampleName, description: "Cộng đồng trao đổi về thiết kế giao diện." },
  success: { state: "success", name: exampleName, organizationId: createdOrganizationId, notice: { kind: "ok", text: "Đã tạo tổ chức thành công." } },
  reload_error: { state: "reload_error", name: exampleName, organizationId: createdOrganizationId, notice: { kind: "warn", text: "Đã tạo tổ chức. Danh sách chưa được cập nhật." } },
  unknown_result: { state: "unknown_result", name: "Học viện số hóa", notice: { kind: "error", text: "Chưa xác định được kết quả tạo tổ chức. Vui lòng kiểm tra lại thao tác." } },
  processing: { state: "processing", name: "Học viện số hóa", notice: { kind: "warn", text: "Thao tác đang được xử lý. Vui lòng kiểm tra lại sau." } },
};
