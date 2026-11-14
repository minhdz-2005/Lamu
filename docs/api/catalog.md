# Danh mục API năm service

Trạng thái: **bản nháp chờ approve**. Sau khi cả nhóm approve, tài liệu này là hợp đồng: đổi API = PR có chủ service khác review.

Cập nhật P8 14/11/2026: trạng thái draft chung phía trên áp dụng phần chưa duyệt của toàn hệ thống. Identity HTTP **v1.2.0** và ba event Identity **v1** đã ACCEPTED theo ADR0002–0005; authority là OpenAPI/JSON Schema, bảng này là danh mục. [Handoff P8](../integration/identity-handoff.md) có ma trận implementation/evidence/frontend và giới hạn consumer. Không suy các API Event/Registration/Payment/Notification hay composition dưới đây đã triển khai từ việc Identity PASS.

Phạm vi lấy từ §3.0 của [docs/architecture.md](../architecture.md): cột MUST là việc của 4 tuần, mục ghi STRETCH được hoãn và không cản nghiệm thu. Tám quyết định chốt tại §1.1 của tài liệu kiến trúc đã được áp vào bản API dưới đây.

## 0. Quy ước bắt buộc (áp dụng cho mọi API)

| Mục | Chốt |
|---|---|
| Tiền tố | Frontend chỉ gọi Gateway tại `/api/...`. Service nhận request đã đi qua Gateway trong Docker network. |
| Danh tính | Gateway verify JWT rồi chuyển tiếp `Authorization` + `X-User-Id` + `X-Request-Id`. Service không tự verify chữ ký; endpoint `POST /internal/...` chỉ chấp nhận lời gọi từ network nội bộ. |
| JWT | HS256 với `JWT_SECRET` chung trong network local; Identity ký, Gateway verify. |
| Error envelope | Mọi lỗi trả cùng một shape: `{"error": {"code": "SOLD_OUT", "message": "...", "request_id": "..."}}`. HTTP status mang ngữ nghĩa, `code` mang loại lỗi. |
| Mã lỗi dùng chung | `VALIDATION_FAILED` 400, `UNAUTHENTICATED` 401, `FORBIDDEN` 403, `NOT_FOUND` 404, `IDEMPOTENCY_KEY_REQUIRED` 400, `CONFLICT` 409, `SOLD_OUT` 409, `SALES_CLOSED` 409, `TIME_LOCKED` 409, `EMAIL_TAKEN` 409, `SLUG_TAKEN` 409, `ALREADY_CHECKED_IN` 409, `TICKET_VOIDED` 409, `UPSTREAM_UNAVAILABLE` 502. UI map từng mã một câu tiếng Việt, không toast `code` thô cho user. |
| Idempotency | Endpoint ghi dữ liệu do user gọi phải nhận header `Idempotency-Key`; gọi lại cùng key trả đúng kết quả cũ. |
| Thời gian & ID | `TIMESTAMPTZ` xuất ra RFC3339 UTC; mọi ID là UUID string; field JSON dùng `snake_case`. |
| Permission | Chỉ dùng 10 mã seed trong §3.1.1 kiến trúc. Service gửi mã khi check quyền, không tự thêm mã mới. |
| Port | Gateway `8080` là cổng public duy nhất; năm service chạy `8080` trong network nội bộ; RabbitMQ `5672`/`15672`; Mailpit `1025`/`8025`; PostgreSQL không expose. Bảng đầy đủ ở §5 kiến trúc. |
| Health | Mỗi service có `GET /healthz` (không qua Gateway) cho Compose healthcheck. |
| Pagination | `?limit=` (mặc định 20, tối đa 100) và `?offset=`; response có `total`. |

## 1. Identity & Organization Service (`identity_db`)

### M1 đã chốt ngày 13/11/2026

M1 áp dụng [ADR 0002](../adr/0002-m1-auth-gateway.md). Contract HTTP máy kiểm được là [Identity OpenAPI](../../shared/contracts/http/identity.openapi.json); [Gateway OpenAPI](../../shared/contracts/http/gateway.openapi.json) là projection thêm `/api` có kiểm tra, không định nghĩa payload riêng. Người dùng đã xác nhận các đề xuất P0 trong phiên triển khai; không suy các contract M2–M4 đã được duyệt.

 Các quy định sau ghi đè quy ước chung cũ **cho auth/context M1, tiếp tục áp dụng Identity M2/M3**:

