# Kế hoạch kiến trúc LumaSOA

## 1. Mục tiêu và quyết định

Nền tảng quản lý tổ chức, sự kiện, RBAC đa cấp và đăng ký vé giới hạn. API Gateway là cổng duy nhất từ frontend; có năm core microservices độc lập; mỗi service sở hữu PostgreSQL riêng; RabbitMQ chuyển sự kiện nghiệp vụ bất đồng bộ; local được điều phối bằng Docker Compose ở gốc.

**Services:** Identity & Organization, Event, Registration & Ticketing, Payment, Notification.

**Quy tắc dữ liệu:** không chia sẻ database, không FK chéo service. Dùng UUID tham chiếu logic. Service sở hữu dữ liệu là nơi duy nhất được ghi dữ liệu đó. Gateway compose response nhưng không sở hữu nghiệp vụ.

**Phạm vi:** hoàn thành trong 4 tuần với 5 người, mỗi người một service. Mọi hạng mục chia thành MUST (nghiệm thu) và STRETCH (mở rộng) ở §3.0; chỉ tính tiến độ theo MUST.

### 1.1 Quyết định chốt (không bàn lại khi code)

| # | Quyết định | Lý do chọn hướng đơn giản |
|---|---|---|
| 1 | Email người nhận nằm **trong payload event**. `RegistrationConfirmed`, `TicketIssued`, `ReservationReleased`, `BookingCancelled` đều mang `recipient_email`; endpoint `GET /internal/users/{id}/contact` xuống STRETCH | Notification không gọi ngược Identity nên vẫn đúng nguyên tắc service-autonomy, và đỡ một điểm tích hợp |
| 2 | **Vé miễn phí xác nhận trong một bước.** `total_amount = 0` thì `POST /reservations` chuyển thẳng sang `CONFIRMED` và phát vé trong cùng transaction, không đi qua Payment | Bỏ được một vòng saga cho luồng dễ nhất của demo |
| 3 | **Vé có phí xác nhận bằng event, không bằng nút bấm.** Reservation ở `HELD`; chỉ `PaymentSucceeded` mới confirm; frontend theo dõi qua `GET /reservations/{id}` | Một đường confirm duy nhất, không có trạng thái trung gian do user tạo |
| 4 | **Payment khởi động bằng `ReservationCreated` từ broker**, không phải lệnh gọi REST. `PAYMENT_PROVIDER_MODE=mock` tự trả SUCCESS sau `PAYMENT_MOCK_DELAY_SECONDS`; `POST /internal/payments` xuống STRETCH | Tài liệu cũ nói cả hai cách; chọn một để hết mâu thuẫn |
| 5 | **Speaker và Attendee không có API riêng ở MUST**, chỉ là role có permission seed (§3.1.1) | Thêm màn hình và endpoint mà không thêm điểm SOA |
| 6 | **Sửa event sau PUBLISHED được, nhưng không đổi giờ** khi `sold + reserved > 0` → `409`. Chỉ sửa tiêu đề, mô tả, địa điểm | Tránh phải thiết kế luồng "đổi giờ thì vé cũ xử lý sao" |
| 7 | **Event cancel tự hoàn tiền 100%.** Payment tiêu `EventCancelled` rồi refund các giao dịch SUCCESS có `event_id` trùng; Registration giải phóng quota và phát `BookingCancelled` cho Notification | Không xây UI hoàn tiền thủ công; `payments` cần thêm cột `event_id` |
| 8 | **JWT HS256 với secret chung trong network local**: Identity ký, Gateway verify | Một secret trong `.env`, khỏi dựng key pair và JWKS |

Chi tiết endpoint của từng service ở [danh mục API](api/catalog.md).

## 2. Sơ đồ tổng quan

```text
Frontend ──JWT──> API Gateway ──REST──> Identity & Organization ──> identity_db
                         ├────────────> Event Service ───────────> event_db
                         ├────────────> Registration Service ────> registration_db
                         ├────────────> Payment Service ─────────> payment_db
                         └────────────> Notification Service ────> notification_db

Identity/Event/Registration/Payment ──domain events──> RabbitMQ ──> consumers
```

