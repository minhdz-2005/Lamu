# 06. Tài khoản của tôi

**Route:** `/me` · **Cần đăng nhập:** Bắt buộc · **Ưu tiên:** M4 Identity — 2 (sau auth) · **API:** `GET /api/users/me`, `POST /api/auth/refresh`, `POST /api/auth/logout`

Mục tiêu: có trang đích sau đăng nhập chỉ phụ thuộc Gateway/Identity, xem hồ sơ và chuyển đến tổ chức/lời mời. **Trạng thái: đã nối Identity API ở local.** Số 06 tiếp nối bộ tài liệu cũ, không phải thứ tự triển khai.

Authority: [Identity OpenAPI v1.5.0](../../shared/contracts/http/identity.openapi.json), schema `Profile`, `Tokens`, `LoggedOut`; [quy ước chung](00-conventions.md). Không thêm API sửa hồ sơ, đổi mật khẩu hoặc quản lý các thiết bị.

## 1. Layout

```text
+----------------------------------------------------------------+
| Lamu   Tài khoản   Tổ chức   Lời mời          [Tên] [Đăng xuất]  |
+----------------------------------------------------------------+
| Tài khoản của tôi                                               |
| Thông tin hồ sơ                            [Tải lại]             |
| Tên hiển thị  Nguyễn An                                         |
| Email         an@example.test                                  |
|                                                                |
| Tổ chức đang tham gia                          [Xem tất cả]     |
| Tên tổ chức                  Vai trò             Hành động      |
| Nhóm nghiên cứu              OWNER               [Mở tổ chức]   |
| Cộng đồng                    Không có vai trò    [Mở tổ chức]   |
|                                                                |
| [Xem lời mời của tôi]                                           |
+----------------------------------------------------------------+
```

Màn hình dùng chung header với 07–09. Mobile: hồ sơ và tổ chức thành các card một cột; nút Đăng xuất vẫn truy cập được từ menu bàn phím. Email chỉ hiển thị cho chính chủ, không dùng làm tiêu đề URL/toast/log. Không hiển thị access/refresh token.

| Component | Props | Ghi chú |
|---|---|---|
| `AccountPage` | — | nhận session đã xác minh; loading/error/profile |
| `ProfileSummary` | `profile` | chỉ đọc `display_name`, `email`; không có nút lưu |
| `MembershipList` | `memberships`, `onOpen` | name/slug/roles từ Profile, ID dùng cho điều hướng |
| `IdentityHeader` | `profile`, `logoutState`, `onLogout` | menu chung; không gọi API service khác |
| `SessionNotice` | `kind`, `title` | hết phiên, mất kết nối, logout chưa xác nhận |

## 2. Trường và validate

| Field | Nguồn | Luật hiển thị / validate |
|---|---|---|
| Tên hiển thị | `Profile.display_name` | text được escape, không render HTML |
| Email | `Profile.email` | chỉ đọc, không đưa vào URL; không có form sửa |
| Tổ chức | `Profile.memberships[]` | chỉ những membership backend trả về; không tự tạo từ cache |
| Vai trò | `memberships[].roles[]` | badge code có nhãn tiếng Việt; mảng rỗng hiện “Không có vai trò” |
| Organization ID | `organization_id` | UUID string dùng nguyên giá trị, encode path; không chuyển sang number |

Role code ở Profile dùng cho hiển thị/điều hướng. Không suy scope EVENT hoặc quyết định cấp quyền từ các badge này.

## 3. Hành vi theo API

### 3.1 Load và tải lại hồ sơ

