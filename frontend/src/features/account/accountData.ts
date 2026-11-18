import type { Avatar, Membership } from "@/lib/types";

/** Presentation fixtures only. No session, cache, permissions or API state. */
export interface AccountMembership {
  readonly organizationId: string;
  readonly name: string;
  readonly slug: string;
  readonly roles: readonly string[];
  readonly description?: Membership["description"];
  readonly cover?: Membership["cover"];
}

export interface AccountProfile {
  readonly displayName: string;
  readonly email: string;
  readonly initials: string;
  readonly avatar?: Avatar;
  readonly memberships: readonly AccountMembership[];
}

export type AccountState = "success" | "empty" | "loading" | "network_error" | "account_unavailable" | "rate_limit" | "session_expired" | "logging_out" | "long_content";

export interface AccountNoticeData {
  readonly kind: "danger" | "warning" | "info";
  readonly icon?: "notice" | "lock" | "clock";
  readonly title: string;
  readonly description?: string;
  readonly action?: "retry" | "login";
}

export interface AccountFixture {
  readonly state: AccountState;
  readonly profile: AccountProfile | null;
  readonly notice?: AccountNoticeData;
}

export const accountCopy = {
  title: "Tài khoản của tôi",
  subtitle: "Thông tin cá nhân và các tổ chức bạn đang tham gia.",
  profileTitle: "Thông tin cá nhân",
  name: "Tên hiển thị",
  email: "Email tài khoản",
  reload: "Tải lại",
  reloadTitle: "Tải lại hồ sơ tài khoản",
  organizations: "Tổ chức đang tham gia",
  viewAll: "Xem tất cả",
  open: "Mở tổ chức",
  noRole: "Không có vai trò",
  roles: { OWNER: "Chủ sở hữu (OWNER)", ADMIN: "Quản trị viên (ADMIN)", MEMBER: "Thành viên (MEMBER)" } as Readonly<Record<string, string>>,
  invitations: "Xem lời mời của tôi",
  emptyTitle: "Bạn chưa tham gia tổ chức nào",
  emptyDescription: "Tạo tổ chức mới hoặc xem lời mời để bắt đầu kết nối cùng cộng đồng.",
  create: "Tạo tổ chức",
  viewInvitations: "Xem lời mời",
  logout: "Đăng xuất",
  loggingOut: "Đang đăng xuất…",
  loading: "Đang tải thông tin tài khoản…",
  login: "Về trang đăng nhập",
  navigation: "Điều hướng tài khoản",
  nav: [
    { label: "Tài khoản", href: "/me" },
    { label: "Tổ chức", href: "/organizations" },
    { label: "Lời mời", href: "/me/invitations" },
  ],
} as const;

const profile: AccountProfile = {
  displayName: "Nguyễn An",
  email: "an@example.test",
  initials: "NA",
  memberships: [
    { organizationId: "d1a20000-0000-4000-8000-000000000001", name: "Nhóm nghiên cứu", slug: "nhom-nghien-cuu", roles: ["OWNER"] },
    { organizationId: "d1a20000-0000-4000-8000-000000000002", name: "Cộng đồng sáng tạo", slug: "cong-dong-sang-tao", roles: ["ADMIN"] },
    { organizationId: "d1a20000-0000-4000-8000-000000000003", name: "Nhóm học tập", slug: "nhom-hoc-tap", roles: [] },
  ],
};

export const accountFixtures: Readonly<Record<AccountState, AccountFixture>> = {
  success: { state: "success", profile },
  empty: { state: "empty", profile: { ...profile, memberships: [] } },
  loading: { state: "loading", profile: null },
  network_error: {
    state: "network_error", profile,
    notice: { kind: "danger", title: "Không tải được thông tin tài khoản. Vui lòng thử lại.", description: "Dữ liệu bên dưới được giữ lại từ phiên trước để tham khảo và có thể chưa được cập nhật.", action: "retry" },
  },
  account_unavailable: {
    state: "account_unavailable", profile: null,
    notice: { kind: "danger", icon: "lock", title: "Tài khoản hiện không khả dụng.", description: "Vui lòng liên hệ người quản trị hoặc quay về trang đăng nhập để kiểm tra lại.", action: "login" },
  },
  rate_limit: {
    state: "rate_limit", profile,
    notice: { kind: "warning", title: "Bạn thao tác quá nhanh. Vui lòng chờ rồi thử lại.", description: "Vui lòng thử lại sau ít phút." },
  },
  session_expired: {
    state: "session_expired", profile: null,
    notice: { kind: "info", title: "Phiên đã hết hạn. Vui lòng đăng nhập lại.", action: "login" },
  },
  logging_out: {
    state: "logging_out", profile,
    notice: { kind: "info", title: "Đang xử lý đăng xuất an toàn…", description: "Vui lòng đợi trong giây lát." },
  },
  long_content: {
    state: "long_content",
    profile: { ...profile, displayName: "Nguyễn An và cộng đồng những người yêu sáng tạo", email: `${"dia-chi-email-dai-".repeat(8)}@example.test`, memberships: [{ ...profile.memberships[0], name: "Cộng đồng nghiên cứu, sáng tạo và phát triển những trải nghiệm kết nối dành cho tất cả mọi người", slug: "ten-to-chuc-rat-dai-".repeat(10), roles: ["OWNER", "ADMIN"] }, profile.memberships[2]] },
  },
};

export function getAccountPreview(value: string | null): AccountFixture | null {
  return process.env.NODE_ENV === "development" && value && Object.hasOwn(accountFixtures, value)
    ? accountFixtures[value as AccountState]
    : null;
}