Các API service chỉ expose trong Docker network; Gateway là ingress public. RabbitMQ không thay thế REST cho truy vấn cần kết quả ngay.

## 3. Phân hệ, schema và API

### 3.0 Phạm vi 4 tuần: MUST vs STRETCH

Mặc định mọi bảng và endpoint trong §3 là MUST. Chỉ những mục đánh dấu `(STRETCH)` hoặc ghi ở cột STRETCH dưới đây được phép hoãn; không mở STRETCH khi MUST chưa có bằng chứng.

| Miền | MUST (bắt buộc nghiệm thu) | STRETCH (hoãn được, không cản nghiệm thu) |
|---|---|---|
| Identity | Tám bảng ở §3.1; `register`/`login`/`refresh`/`logout`; `GET /users/me`; tạo organization + membership + gán role; `POST /internal/authorization/check` khớp resource scope | Endpoint invitations; API tự quản lý permission; phát hiện reuse refresh token; `GET /internal/users/{id}/contact` |
| Event | Bảng `events`; CRUD + publish/cancel; check quyền qua Identity | `event_speakers`, `event_schedule_items`, `event_assets` |
| Registration | `ticket_types`, `inventory`, `reservations`, `reservation_items`, `registrations`, `tickets`, `event_snapshot`; lock `FOR UPDATE` + `CHECK` quota; `Idempotency-Key`; confirm vé miễn phí một bước; worker giải phóng hết hạn; outbox | Check-in bằng QR/scanning; waitlist; giỏ vé nhiều loại có ưu đãi |
| Payment | `payments` (kèm `event_id`), `refunds`, `processed_messages`, `outbox_events`; khởi động bằng `ReservationCreated`; mock provider idempotent; tự refund khi `EventCancelled` | `POST /internal/payments` qua REST; adapter provider thật; báo cáo đối soát |
| Notification | `notification_jobs`, `processed_messages`; tiêu bốn event mang `recipient_email`; consumer idempotent; retry; Mailpit hoặc log | `delivery_attempts`; template engine; SMS/push; `GET /users/me/notifications` |
| Gateway | Routing qua một cổng; verify JWT; một endpoint API Composition; error envelope thống nhất | Rate limit phân tán, cache, circuit breaker |
| Frontend | Năm trang theo [tài liệu UI](ui/README.md): đăng nhập/đăng ký, danh sách event, chi tiết event kèm đặt vé, vé của tôi, và một trang organizer tối giản (tạo + publish event, thêm loại vé, check-in theo mã vé) | Dashboard, quản lý thành viên/role, đổi giờ event, design system riêng, QR scanning |
| Hạ tầng | Một `docker-compose.yml` chạy 5 database + RabbitMQ + Mailpit + Gateway + 5 service | Observability đầy đủ, K8s, auto-scaling |

### 3.1 Identity & Organization Service (`identity_db`)

**Trách nhiệm:** đăng ký/đăng nhập, JWT/refresh session, user, organization, membership, role, permission, authorization check.

| Bảng | Cột chính |
|---|---|
| `users` | `id UUID PK`, `email CITEXT UNIQUE`, `display_name TEXT`, `password_hash TEXT`, `status TEXT`, `created_at TIMESTAMPTZ` |
| `organizations` | `id UUID PK`, `name TEXT`, `slug TEXT UNIQUE`, `created_by UUID` |
| `memberships` | `id UUID PK`, `organization_id UUID`, `user_id UUID`, `status TEXT`, `joined_at TIMESTAMPTZ`; unique `(organization_id,user_id)` |
| `roles` | `id UUID PK`, `organization_id UUID NULL`, `code TEXT`, `name TEXT`, `scope TEXT` (`ORG`/`EVENT`) |
| `permissions` | `id UUID PK`, `code TEXT UNIQUE`, `description TEXT` |
| `role_permissions` | `role_id UUID`, `permission_id UUID`, unique cặp; FK nội bộ |
| `membership_roles` | `membership_id UUID`, `role_id UUID`, `resource_type TEXT NULL`, `resource_id UUID NULL` |
| `refresh_sessions` | `id UUID PK`, `user_id UUID`, `token_hash TEXT`, `expires_at TIMESTAMPTZ`, `revoked_at TIMESTAMPTZ NULL` |