- Gateway verify HS256, issuer/audience/expiry và claims; tự gán `X-User-Id=sub`, `X-Session-Id=sid`. Không forward header danh tính client; từ chối nhiều Authorization. Identity tin context trong network local, không tự verify JWT, không publish cổng host. Public auth không nhận context client. Request ID duy nhất là UUID hợp lệ hoặc được sinh mới.
- Register/login/refresh/logout success **200**, không yêu cầu `Idempotency-Key`. Register dựa email unique; login tạo phiên mới; refresh rotation nguyên tử; logout có retry cùng phiên. JSON token trả `expires_in:900`.
- Email trim, tối đa 254 ký tự; password 8–128 ký tự không trim; display_name trim 1–100 ký tự; field thừa bị từ chối. Refresh token base64url 43 ký tự từ 32 byte ngẫu nhiên, chỉ lưu SHA-256.
- Logout cần access JWT + refresh hiện hành đúng user/sid. Sai cặp hoặc token đã rotation: 401 UNAUTHENTICATED, không thay phiên nào. Retry cặp đã revoke còn hạn: 200 OK, giữ revoked_at lần đầu. Giữ row/hash ít nhất expires_at + 15 phút, M1 không cleanup. Access đã cấp có thể còn dùng tới exp; không cam kết revoke access tức thời.
- Credential hợp lệ nhưng user LOCKED: login/refresh/users-me trả 403 FORBIDDEN; credential sai/hết hạn vẫn 401. Profile chỉ trả memberships ACTIVE và role code để hiển thị, không thay authorization scope M2.
- `/healthz` là liveness; `/readyz` trả 200 khi DB reachable, DB down trả 503 SERVICE_UNAVAILABLE. Config không hợp lệ dừng startup. Gateway readiness kiểm Identity readiness. Không route health của Identity ra public qua `/api`.
- Upstream lỗi kết nối: 502 UPSTREAM_UNAVAILABLE; timeout hữu hạn: 504 UPSTREAM_TIMEOUT; không tự retry mutation. Thêm 429 RATE_LIMITED và 500 INTERNAL_ERROR, giữ error envelope chung và request ID.
- Register ghi user + UserRegistered v1 cùng transaction vào `outbox_events` từ M1. Không phụ thuộc RabbitMQ; seed local không phát event, worker M3.
- Swagger public ở Gateway `/docs`, JSON `/docs-json`; không có operation internal có thể thực thi qua Gateway.

Các dòng M1 ở bảng dưới được đọc cùng contract đã chốt này. M2/P5 và P6 có quyết định riêng theo ADR 0003/0004, không tự freeze từ thay đổi M1.

### M2/P5 chốt riêng ngày 14/11/2026

Người dùng duyệt A–E của [P0 M2](../../services/identity-service/report/REPORT_M2_P0_CONTRACT_01.md); [ADR 0003](../adr/0003-m2-p5-organization-rbac.md) ghi nguồn phê duyệt. Canonical HTTP v1.1.0 là nguồn DTO/status/error, pagination, matrix/reason; Gateway/types sinh từ đó. Các quy định P5 sau ghi đè các ô draft tương ứng bên dưới. Phần này chỉ mô tả P5; P6 được duyệt riêng theo ADR 0004.

- Create organization **201**; POST organization/PUT roles bắt buộc một Idempotency-Key. TTL 24h, key lock 2s, hash có actor/operation/target/body canonical; replay kiểm quyền hiện tại, hết TTL là request mới. Không đổi ngoại lệ auth M1. Assignment bắt buộc code/resource_type/resource_id, tối đa 100, unique/không thứ tự; empty roles hợp lệ nếu còn OWNER.
- GET members trả `{items,total,limit,offset}`, sort user_id, limit mặc định 20 (1–100), offset 0 (0–2147483647); chỉ nhận hai query này. Item có user_id/display_name/status membership/roles scoped, không email. GET org cho user ACTIVE/membership ACTIVE; my_roles chỉ hiển thị.
- Authorization/check bắt buộc user_id/organization_id/resource_type/resource_id/permission. ORG cho org.read/org.member.read/org.member.manage/event.create/event.read; EVENT cho event.read/update/publish/cancel, ticket.checkin, payment.refund. Input sai 400; deny hợp lệ 200 với reason enum; caller không mutation khi deny/hạ tầng lỗi. Caller nội bộ phải resolve org của event đáng tin trước check.
- Internal public-profile chỉ `{id,display_name}`, không có/LOCKED trả 404. Hai endpoint internal không có route/Swagger public.
- Bổ sung 400 IDEMPOTENCY_KEY_REQUIRED; 409 SLUG_TAKEN/LAST_OWNER_REQUIRED/CONFLICT/IDEMPOTENCY_IN_PROGRESS/EVENT_SCOPE_UNVERIFIED. Envelope/request ID giữ M1. User/membership/target không ACTIVE không được mutation; quyền actor/OWNER kiểm lại dưới khóa org. Mutation/revision/result/outbox nguyên tử.
- OrganizationCreated/MembershipChanged v1 lưu từ mutation P5 đầu tiên theo JSON Schema canonical. No-op/replay/rollback không event/revision mới. ORG provider thật; EVENT fixture chỉ test, default runtime fail closed khi thiếu resolver. Chưa Event M4/worker M3.

