# 08. Chi tiết tổ chức, thành viên và lời mời

**Route:** `/organizations/[orgId]` · **Cần đăng nhập:** Bắt buộc, quyền do Identity kiểm tra · **Ưu tiên:** M4 Identity — 4 · **API:** `GET /api/organizations/{orgId}`, `GET /api/organizations/{orgId}/members`, `PUT /api/organizations/{orgId}/members/{userId}/roles`, `POST /api/organizations/{orgId}/members/invitations`, `POST /api/organizations/{orgId}/members/invitations/{id}/revoke`, `GET /api/users/me`

Mục tiêu: quản lý thành viên/role ORG và mời user đã có tài khoản, độc lập Event. **Trạng thái: thiết kế M4, chưa triển khai/chưa nghiệm thu.** Authority: [Identity OpenAPI v1.2.0](../../shared/contracts/http/identity.openapi.json), schemas `Organization`, `OrganizationMembers`, `ReplaceMemberRoles`, `RoleAssignment`, `CreateInvitation`, `InvitationCreated`, `InvitationRevoked`; [00](00-conventions.md), [D09 còn DRAFT](../integration/identity-handoff.md#d09-draft).

## 1. Layout

```text
+----------------------------------------------------------------+
| Lamu   Tài khoản   Tổ chức   Lời mời          [Tên] [Đăng xuất]  |
+----------------------------------------------------------------+
| [< Tổ chức của tôi]                                            |
| Nhóm nghiên cứu  · nhom-nghien-cuu  · Vai trò của tôi: OWNER     |
| [ Tổng quan ] [ Thành viên ]                                   |
|                                                                |
| Thành viên                       [Tải lại] [+ Mời thành viên]  |
| Tên             Trạng thái      Vai trò / phạm vi   Hành động   |
| Nguyễn An       Đang hoạt động  OWNER / Tổ chức     [Đổi role]  |
| Trần Bình       Đang hoạt động  ADMIN / Tổ chức     [Đổi role]  |
| Lê Chi          Không hoạt động Không có vai trò    —           |
| Hiển thị 1–20 / total        Mỗi trang [20 v] [Trước] [Sau]      |
+----------------------------------------------------------------+
| Dialog Mời: Email* [_____________]                              |
| Role ORG: [ ] OWNER [ ] ADMIN / [ ] Không gán role quản trị     |
| Không gửi email; người nhận mở “Lời mời của tôi”.               |
|                                     [Hủy] [Tạo lời mời]        |
+----------------------------------------------------------------+
| Dialog Đổi role: Trần Bình                                     |
| Role ORG: [x] ADMIN [ ] OWNER / [ ] Không có role               |
| Thao tác thay toàn bộ danh sách role của thành viên.            |
|                                     [Hủy] [Lưu thay đổi]       |
+----------------------------------------------------------------+
```

Tab Tổng quan hiển thị tên/slug/my_roles chỉ đọc; không số liệu event/tickets/dashboard. Members chỉ load khi tab mở và user có quyền trình bày tương ứng. Mobile dùng thẻ hoặc bảng cuộn ngang có nhãn; hành động không biến mất ngoài vùng nhìn.

| Component | Props | Ghi chú |
|---|---|---|
| `OrganizationDetailPage` | `orgId` | organization/error/tab; hủy/ignore request của org cũ khi điều hướng |
| `OrganizationOverview` | `organization` | chỉ đọc, my_roles không phải scope EVENT |
| `MembersTable` | `page`, `loading`, `onPage`, `onEdit` | user_id là row key; không email/contact |
| `OrgRoleEditor` | `member`, `orgId`, `onSaved` | full replacement, chỉ mở khi toàn bộ assignments là ORG được hỗ trợ |
| `InviteMemberDialog` | `orgId`, `onCreated` | existing email, selection rõ ràng; key scoped thao tác |
| `InvitationReceipt` | `result`, `actorId`, `orgId`, `onRevoke` | chỉ lời mời vừa tạo trong phiên trang; không là danh sách đã gửi |

## 2. Trường và validate

| Field | Tên gửi/nguồn | Luật UI |
|---|---|---|
| Org ID, user ID, invitation ID | params UUID | UUID string, encode path, không nhận org ID do form tự nhập |
| Tên/slug/my roles | `Organization` | chỉ đọc; không form sửa/xóa tổ chức |
| Page size | `limit` | chọn20/50/100; default20; server1–100 |
| Offset | `offset` | integer>=0 trong giới hạn canonical; chuyển page dùng offset, không cursor tự tạo |
| Thành viên | `OrganizationMembers.items` | display_name/status/scoped roles; không kỳ vọng email hoặc avatar |
| Role ORG | `roles` | tập unique OWNER/ADMIN; mỗi assignment ORG có resource_id=orgId; không multiple-select biến SPEAKER thành ORG |
| Không có role | `roles=[]` | hợp lệ theo API nếu không vi phạm OWNER cuối; cần lựa chọn rõ, không tự gán ATTENDEE |
| Email người nhận | `email` | trim/lowercase, email hợp lệ, tối đa254; chỉ user đã tồn tại, không endpoint tìm kiếm email |
| Header key | `Idempotency-Key` | riêng cho PUT roles, create invite, revoke; không dùng key create để revoke |

Một thành viên có thể có nhiều assignment. UI đọc/hiển thị đủ `code/resource_type/resource_id`; không biến response scoped roles thành string[] như mock. Nếu có EVENT/assignment không hỗ trợ, **khóa editor của cả row** trong đợt ORG này để tránh PUT thay toàn bộ làm mất scope cũ hoặc gọi resolver chưa có. Giải thích bằng text, không âm thầm drop field.

## 3. Hành vi theo API

### 3.1 Đọc tổ chức và thành viên

1. Guard đăng nhập rồi GET organization. ACTIVE membership bất kỳ được xem overview, kể cả không role; thiếu membership403, không tồn tại404.
2. OWNER/ADMIN có quyền xem members theo policy hiện tại; user khác thấy overview, phần members ghi “Bạn không có quyền xem danh sách thành viên”. Không lấy dữ liệu internal/check từ browser.
3. Mở tab members gọi GET với `limit/offset`; dùng `items,total,limit,offset` từ canonical, sort server user_id. Không thêm query search/status/sort server chưa hỗ trợ.
4. OWNER ACTIVE thấy Mời/Đổi role; ADMIN chỉ đọc members. Điều kiện hiển thị không thay quyền backend: mọi403 dừng thao tác và tải lại quyền hiện tại.
5. Nếu offset vượt total sau reload, chuyển về trang hợp lệ/refetch hữu hạn một lần; không vòng tải vô tận.

### 3.2 Thay role

1. Mở dialog từ row ACTIVE được hỗ trợ; hiện tập role hiện tại và giải thích full replacement. Không có API tạo membership tùy ý bằng user_id; thành viên mới đi qua invitation.
2. Khi user xác nhận, freeze org/user/body và key rồi PUT; **200 LoggedOut** là schema response tên lịch sử `{status:"OK"}`, đây là kết quả role replacement, không đăng xuất user.
3. Thành công refetch members và Profile/organization nếu sửa chính mình. Không chờ messaging, không tự sửa outbox/revision trên client.
4. No-op/replay có thể200, không báo “đã phát event mới”. User tự hạ quyền thành công có thể nhận403 khi retry cùng key; không khẳng định thao tác đầu thất bại.
5. `409 LAST_OWNER_REQUIRED`: giữ dialog/dữ liệu, báo “Tổ chức phải còn ít nhất một OWNER đang hoạt động”; không tự chọn người khác thay thế. Snapshot UI không đủ để chặn mọi race, backend là quyết định cuối.
6. Network/502/504 outcome unknown → giữ body/key để retry; dialog không đọc role mới rồi gửi khác body với key cũ. Refetch không cung cấp optimistic concurrency: API chưa có version/If-Match cho PUT này, chỉnh đồng thời có thể thay thế thay đổi trước. Hiện cảnh báo và yêu cầu xem lại dữ liệu trước thao tác mới, không hứa merge tự động.

### 3.3 Tạo lời mời

1. OWNER chọn email và role ORG hoặc chọn rõ không role. Không gửi organization_id trong body nếu schema không có; org lấy từ path.
2. POST create với key/access → **201 InvitationCreated**; lưu receipt chỉ trong memory của actor/org/page hiện tại, gồm ID/status/expires_at từ server.
3. Hiện “Đã tạo lời mời trong ứng dụng” và hướng dẫn người nhận đăng nhập vào inbox; không nói email đã gửi. Chưa append member vì người nhận chưa accept.
4. Receipt có nút Thu hồi khi còn có thể thực hiện: xác nhận rồi POST revoke body rỗng với **key mới cho operation revoke** →200 InvitationRevoked. Quyền OWNER hiện tại/expiry/terminal state do server kiểm.
5. Receipt mất khi reload/chuyển org/đổi user. **Chưa có GET lời mời theo org**, nên không thiết kế tab “Lời mời đã gửi” có dữ liệu bền vững, không lưu email nhạy cảm vào localStorage để giả backend. Revoke lời mời cũ qua UI đầy đủ là dependency API bổ sung cần review riêng.

| Tình huống | API | UI |
|---|---|---|
| Không đủ quyền / membership hoặc user không ACTIVE | 403 FORBIDDEN | bỏ mutation controls, reload quyền, không retry bằng user/org khác |
| Org/member/recipient/invitation không tìm thấy | 404 NOT_FOUND | thông báo theo thao tác; create invitation: “Không tìm thấy tài khoản phù hợp để mời” |
| Đã có membership, kể cả INACTIVE | 409 ALREADY_MEMBER | không mời lại/reactivate; giải thích đã có membership |
| Đã có lời mời chờ | 409 INVITATION_ALREADY_PENDING | không tạo lại hoặc suy ra ID lời mời cũ |
| Lời mời hết hạn/đã xử lý | 409 INVITATION_EXPIRED / INVITATION_NOT_PENDING | đóng hành động fresh; thông báo trạng thái đã đổi, không giả revoke thành công |
| EVENT chưa xác minh | 409 EVENT_SCOPE_UNVERIFIED | báo chức năng EVENT chưa tích hợp, không thử fixture/đổi sang ORG |
| Input/key/conflict/transport | 400/409/401/429/502/504/network | theo00; giữ snapshot/key đúng operation/actor/target |

## 4. State màn hình

| State | Khi nào | Nội dung |
|---|---|---|
| Loading org | chưa có detail | skeleton, không mở mutation dialog |
| Overview only | member nhưng thiếu quyền members | overview thành công; message riêng cho members |
| Members loading/empty/success | load page/200 items rỗng/có data | skeleton/empty/table và pagination; lỗi members không xóa overview |
| Forbidden/not found | GET detail403/404 | trạng thái toàn trang và link về organizations |
| Editing/submitting | dialog mở/request bay | field errors/disable duplicate submit, focus trap |
| Outcome unknown | mất response mutation | giữ receipt thao tác/key và lời giải thích, retry có chủ đích |
| Invite receipt/revoked | POST success | ID trong phần chi tiết mở rộng, expiry/badge và hành động phù hợp |

## 5. Edge cases phải xử lý

| Case | Xử lý |
|---|---|
| Actor tự bỏ OWNER trong org nhiều OWNER | cho phép theo server; sau200 refetch và ẩn controls nếu mất quyền |
| Hai OWNER tự hạ đồng thời | bên bị LAST_OWNER_REQUIRED không đổi UI thành thành công |
| Target INACTIVE | hiển thị status, không editor/reactivate; không có endpoint kích hoạt |
| Org A→B khi request/dialog A đang chờ | isolate state theo actor/org/operation; response A không sửa bảng B |
| Role EVENT đã có trong seed | hiển thị scope/UUID, khóa edit row; không đặt picker Event giả |
| Recipient accept trước thao tác revoke | server terminal conflict; không ghi REVOKED từ suy đoán |
| Receipt tạo201 nhưng reload trang | không còn lịch sử đã gửi ở UI; không phát GET chưa tồn tại |
| Lỗi network sau commit | retry cùng key có thể trả kết quả cached hoặc403 theo quyền hiện tại; không tạo mutation mới ngầm |

## 6. Checklist nghiệm thu

- [ ] Member role rỗng đọc overview, OWNER/ADMIN đọc members, user ngoài org bị403.
- [ ] Members response/type/pagination/scoped role đúng canonical; không email/avatar nội bộ.
- [ ] OWNER đổi tập role ORG, no-op, empty roles và self-demotion đúng policy server.
- [ ] Last OWNER/race không bị UI ghi thành thành công;403 tải lại quyền.
- [ ] Có EVENT assignment thì xem được đầy đủ nhưng editor cả row bị khóa có lý do.
- [ ] Mời existing user →201, user chưa accept chưa xuất hiện trong members; không tuyên bố gửi email.
- [ ] Receipt mới có thể revoke bằng key riêng; expired/terminal race đúng thông báo.
- [ ] Không có GET invitation theo org, API search user, deactivate/delete member hoặc picker Event giả.
- [ ] Retry giữ đúng key/target/body; response cũ không cập nhật user/org khác.
- [ ] Dialog keyboard/mobile/theme và các lỗi400/401/403/404/409/429/502/504 được kiểm.
- [ ] Khi chạy thật tạo `docs/ui/reports/08-organization-detail.md`; browser integration hiện **NOT RUN**, outgoing invitation list và EVENT adapter chưa triển khai.