**RBAC:** Owner cấp organization quản lý cấu hình, thành viên và sự kiện. Admin có các permission quản trị được gán. Speaker là role cấp event với quyền giới hạn. Attendee là người mua vé, không có permission quản trị. Quyền phải khớp cả role/action lẫn phạm vi resource. Bảng permission và role seed ở §3.1.1; Speaker/Attendee không có endpoint riêng (quyết định 5).

**Endpoints:** `POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`; `GET /users/me`; `POST /organizations`; `GET /organizations/{orgId}`; `GET /organizations/{orgId}/members`; `PUT /organizations/{orgId}/members/{userId}/roles`; `GET /public/organizations/{slug}`; `GET /internal/users/{userId}/public-profile`; `POST /internal/authorization/check`. STRETCH: `POST /organizations/{orgId}/members/invitations`, `GET /internal/users/{userId}/contact`.

**Tích hợp:** Gateway verify JWT HS256 bằng secret chung (quyết định 8), service nhận `X-User-Id`; Event Service gọi authorization check. Phát `UserRegistered`, `OrganizationCreated`, `MembershipChanged`.

### 3.1.1 Permission và role seed

Migration seed của Identity tạo đúng 10 mã permission: `org.read`, `org.member.read`, `org.member.manage`, `event.create`, `event.read`, `event.update`, `event.publish`, `event.cancel`, `ticket.checkin`, `payment.refund`. Service khác chỉ gửi `permission` khi check, không tự định nghĩa mã mới.

| Role | Scope | Permission |
|---|---|---|
| `OWNER` | ORG | Toàn bộ 10 mã, áp dụng cho event thuộc org đó |
| `ADMIN` | ORG | Như OWNER nhưng không có `org.member.manage` |
| `SPEAKER` | EVENT | `event.read` trên đúng event được gán |
| `ATTENDEE` | EVENT | Không có permission quản trị; check-in do OWNER/ADMIN của org sở hữu event |

`POST /internal/authorization/check` nhận `permission` + `resource_type`/`resource_id`; permission cấp ORG được kế thừa xuống event thuộc org, permission cấp EVENT không lan sang event khác.

### 3.2 Event Service (`event_db`)

**Trách nhiệm (MUST):** thông tin event, địa điểm trong `venue`, trạng thái publish/cancel.

| Bảng | Cột chính |
|---|---|
| `events` | `id UUID PK`, `organization_id UUID`, `created_by UUID`, `title TEXT`, `slug TEXT`, `description TEXT`, `status TEXT` (`DRAFT`/`PUBLISHED`/`CANCELLED`), `starts_at TIMESTAMPTZ`, `ends_at TIMESTAMPTZ`, `timezone TEXT`, `venue JSONB` key cố định `{name, address}`, `version BIGINT` |
| `event_speakers` (STRETCH) | `id UUID PK`, `event_id UUID`, `user_id UUID NULL`, `name TEXT`, `bio TEXT`, `sort_order INT` |
| `event_schedule_items` (STRETCH) | `id UUID PK`, `event_id UUID`, `title TEXT`, `starts_at TIMESTAMPTZ`, `ends_at TIMESTAMPTZ`, `speaker_id UUID NULL` |
| `event_assets` (STRETCH) | `id UUID PK`, `event_id UUID`, `asset_url TEXT`, `kind TEXT`, `metadata JSONB` |

`organization_id`, `created_by`, `user_id` là tham chiếu, không FK sang Identity DB. Endpoints: `POST /events`, `GET/PATCH /events/{eventId}`, `POST /events/{eventId}/publish`, `POST /events/{eventId}/cancel`, `GET /organizations/{orgId}/events`, `GET /public/events`, `GET /public/events/{slug}`. Kiểm tra quyền qua Identity trước mọi thay đổi. Tạo `DRAFT` không phát event; chỉ phát `EventUpdated` khi sửa, `EventPublished` khi publish, `EventCancelled` khi hủy. `PATCH` sau PUBLISHED chỉ sửa `title`, `description`, `venue`; đổi `starts_at`/`ends_at` khi `sold + reserved > 0` trả 409 (quyết định 6). `EventPublished` và `EventCancelled` mang `event_id`, `organization_id`, `slug`, `title`, `status`, `starts_at`, `ends_at` để consumer không phải gọi lại Event; `EventUpdated` mang đủ bộ `title`, `slug`, `starts_at`, `ends_at`, `status` để Registration ghi đè `event_snapshot`.