| API | Làm gì | Vào → Ra | Lỗi | Quyền | Event / bảng ghi |
|---|---|---|---|---|---|
| `POST /auth/register` | Tạo tài khoản, băm mật khẩu | `{email, password, display_name}` → `{user_id}` | 409 email tồn tại, 400 | Công khai | ghi `users`; phát `UserRegistered` |
| `POST /auth/login` | Kiểm tra credential, phát access + refresh token | `{email, password}` → `{access_token, refresh_token, expires_in}` | 401 sai credential, 403 tài khoản khóa | Công khai | ghi `refresh_sessions` |
| `POST /auth/refresh` | Đổi refresh token lấy access token mới | `{refresh_token}` → như login | 401 hết hạn/thu hồi | Công khai | đọc/ghi `refresh_sessions` |
| `POST /auth/logout` | Thu hồi refresh session hiện tại | `{refresh_token}` → `{status: "OK"}` | 401 | `X-User-Id` | ghi `refresh_sessions.revoked_at` |
| `GET /users/me` | Hồ sơ người đang đăng nhập + các tổ chức thành viên | → `{id, email, display_name, memberships[]}` với `memberships: [{organization_id, name, slug, roles[]}]` (`roles[]` là mã role user có trong org đó, ví dụ `["OWNER"]`) | 401 | Self | đọc `users`, `memberships`, `membership_roles`, `organizations` |
| `POST /organizations` | Tạo tổ chức, người tạo tự thành membership role `OWNER` | `{name, slug}` → 201 `{organization_id}` | 409 slug trùng, 400 | Đã đăng nhập | ghi `organizations`, `memberships`, `membership_roles`; phát `OrganizationCreated` |
| `GET /organizations/{orgId}` | Chi tiết tổ chức + vai trò của tôi trong org | → `{id, name, slug, my_roles[]}` | 404, 403 | `org.read` hoặc là thành viên | đọc |
| `GET /organizations/{orgId}/members` | Danh sách thành viên kèm role đang gán | → `{items:[{user_id,display_name,status,roles[]}],total,limit,offset}` | 403, 404 | `org.member.read` | đọc `memberships`, `membership_roles` |
| `PUT /organizations/{orgId}/members/{userId}/roles` | Gán lại (thay thế) role cho một membership | `{roles: [{code, resource_type, resource_id}]}` → `{status: "OK"}` | 403, 404 | `org.member.manage` | ghi `membership_roles`; phát `MembershipChanged` |
| `POST /internal/authorization/check` | Điểm chốt quyền duy nhất của hệ thống | `{user_id, organization_id, resource_type, resource_id, permission}` → `{allowed: true/false, reason}` | 400 | Nội bộ | đọc `memberships`, `roles`, `permissions`, `role_permissions`, `membership_roles` |
| `GET /internal/users/{userId}/public-profile` | Tên công khai; chỉ id/display_name, không avatar/email; dùng cho API Composition tương lai | → `{id, display_name}` | 404 | Nội bộ | đọc `users` |
| `GET /public/organizations/{slug}` | Trang tin công khai của ban tổ chức | → `{name, slug}` | 404 | Công khai | đọc `organizations` |
| `POST /organizations/{orgId}/members/invitations` | M2/P6 mời user đã có tài khoản | `{email,roles[]}` → 201 `{invitation_id,status:"PENDING",expires_at}` | 400/403/404; 409 ALREADY_MEMBER/INVITATION_ALREADY_PENDING | OWNER ACTIVE đúng org | ghi invitation/idempotency, không MembershipChanged |
| `GET /users/me/invitations` | Lời mời của tôi, mọi trạng thái | `limit/offset` → `{items,total,limit,offset}` | 400/401/403 | Self ACTIVE | đọc, effective expiry không ghi |
| `POST /users/me/invitations/{id}/accept` | Nhận snapshot role phía server | `{}` hoặc không body → 200 `{invitation_id,status:"ACCEPTED",membership_id}` | 403/404; 409 INVITATION_EXPIRED/INVITATION_NOT_PENDING/ALREADY_MEMBER | Đúng recipient; inviter còn OWNER ACTIVE | membership/assignment/revision1/CREATED/outbox/result nguyên tử |
| `POST /users/me/invitations/{id}/decline` | Từ chối | `{}` hoặc không body → 200 `{invitation_id,status:"DECLINED"}` | 403/404; 409 INVITATION_EXPIRED/INVITATION_NOT_PENDING | Recipient ACTIVE | invitation/result; không MembershipChanged |
| `POST /organizations/{orgId}/members/invitations/{id}/revoke` | Thu hồi | `{}` hoặc không body → 200 `{invitation_id,status:"REVOKED"}` | 403/404; 409 INVITATION_EXPIRED/INVITATION_NOT_PENDING | Bất kỳ OWNER ACTIVE đúng org | invitation/result; không MembershipChanged |
| STRETCH `GET /internal/users/{userId}/contact` | Tra email theo user_id. Không dùng ở MUST vì email đã có trong payload event | | | Nội bộ | |