1. Guard chờ session bootstrap theo 00 §2. Thiếu access nhưng còn refresh chỉ bootstrap một lần; anonymous chuyển `/auth?next=/me`.
2. Gọi `GET /api/users/me` với access hiện hành; validate/derive type `Profile` từ canonical.
3. Chia sẻ một request đang chạy giữa header và page. Cache chỉ thuộc user/session generation hiện tại; cache không là bằng chứng tài khoản còn ACTIVE.
4. Thành công cập nhật profile/header. `memberships=[]` vẫn là hồ sơ hợp lệ; hiện “Bạn chưa tham gia tổ chức nào” với nút Tạo tổ chức và Xem lời mời.
5. Tải lại gọi đúng endpoint, không gọi dashboard/tickets/Event hoặc internal public-profile.

### 3.2 Điều hướng và đăng xuất

Mở tổ chức → `/organizations/{organization_id}`; Xem tất cả → `/organizations`; lời mời → `/me/invitations`. Đăng xuất theo 01 §3.3 và 00 §2: access + refresh cùng phiên, phối hợp refresh đang chạy, generation guard và clear local khác server revoke confirmed.

| Tình huống | API | UI |
|---|---|---|
| Access thiếu/hết hạn | 401 | refresh tối đa một lần theo coordinator; không redirect lặp |
| User bị khóa | 403 FORBIDDEN | bỏ hồ sơ riêng tư khỏi màn hình, banner tài khoản không khả dụng; không gọi refresh để chữa403 |
| Gateway/down/timeout | network/502/504 | không gọi đây là anonymous; hiện lỗi và Tải lại; cache cũ nếu còn chỉ là dữ liệu cũ, không tiếp tục mutation từ nó |
| Quá nhiều request | 429 RATE_LIMITED | thông báo chờ, không vòng retry/refresh |

## 4. State màn hình

| State | Khi nào | Nội dung |
|---|---|---|
| Loading | bootstrap/load chưa xong | skeleton hồ sơ và danh sách; chưa gọi user là “Khách” |
| Empty memberships | Profile hợp lệ, không tổ chức | vẫn hiện hồ sơ; CTA tạo tổ chức/lời mời |
| Success | Profile hợp lệ | thông tin chỉ đọc và link theo membership |
| Error | load thất bại | thông báo tiếng Việt và nút Tải lại khi phù hợp |
| Logging out | logout đang chạy | khóa thao tác session mới, nút “Đang đăng xuất…” |

## 5. Edge cases phải xử lý

| Case | Xử lý |
|---|---|
| Nhận invitation rồi quay lại | refetch profile khi accept thành công (09); không append membership tự dựng |
| Vai trò thay đổi từ tài khoản khác | Tải lại Profile; request bị403 vẫn xử lý theo backend hiện tại |
| Logout trong lúc Profile đang chờ | response cũ không cập nhật cache/header hoặc chuyển lại authenticated |
| Đổi tài khoản trên cùng trình duyệt | cache/inflight/user selection cũ bị cô lập theo generation; không nháy email user trước |
| Có membership nhưng role rỗng | vẫn mở được trang org nếu backend cho phép; không ẩn cả tổ chức |
| Nhiều tab | cần chốt policy tại 00 §14 trước nghiệm thu liên tab; không coi promise trong một tab là đủ |

## 6. Checklist nghiệm thu

- [ ] Login thật qua Gateway → `/me`, tên/email/membership khớp Profile canonical.
- [ ] User mới chưa có tổ chức vẫn xem được trang và hai CTA đúng.
- [ ] Header/page chia sẻ load, không gọi API dashboard/Event/tickets/internal.
- [ ] Refresh hết phiên, LOCKED403, network/502/504/429 có các nhánh UI riêng.
- [ ] Không có form/nút đổi thông tin hoặc thiết bị khi backend chưa hỗ trợ.
- [ ] Accept lời mời rồi refetch thấy tổ chức mới; không suy từ response client tự tạo.
- [ ] Logout/đổi tài khoản khi profile đang chờ không làm lộ hoặc hồi sinh hồ sơ cũ.
- [ ] Kiểm keyboard/focus, mobile, light/dark và reduced motion theo 00.

Kết quả kiểm chứng theo từng route ở [báo cáo UI local](reports/identity-pages-integration-02.md).