### 3.3 Registration & Ticketing (`registration_db`)

**Trách nhiệm:** loại vé, quota, giữ chỗ, đăng ký, vé và check-in. Check-in ở MUST chỉ là chuyển `status` + `checked_in_at`; QR/scanning là STRETCH.

| Bảng | Cột chính |
|---|---|
| `ticket_types` | `id UUID PK`, `event_id UUID`, `name TEXT`, `price NUMERIC(12,2)`, `currency CHAR(3)`, `capacity INT`, `sales_start/end TIMESTAMPTZ`, `status TEXT` (`ACTIVE`/`CLOSED`) |
| `inventory` | `ticket_type_id UUID PK`, `capacity INT`, `sold INT`, `reserved INT`, `version BIGINT`, `updated_at TIMESTAMPTZ` |
| `reservations` | `id UUID PK`, `user_id UUID`, `event_id UUID`, `status TEXT` (`HELD`/`CONFIRMED`/`RELEASED`), `payment_status TEXT NULL` (`PENDING`/`SUCCEEDED`/`FAILED`), `expires_at TIMESTAMPTZ`, `idempotency_key TEXT UNIQUE`, `created_at TIMESTAMPTZ` |
| `reservation_items` | `id UUID PK`, `reservation_id UUID`, `ticket_type_id UUID`, `quantity INT`, `unit_price NUMERIC(12,2)` |
| `registrations` | `id UUID PK`, `reservation_id UUID`, `user_id UUID`, `status TEXT`, `registered_at TIMESTAMPTZ` |
| `tickets` | `id UUID PK`, `registration_id UUID`, `ticket_type_id UUID`, `code TEXT UNIQUE`, `status TEXT` (`ISSUED`/`USED`/`VOIDED`), `checked_in_at TIMESTAMPTZ NULL` |
| `event_snapshot` | `event_id UUID PK`, `title TEXT`, `slug TEXT`, `status TEXT`, `starts_at TIMESTAMPTZ`, `ends_at TIMESTAMPTZ`, `updated_at TIMESTAMPTZ`; cập nhật từ `EventPublished`/`EventUpdated`/`EventCancelled` |

`event_id`, `user_id` là ID tham chiếu, không FK chéo. Registration không gọi REST sang Event: mọi kiểm tra "event đã publish chưa, còn trong thời gian bán không" đọc `event_snapshot` (eventual consistency, chậm nhất vài giây). Endpoint: `POST /events/{id}/ticket-types`, `GET /events/{id}/ticket-types`, `PATCH /ticket-types/{id}`, `GET /events/{id}/availability`, `POST /events/{id}/reservations` (bắt buộc `Idempotency-Key`), `GET /reservations/{id}`, `POST /reservations/{id}/confirm` (nội bộ, chỉ consumer `PaymentSucceeded` gọi; vé miễn phí đã confirm ngay trong `POST /reservations` nên không tới đây; không route qua Gateway cho user), `DELETE /reservations/{id}`, `GET /users/me/tickets`, `GET /events/{id}/tickets` (organizer, quyền `event.read`), `POST /tickets/check-in` (body `{code}`, organizer check-in theo mã vé in trên ticket; quyền `ticket.checkin`).

**Concurrency:** transaction khóa hàng inventory bằng `SELECT ... FOR UPDATE`; không gọi mạng trong transaction. Ràng buộc `CHECK (sold >= 0 AND reserved >= 0 AND sold + reserved <= capacity)`. Ghi reservation và tăng reserved nguyên tử. Nếu `total_amount = 0` thì confirm luôn trong cùng transaction (quyết định 2). Confirm chuyển `reserved` sang `sold`, tạo ticket và ghi outbox. Worker hết hạn dùng `FOR UPDATE SKIP LOCKED` để giải phóng `reserved` đúng một lần. Phát `ReservationCreated` (chỉ khi `total_amount > 0`, payload mang `event_id`), `RegistrationConfirmed`, `TicketIssued`, `ReservationReleased` (`reason` ∈ `EXPIRED`/`CANCELLED`/`PAYMENT_FAILED`/`EVENT_CANCELLED`), `BookingCancelled`; nhận `EventCancelled`, `PaymentSucceeded`, `PaymentFailed`. Event gửi cho Notification phải mang `recipient_email` (quyết định 1).