## 2. Event Service (`event_db`)

P8/D09/F05: [Event resolver OpenAPI 0.1.0-draft](../../shared/contracts/http/event-context.draft.openapi.json) là artifact đề xuất cho truy vấn nội bộ xác minh event/org kể cả DRAFT. Không route qua Gateway hoặc Swagger public. Interface/fixture P5/P6 đã ACCEPTED riêng, HTTP/adapter/lifecycle M4 chưa duyệt/chưa triển khai. Decision/timeout/error mapping và test tích hợp cần bên nhận tại [handoff D09](../integration/identity-handoff.md#d09-draft); không copy payload riêng vào catalog.

| API | Làm gì | Vào → Ra | Lỗi | Quyền | Event / bảng ghi |
|---|---|---|---|---|---|
| `POST /events` | Tạo event ở trạng thái `DRAFT` | `{organization_id, title, slug, description, starts_at, ends_at, timezone, venue}` → `{event_id, version}` | 400, 403, 409 slug trùng trong org | `event.create` trên organization | ghi `events`; không phát event (DRAFT chưa liên quan consumer) |
| `GET /events/{eventId}` | Chi tiết event cho trang quản trị | → toàn bộ cột + `version` | 404, 403 | `event.read` trên event | đọc |
| `GET /organizations/{orgId}/events?status=&from=&to=` | Lịch event của một tổ chức, có lọc | → `[{id, title, slug, status, starts_at}]` + `total` | 403 | `event.read` trên organization | đọc |
| `PATCH /events/{eventId}` | Sửa thông tin; chống ghi đè bằng `version`. Sau PUBLISHED chỉ sửa `title`/`description`/`venue` | `{If-Match version, fields...}` → `{event_id, version+1}` | 403, 404, 409 version lệch, 409 `TIME_LOCKED` khi đổi giờ mà đã có chỗ bán/giữ | `event.update` | ghi `events`; phát `EventUpdated` |
| `POST /events/{eventId}/publish` | `DRAFT` → `PUBLISHED`, mở bán | → `{status: "PUBLISHED"}` | 403, 404, 409 trạng thái không hợp lệ | `event.publish` | ghi `events`; phát `EventPublished` |
| `POST /events/{eventId}/cancel` | → `CANCELLED`, kèm lý do | `{reason}` → `{status: "CANCELLED"}` | 403, 404 | `event.cancel` | ghi `events`; phát `EventCancelled` |
| `GET /public/events?q=&from=&limit=&offset=` | Trang chủ tìm event đã đăng | → `[{id, slug, title, starts_at, organization_slug}]` | 400 | Công khai | đọc |
| `GET /public/events/{slug}` | Event công khai cho trang chi tiết | → `{title, description, starts_at, ends_at, timezone, venue, status, organization_id}` | 404 nếu chưa PUBLISHED | Công khai | đọc |
| STRETCH `GET/PUT /events/{eventId}/speakers`, `/schedule`, `/assets` | Diễn giả, lịch nhiều phiên, ảnh | | | `event.update` | |

Payload `EventPublished` và `EventCancelled` gồm `event_id`, `organization_id`, `slug`, `title`, `status`, `starts_at`, `ends_at`, `cancelled_reason` — đủ để Registration và Payment phản ứng mà không gọi lại Event. `EventUpdated` gồm `event_id`, `slug`, `title`, `status`, `starts_at`, `ends_at` để Registration ghi đè `event_snapshot`.

## 3. Registration & Ticketing Service (`registration_db`)

| API | Làm gì | Vào → Ra | Lỗi | Quyền | Event / bảng ghi |
|---|---|---|---|---|---|
| `POST /events/{eventId}/ticket-types` | Tạo loại vé và cấp quota ban đầu | `{name, price, currency, capacity, sales_start, sales_end}` → `{ticket_type_id}` | 400, 403, 409 event chưa PUBLISHED | `event.update` trên event | ghi `ticket_types`, `inventory` (sold=0, reserved=0) |
| `GET /events/{eventId}/ticket-types` | Danh sách loại vé cho trang bán | → `[{id, name, price, currency, status, sales_start, sales_end}]` | 404 | Công khai khi event PUBLISHED | đọc `ticket_types`, `event_snapshot` |
| `GET /events/{eventId}/availability` | Chỗ còn từng loại, tính `capacity - sold - reserved`, kiểm tra cửa bán theo snapshot | → `[{ticket_type_id, name, price, currency, capacity, sold, reserved, available, sales_open, sales_start, sales_end, status}]` (`status` loại vé: `ACTIVE`/`CLOSED`) | 404, 409 event không PUBLISHED | Công khai | đọc `inventory`, `ticket_types`, `event_snapshot` (không cache quá 5 giây) |
| `PATCH /ticket-types/{ticketTypeId}` | Đổi giá/trạng thái/thời hạn bán; `capacity` chỉ được tăng | `{price?, status?, sales_start?, sales_end?, capacity?}` → `{status: "OK"}` | 403, 404, 409 capacity thấp hơn `sold+reserved` | `event.update` | ghi `ticket_types`, `inventory` |
| `POST /events/{eventId}/reservations` | **Giữ chỗ**: khóa inventory, tăng `reserved`, tạo reservation. Nếu `total_amount = 0` thì confirm và phát vé ngay trong cùng transaction | header `Idempotency-Key`, `{items: [{ticket_type_id, quantity}]}` → vé miễn phí: `{registration_id, tickets: [{ticket_id, code, ticket_type_name, status}]}`; vé có phí: `{reservation_id, status: "HELD", expires_at, total_amount, currency}` | 400 thiếu key, 409 `SOLD_OUT`, 409 `SALES_CLOSED`, 404 | Đã đăng nhập | ghi `reservations`, `reservation_items`, `inventory`, `outbox`; vé có phí mới phát `ReservationCreated` |
| `GET /reservations/{reservationId}` | Trạng thái reservation; frontend polling chờ kết quả thanh toán | → `{status, expires_at, items[], total_amount, payment_status}` | 404, 403 không phải chủ | Self | đọc `reservations`, `reservation_items` |
| `POST /reservations/{reservationId}/confirm` | `reserved` → `sold`, tạo registration + phát vé. **Nội bộ saga**, không route qua Gateway cho user | → `{registration_id, tickets[]}` | 409 đã confirm/hết hạn, 403 | Nội bộ | ghi `registrations`, `tickets`, `inventory`, `outbox`; phát `RegistrationConfirmed`, `TicketIssued` |
| `DELETE /reservations/{reservationId}` | Hủy chủ động, hoàn lại `reserved` | → `{status: "RELEASED"}` | 404, 409 đã confirm | Self | ghi `reservations`, `inventory`, `outbox`; phát `ReservationReleased` (`CANCELLED`) |
| `GET /users/me/tickets` | Vé của tôi + trạng thái check-in; title/slug/ngày lấy từ `event_snapshot` nên không gọi sang Event | → `[{ticket_id, code, event_id, event_title, event_slug, event_starts_at, event_status, ticket_type_name, status, checked_in_at}]` | 401 | Self | đọc `tickets`, `registrations`, `ticket_types`, `event_snapshot` |
| `GET /events/{eventId}/tickets?status=&limit=&offset=` | Bảng vé của event cho bàn check-in: mã vé, trạng thái, thời điểm đã vào (không kèm tên người mua) | → `[{ticket_id, code, ticket_type_name, status, checked_in_at}]` + `total` | 404, 403 | `event.read` trên event | đọc `tickets`, `ticket_types` |
| `POST /tickets/check-in` | Chuyển vé sang `USED`, ghi `checked_in_at`; tra vé theo **mã in trên ticket** | `{code}` → `{ticket_id, status: "USED", checked_in_at, event_id, event_title, ticket_type_name}` | 404 mã không tồn tại, 409 `ALREADY_CHECKED_IN`, 409 `TICKET_VOIDED`, 403 | `ticket.checkin` trên event sở hữu mã vé | ghi `tickets`; không phát event ở MUST |
| consume `PaymentSucceeded` / `PaymentFailed` | Confirm hoặc release theo saga (quyết định 3) | | | Nội bộ | như `confirm` |
| consume `EventPublished` / `EventUpdated` / `EventCancelled` | Cập nhật `event_snapshot`; khi cancel thì release `reserved`, đánh dấu vé `VOIDED` và phát `BookingCancelled` cho từng registration | | | Nội bộ | ghi `event_snapshot`, `reservations`, `registrations`, `tickets`, `outbox` |
| Worker (không phải API) | Quét `HELD` quá `expires_at` bằng `FOR UPDATE SKIP LOCKED`, giải phóng `reserved` đúng một lần | | | Nội bộ | phát `ReservationReleased` (`reason: EXPIRED`) |

Ghi chú schema và field, vì UI đọc trực tiếp các giá trị này:

- `payment_status` trong `GET /reservations/{id}` lấy từ cột `payment_status` do chính Registration cập nhật khi tiêu `PaymentSucceeded`/`PaymentFailed` — Registration **không** gọi REST sang Payment.
- `tickets.status` chỉ nhận `ISSUED` (vé còn hiệu lực) / `USED` (đã check-in) / `VOIDED` (event bị hủy). `ticket_types.status` chỉ nhận `ACTIVE` / `CLOSED`. Giá trị khác là lỗi seed, UI hiển thị nguyên văn và report.
- `reservations.status` chỉ nhận `HELD` / `CONFIRMED` / `RELEASED` (xem §3.3 kiến trúc).
- `venue` là JSONB nhưng **key cố định** `{name, address}`, mỗi key string rỗng được phép, không thêm key mới ở MUST.
- `409 ALREADY_CHECKED_IN` phải trả `message` tiếng Việt chứa timestamp RFC3339 của lần check-in trước, ví dụ "Mã vé đã được check-in lúc 2026-12-01T11:04:00Z." — UI in nguyên văn `message`, không tra lại bảng vé để suy ra.
- Payload event nào nuôi các field trên nằm ở [shared/contracts/events/README.md](../../shared/contracts/events/README.md).

## 4. Payment Service (`payment_db`)

| API | Làm gì | Vào → Ra | Lỗi | Quyền | Event / bảng ghi |
|---|---|---|---|---|---|
| consume `ReservationCreated` | Tạo giao dịch `PENDING`, idempotent theo `reservation_id` của message (một reservation một giao dịch) | | trùng message → bỏ qua | Nội bộ | ghi `payments` (kèm `event_id`), `outbox` |
| `GET /internal/payments/{paymentId}` | Trạng thái giao dịch | → `{status, amount, currency, provider_reference}` | 404 | Nội bộ | đọc |
| `GET /internal/payments/by-reservation/{reservationId}` | Payment của một reservation, cho trang "vé của tôi" và demo | → `{payment_id, status}` | 404 | Nội bộ | đọc |
| `POST /internal/payments/{paymentId}/simulate` | Bấm nút trình bày SUCCESS/FAILURE trong demo; mode `mock` tự SUCCESS sau `PAYMENT_MOCK_DELAY_SECONDS` | `{outcome: "SUCCESS" hoặc "FAILURE"}` + HMAC mock | 401 chữ ký sai, 409 đã chốt trạng thái | Nội bộ | ghi `payments`, `outbox`; phát `PaymentSucceeded`/`PaymentFailed` |
| `POST /internal/payments/{paymentId}/refund` | Hoàn tiền toàn phần hoặc một phần | `{amount?}` → `{refund_id, status}` | 404, 409 quá số tiền/chưa thành công | `payment.refund` | ghi `refunds`, `outbox`; phát `RefundCompleted` |
| consume `EventCancelled` | Refund 100% mọi giao dịch SUCCESS có cùng `event_id` (quyết định 7) | | idempotent theo message_id | Nội bộ | ghi `refunds`, `outbox`; phát `RefundCompleted` |
| STRETCH `POST /internal/payments` | Tạo giao dịch bằng REST cho kịch bản tạo lại thủ công | | | Nội bộ | |

## 5. Notification Service (`notification_db`)

| API | Làm gì | Vào → Ra | Lỗi | Quyền | Event / bảng ghi |
|---|---|---|---|---|---|
| consume `RegistrationConfirmed`, `TicketIssued`, `ReservationReleased`, `BookingCancelled` | Tạo job email; `recipient_email` và `template_key` lấy thẳng từ payload | | | Nội bộ | ghi `notification_jobs`, `processed_messages` |
| `GET /internal/notifications?status=&limit=` | Bảng job để chứng minh luồng bất đồng bộ trong demo và báo cáo | → `[{id, event_type, recipient_email, status, attempts}]` | 400 | Nội bộ | đọc |
| STRETCH `GET /users/me/notifications` | Trung tâm thông báo trong ứng dụng; cần thêm cột `read_at TIMESTAMPTZ NULL` vào `notification_jobs` | → `[{id, template_key, payload, created_at, read_at}]` | 401 | Self | đọc `notification_jobs` |
| Worker (không phải API) | Gửi qua Mailpit hoặc log, retry có backoff, message hỏng đẩy sang DLQ | | | Nội bộ | ghi `notification_jobs.status`/`attempts` |

Notification không nhận `EventUpdated` hay `EventCancelled`: hai event đó không chỉ định người nhận cụ thể.

## 6. API Composition tại Gateway

| API | Làm gì | Nguồn | Fallback |
|---|---|---|---|
| `GET /api/public/events/{slug}/details` | Ghép `event` + `organization` + `availability` thành một response | Event, Identity `GET /public/organizations/{slug}`, Registration | Một nguồn lỗi → vẫn trả phần đã có kèm `degraded: true` và `degraded_sources[]`; chỉ 502 khi cả ba nguồn lỗi |
| `GET /api/users/me/dashboard` | Vé sắp tới + sự kiện tôi quản lý | Registration, Event | Như trên |

Gateway không tự quyết định giá, quota hay trạng thái nghiệp vụ; các route còn lại chỉ chuyển tiếp `/api/...` xuống service sở hữu.

Shape response của `GET /api/public/events/{slug}/details` (frontend chỉ cần một request này cho trang chi tiết):

```json
{
  "event": {
    "id": "uuid", "slug": "auto-demo", "title": "string", "description": "string",
    "starts_at": "2026-12-01T02:30:00Z", "ends_at": "2026-12-01T09:00:00Z",
    "timezone": "Asia/Ho_Chi_Minh", "venue": { "name": "string", "address": "string" },
    "status": "PUBLISHED", "organization_id": "uuid"
  },
  "organization": { "name": "Luma Studio", "slug": "luma" },
  "availability": [
    { "ticket_type_id": "uuid", "name": "Early", "price": "150000.00", "currency": "VND",
      "capacity": 100, "sold": 40, "reserved": 5, "available": 55,
      "sales_open": true, "sales_start": "2026-11-20T02:00:00Z", "sales_end": "2026-11-30T23:59:59Z",
      "status": "ACTIVE" }
  ],
  "degraded": false,
  "degraded_sources": []
}
```

`degraded_sources` chỉ chứa các giá trị `event`, `organization`, `availability`. Nguồn lỗi thì key đó có giá `null` và UI hiện empty state riêng cho khu đó (xem [docs/ui/03](../ui/03-event-detail-and-booking.md)).

## 7. Ma trận use case -> API

| Use case | Chuỗi API |
|---|---|
| User đăng ký và đăng nhập | `POST /auth/register` → `POST /auth/login` → `GET /users/me` |
| Tạo tổ chức, gán role người quản lý | `POST /organizations` → `PUT /organizations/{id}/members/{userId}/roles` |
| Admin tạo và công bố event | `POST /events` → `POST /events/{id}/publish` → `EventPublished` → Registration cập nhật `event_snapshot` |
| Mở bán | `POST /events/{id}/ticket-types` → `GET /events/{id}/availability` |
| User mua vé **có phí** | `GET /public/events/{slug}` → `POST /events/{id}/reservations` (HELD) → `ReservationCreated` → Payment tạo `PENDING` → `PaymentSucceeded` → Registration confirm → `TicketIssued` → Notification gửi email → frontend đọc `GET /reservations/{id}` |
| User mua vé **miễn phí** | `POST /events/{id}/reservations` → confirm trong cùng transaction → `TicketIssued` → email. Không chạm Payment |
| Hết giờ giữ chỗ | worker `expires_at` → release `reserved` → `ReservationReleased` (`EXPIRED`) → email |
| Thanh toán thất bại | `PaymentFailed` → Registration release `reserved` → `ReservationReleased` (`PAYMENT_FAILED`) → email |
| Event bị hủy | `POST /events/{id}/cancel` → `EventCancelled` → Registration release/void + `BookingCancelled` → email; Payment tự refund → `RefundCompleted` |
| Check-in tại cửa | `GET /events/{id}/tickets` (organizer mở bảng vé) → `POST /tickets/check-in` khi khách đọc mã |
| Trang chủ sự kiện | `GET /public/events` → `GET /api/public/events/{slug}/details` |

## 8. Quyết định đã chốt

M3 messaging Identity được duyệt riêng A–E ngày 14/11/2026 theo [ADR 0005](../adr/0005-m3-outbox-delivery.md). Delivery/topology/retry/storage authority: [messaging v1](messaging.md); payload authority tiếp tục ba JSON Schema Identity v1. SENT là broker handoff có route ít nhất một queue, không chứng minh consumer hoặc mọi queue đích đã nhận. API transaction không phụ thuộc broker; không invitation event/email/consumer MUST mới. Implementation/verification ở [P7](../../services/identity-service/report/REPORT_M3_P7_OUTBOX_DELIVERY_01.md), không suy PASS từ acceptance.

Tám quyết định tại §1.1 của [docs/architecture.md](../architecture.md) đã áp vào bảng API trên: email trong payload, vé miễn phí xác nhận một bước, vé có phí chỉ confirm bằng `PaymentSucceeded`, Payment khởi động bằng event (bỏ REST ở MUST), Speaker/Attendee không có API riêng, sửa event sau PUBLISHED nhưng khóa giờ khi đã có chỗ bán, event cancel tự hoàn tiền 100%, JWT HS256.

Ghi chú lịch sử trước freeze: hai mục từng chờ là permission/role và messaging. Cập nhật P8 14/11/2026: Identity đã chốt 10 permission/4 role tại ADR0003; delivery/topology ba event Identity tại messaging v1/ADR0005. Không hỏi duyệt lại các quyết định này. Phần contract/liên kết service còn lại vẫn cần owner/consumer review riêng; đặc biệt D09 HTTP resolver/lifecycle còn DRAFT, và messaging ngoài Identity không tự được freeze từ M3.

### M2/P6 — chốt riêng 14/11/2026

Người dùng xác nhận toàn bộ A–E trong [contract P6](../../services/identity-service/report/REPORT_M2_P6_CONTRACT_01.md); [ADR 0004](../adr/0004-m2-p6-invitations.md). HTTP canonical v1.2.0 là authority. Invitation 7 ngày, partial unique PENDING/org/recipient, snapshot bất biến; existing membership ACTIVE/INACTIVE không bị ghi đè. Bốn POST cần key TTL24h/lock2s; replay kiểm quyền hiện tại nhưng không đòi PENDING. Accept replay không kiểm lại inviter hoặc expiry, cần recipient và membership kết quả ACTIVE. Fresh key trên terminal state 409. List limit20/max100/offset, sort created_at/id DESC, không email. EVENT create/accept chỉ fixture test, normal thiếu resolver fail closed. Không thêm event invitation hoặc email; manual Swagger/DOC-01 M2 PASS — USER-CONFIRMED theo [nghiệm thu](../../services/identity-service/report/REPORT_M2_ACCEPTANCE_01.md). Xem [bằng chứng](../../services/identity-service/report/REPORT_M2_P6_INVITATION_01.md).