### 3.4 Payment Service (`payment_db`)

**Trách nhiệm:** khởi tạo/theo dõi giao dịch, adapter provider (mock local) và hoàn tiền. Payment không cập nhật reservation hay ticket trực tiếp, và ở MUST chỉ phản ứng theo event chứ không nhận lệnh từ frontend.

| Bảng | Cột chính |
|---|---|
| `payments` | `id UUID PK`, `reservation_id UUID`, `event_id UUID`, `user_id UUID`, `amount NUMERIC(12,2)`, `currency CHAR(3)`, `status TEXT`, `provider_reference TEXT NULL`, `idempotency_key TEXT UNIQUE`, `created_at TIMESTAMPTZ`, `updated_at TIMESTAMPTZ` |
| `refunds` | `id UUID PK`, `payment_id UUID`, `amount NUMERIC(12,2)`, `status TEXT`, `provider_reference TEXT NULL`, `created_at TIMESTAMPTZ` |
| `processed_messages` | `message_id UUID PK`, `processed_at TIMESTAMPTZ` |
| `outbox_events` | `id UUID PK`, `aggregate_id UUID`, `event_type TEXT`, `payload JSONB`, `published_at TIMESTAMPTZ NULL` |

`reservation_id`/`user_id`/`event_id` là ID tham chiếu, không FK chéo. Luồng MUST: nhận `ReservationCreated` → tạo `payments` ở `PENDING` với `idempotency_key` lấy bằng `reservation_id` của message (một reservation một giao dịch) → mock provider cho kết quả (tự SUCCESS sau `PAYMENT_MOCK_DELAY_SECONDS`, hoặc do `simulate` bấm trong demo) → phát `PaymentSucceeded`/`PaymentFailed`. Nhận `EventCancelled` → refund 100% các giao dịch SUCCESS có cùng `event_id`, phát `RefundCompleted` (quyết định 7). API nội bộ: `GET /internal/payments/{id}`, `GET /internal/payments/by-reservation/{reservationId}`, `POST /internal/payments/{id}/simulate`, `POST /internal/payments/{id}/refund`. STRETCH: `POST /internal/payments` (tạo giao dịch bằng REST), adapter provider thật, báo cáo đối soát.

### 3.5 Notification Service (`notification_db`)

**Trách nhiệm:** consumer sự kiện, email/thông báo, retry và theo dõi gửi.

| Bảng | Cột chính |
|---|---|
| `notification_jobs` | `id UUID PK`, `recipient_user_id UUID NULL`, `recipient_email TEXT`, `event_type TEXT`, `template_key TEXT`, `payload JSONB`, `status TEXT`, `attempts INT`, `created_at TIMESTAMPTZ` |
| `processed_messages` | `message_id UUID PK`, `processed_at TIMESTAMPTZ` |
| `delivery_attempts` (STRETCH) | `id UUID PK`, `job_id UUID`, `provider TEXT`, `status TEXT`, `response TEXT`, `attempted_at TIMESTAMPTZ` |

Ở MUST, kết quả mỗi lần gửi ghi trực tiếp vào `notification_jobs.status`/`attempts` và log; không cần bảng `delivery_attempts`.

Nhận `RegistrationConfirmed`, `TicketIssued`, `ReservationReleased`, `BookingCancelled` từ RabbitMQ; mỗi payload đã mang `recipient_email` (quyết định 1). Notification **không** nhận `EventUpdated` hay `EventCancelled` vì hai event đó không chỉ định người nhận cụ thể. Lưu message đã xử lý để consumer idempotent. Local có thể gửi vào Mailpit hoặc log giả lập.

## 4. Luồng nghiệp vụ

### 4.1 Complex RBAC: Admin sửa event thuộc tổ chức

```text
Admin -> Gateway: PATCH /api/events/{eventId} + JWT
Gateway: xác minh chữ ký/issuer/audience/expiry
Gateway -> Event: chuyển request kèm identity đã xác minh
Event: đọc event để biết organization_id
Event -> Identity: check(user, org, EVENT, eventId, event.update)
Identity: kiểm membership + role org/event + permission + resource scope
Identity -> Event: allow/deny
Event: allow thì cập nhật/version; deny thì 403
```

Admin của Organization A không sửa event của B. Owner/Admin/ Speaker/Attendee chỉ có quyền trong phạm vi role và permission được gán. Quyền cấp org có thể áp dụng cho event thuộc org đó; role cấp event không mở rộng sang event khác.

### 4.2 Đăng ký vé và chống overselling

```text
Client -> Gateway -> Registration: POST reservation + Idempotency-Key
Registration: BEGIN
  lookup idempotency key; nếu có thì trả kết quả cũ
  SELECT inventory ... FOR UPDATE
  kiểm tra sold + reserved + requested <= capacity
  tăng reserved
  nếu total_amount = 0: reservation CONFIRMED; tạo registration + ticket; outbox ghi RegistrationConfirmed + TicketIssued
  nếu total_amount > 0: reservation HELD + expires_at; outbox ghi ReservationCreated
Registration: COMMIT
```

Confirm cũng là một transaction: khóa reservation/inventory, xác nhận `HELD` và chưa hết hạn, trừ `reserved`, cộng `sold`, tạo registration/ticket, ghi outbox rồi commit. Với vé có phí, đường confirm duy nhất là consumer `PaymentSucceeded` gọi `POST /reservations/{id}/confirm` nội bộ; vé miễn phí đã confirm ở bước giữ chỗ (quyết định 2). Hết hạn hoặc hủy là hành động bù trừ giảm `reserved` và phát `ReservationReleased` với `reason` tương ứng. Không giữ lock khi gọi service, gửi email hoặc chờ broker. Trả `409 SOLD_OUT` nếu quota không đủ. Transactional Outbox bảo đảm commit dữ liệu và phát event nhất quán. Đây là Saga ngắn: hold → confirm hoặc release.

### 4.3 API Composition

`GET /api/public/events/{slug}/details`: Gateway gọi song song Event (`event`, `organization_id`), Identity (`GET /public/organizations/{slug}`) và Registration (`availability`) rồi trả response tổng hợp. Gateway chỉ tổng hợp response, không quyết định giá/quota. Không cache tồn kho quá 5 giây. Fallback: một nguồn lỗi thì vẫn trả các phần đã có kèm `degraded: true` và `degraded_sources: ["availability"]`; chỉ trả 502 khi cả ba nguồn đều lỗi.

Chỉ vé có phí đi qua saga. Với `total_amount = 0`, Registration confirm và phát vé ngay trong transaction giữ chỗ (quyết định 2), Payment không liên quan. Với vé có phí, Registration phát `ReservationCreated` sau khi giữ quota; Payment tiêu message, tạo giao dịch idempotent rồi phát `PaymentSucceeded` hoặc `PaymentFailed`. Registration là nơi duy nhất xác nhận reservation hoặc giải phóng quota (quyết định 3). Nếu `PaymentSucceeded` đến muộn sau khi reservation hết hạn, Payment refund cho giao dịch đã thành công. Khi event bị hủy, Payment tự refund 100% và Registration phát `BookingCancelled` để Notification gửi email (quyết định 7). Đây là Saga bất đồng bộ, không có transaction phân tán. Xem [sơ đồ Payment Saga](diagrams/payment-saga-flow.md).

## 5. Docker Compose và vận hành local

Compose gốc cần có Gateway, năm service, năm PostgreSQL database/volume độc lập, RabbitMQ và Mailpit. Chỉ Gateway expose cổng public; service và database nằm trong network riêng. Mỗi service tự chạy migration của database mình. Dùng healthcheck, biến môi trường trong `.env` (không commit secret), và Docker named volume riêng.

| Thành phần | Cổng trên host | Ghi chú |
|---|---|---|
| API Gateway | 8080 | ingress public duy nhất cho frontend |
| identity-service | không expose | 8080 trong network `backend` |
| event-service | không expose | 8080 trong network `backend` |
| registration-service | không expose | 8080 trong network `backend` |
| payment-service | không expose | 8080 trong network `backend` |
| notification-service | không expose | 8080 trong network `backend` |
| RabbitMQ | 5672, 15672 | 15672 là management UI |
| Mailpit | 1025, 8025 | 1025 SMTP, 8025 xem mail |
| 5 PostgreSQL | không expose | mỗi database một named volume |

Biến môi trường dùng chung: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `RABBITMQ_USER`, `RABBITMQ_PASSWORD`, `JWT_SECRET`, `JWT_ISSUER`, `JWT_AUDIENCE`, `PAYMENT_PROVIDER_MODE`, `PAYMENT_MOCK_DELAY_SECONDS`, `SMTP_HOST`, `SMTP_PORT`.

Lệnh dự kiến: `docker compose up --build`, `docker compose down`.

## 6. Lộ trình 4 tuần (chỉ tính MUST)

| Tuần | Việc (MUST) | Bằng chứng hoàn thành |
|---|---|---|
| 1 | Chốt tech stack. Đóng băng hợp đồng từ bản nháp [API catalog](api/catalog.md): OpenAPI cho Gateway + năm service, schema event có version, topology exchange/queue, bảng port + biến môi trường, quy ước Gateway truyền danh tính cho service. Dựng Compose cho năm database + RabbitMQ + Mailpit và một service template (healthcheck, error envelope, migration runner, outbox worker, correlation ID) | `docker compose up` healthy cho toàn bộ hạ tầng; contract được cả nhóm approve; template build ra ảnh Docker chạy được |
| 2 | Identity: auth, RBAC, `authorization/check`. Event: CRUD, publish/cancel, gọi check | Đăng nhập lấy JWT qua Gateway; admin của org A nhận 403 khi sửa event của org B |
| 3 | Registration: inventory, lock, `Idempotency-Key`, reservation hết hạn, outbox. Payment: mock + saga | 200 request đồng thời trên capacity 100: không vượt quota, không nhân đôi reservation; invariant `sold + reserved <= capacity` vẫn đúng sau khi chạy |
| 4 | Notification consumer + email. Gateway API Composition. Frontend năm trang (xem [docs/ui](ui/README.md)). Seed data, báo cáo, hướng dẫn chạy | Đường thẳng đứng: login → tạo event trên trang organizer → giữ chỗ → payment mock → nhận email → thấy vé; demo tải đồng thời chạy lại bằng một lệnh |

**Quy tắc cắt/giữ:** service nào chậm thì cắt STRETCH của service đó trước. Hai invariant không được cắt: quota `sold + reserved <= capacity` và RBAC khớp resource scope. Đường thẳng đứng tuần 4 là demo chính; STRETCH chỉ bàn sau khi nó chạy.

## 7. Tiêu chí nghiệm thu

Chỉ tính cột MUST ở §3.0; hạng mục STRETCH không nằm trong tiêu chí nghiệm thu.

- Frontend chỉ gọi Gateway; Gateway có routing, JWT chung và API Composition.
- Frontend đủ năm trang MUST trong [docs/ui](ui/README.md); không màn hình nào gọi thẳng cổng service hay endpoint `/internal/...`, và mọi state loading/empty/error/sold-out đều có đường thoát nhìn thấy được.
- Có năm service độc lập và năm PostgreSQL database riêng.
- Không FK chéo database/service; không dùng schema persistence chung.
- RBAC kiểm tra action và resource scope.
- Concurrent reservation không làm `sold + reserved` vượt capacity; retry idempotent không nhân đôi.
- Notification bất đồng bộ và không nằm trong transaction đặt vé. Payment độc lập, sở hữu payment_db riêng và không ghi reservation/ticket.
- Hệ thống local được điều phối từ một `docker-compose.yml`; tài liệu chỉ rõ cách cấu hình/chạy.
- Không có lời gọi REST ngược chiều từ consumer về service sở hữu dữ liệu: Notification không gọi Identity để lấy email, Registration không gọi Event để kiểm tra trạng thái. Mọi dữ liệu liên service đi qua event payload hoặc projection nội bộ (`event_snapshot`).





