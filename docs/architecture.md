# Kế hoạch kiến trúc LumaSOA

## 1. Mục tiêu và quyết định

Nền tảng quản lý tổ chức, sự kiện, RBAC đa cấp và đăng ký vé giới hạn. API Gateway là cổng duy nhất từ frontend; có năm core microservices độc lập; mỗi service sở hữu PostgreSQL riêng; RabbitMQ chuyển sự kiện nghiệp vụ bất đồng bộ; local được điều phối bằng Docker Compose ở gốc.

**Services:** Identity & Organization, Event, Registration & Ticketing, Payment, Notification.

**Quy tắc dữ liệu:** không chia sẻ database, không FK chéo service. Dùng UUID tham chiếu logic. Service sở hữu dữ liệu là nơi duy nhất được ghi dữ liệu đó. Gateway compose response nhưng không sở hữu nghiệp vụ.

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

### 3.1 Identity & Organization Service (`identity_db`)

**Trách nhiệm:** đăng ký/đăng nhập, JWT/refresh session, user, organization, membership, role, permission, authorization check.

| Bảng | Cột chính |
|---|---|
| `users` | `id UUID PK`, `email CITEXT UNIQUE`, `display_name TEXT`, `password_hash TEXT`, `status TEXT`, `created_at TIMESTAMPTZ` |
| `organizations` | `id UUID PK`, 
ame TEXT`, `slug TEXT UNIQUE`, `created_by UUID` |
| `memberships` | `id UUID PK`, `organization_id UUID`, `user_id UUID`, `status TEXT`, `joined_at TIMESTAMPTZ`; unique `(organization_id,user_id)` |
| `roles` | `id UUID PK`, `organization_id UUID NULL`, `code TEXT`, 
ame TEXT`, `scope TEXT` (`ORG`/`EVENT`) |
| `permissions` | `id UUID PK`, `code TEXT UNIQUE`, `description TEXT` |
| `role_permissions` | `role_id UUID`, `permission_id UUID`, unique cặp; FK nội bộ |
| `membership_roles` | `membership_id UUID`, `role_id UUID`, `resource_type TEXT NULL`, `resource_id UUID NULL` |
| `refresh_sessions` | `id UUID PK`, `user_id UUID`, `token_hash TEXT`, `expires_at TIMESTAMPTZ`, `revoked_at TIMESTAMPTZ NULL` |

**RBAC:** Owner cấp organization quản lý cấu hình, thành viên và sự kiện. Admin có các permission quản trị được gán. Speaker là role cấp event với quyền giới hạn. Attendee đăng ký ở Registration; có thể có quyền cấp event nếu sản phẩm cần. Quyền phải khớp cả role/action lẫn phạm vi resource.

**Endpoints:** `POST /auth/register`, `/auth/login`, `/auth/refresh`; `GET /users/me`; `POST /organizations`; `GET /organizations/{orgId}/members`; `POST /organizations/{orgId}/members/invitations`; `PUT /organizations/{orgId}/members/{userId}/roles`; `POST /internal/authorization/check`.

**Tích hợp:** Gateway xác minh JWT; Event Service gọi authorization check. Phát `UserRegistered`, `OrganizationCreated`, `MembershipChanged`.

### 3.2 Event Service (`event_db`)

**Trách nhiệm:** event, lịch, địa điểm, diễn giả, trạng thái publish/cancel.

| Bảng | Cột chính |
|---|---|
| `events` | `id UUID PK`, `organization_id UUID`, `created_by UUID`, `title TEXT`, `slug TEXT`, `description TEXT`, `status TEXT`, `starts_at TIMESTAMPTZ`, `ends_at TIMESTAMPTZ`, `timezone TEXT`, `venue JSONB`, `version BIGINT` |
| `event_speakers` | `id UUID PK`, `event_id UUID`, `user_id UUID NULL`, 
ame TEXT`, `bio TEXT`, `sort_order INT` |
| `event_schedule_items` | `id UUID PK`, `event_id UUID`, `title TEXT`, `starts_at TIMESTAMPTZ`, `ends_at TIMESTAMPTZ`, `speaker_id UUID NULL` |
| `event_assets` | `id UUID PK`, `event_id UUID`, `asset_url TEXT`, `kind TEXT`, `metadata JSONB` |

`organization_id`, `created_by`, `user_id` là tham chiếu, không FK sang Identity DB. Endpoints: `POST /events`, `GET/PATCH /events/{eventId}`, `POST /events/{eventId}/publish`, `POST /events/{eventId}/cancel`, `GET /organizations/{orgId}/events`, `GET /public/events/{slug}`. Kiểm tra quyền qua Identity trước thay đổi. Phát `EventPublished`, `EventUpdated`, `EventCancelled`.

### 3.3 Registration & Ticketing (`registration_db`)

**Trách nhiệm:** loại vé, quota, giữ chỗ, đăng ký, vé và check-in.

| Bảng | Cột chính |
|---|---|
| `ticket_types` | `id UUID PK`, `event_id UUID`, 
ame TEXT`, `price NUMERIC(12,2)`, `currency CHAR(3)`, `capacity INT`, `sales_start/end TIMESTAMPTZ`, `status TEXT` |
| `inventory` | `ticket_type_id UUID PK`, `capacity INT`, `sold INT`, `reserved INT`, `version BIGINT`, `updated_at TIMESTAMPTZ` |
| `reservations` | `id UUID PK`, `user_id UUID`, `event_id UUID`, `status TEXT`, `expires_at TIMESTAMPTZ`, `idempotency_key TEXT UNIQUE`, `created_at TIMESTAMPTZ` |
| `reservation_items` | `id UUID PK`, `reservation_id UUID`, `ticket_type_id UUID`, `quantity INT`, `unit_price NUMERIC(12,2)` |
| `registrations` | `id UUID PK`, `reservation_id UUID`, `user_id UUID`, `status TEXT`, `registered_at TIMESTAMPTZ` |
| `tickets` | `id UUID PK`, `registration_id UUID`, `ticket_type_id UUID`, `code TEXT UNIQUE`, `status TEXT`, `checked_in_at TIMESTAMPTZ NULL` |

`event_id`, `user_id` là ID tham chiếu, không FK chéo. Endpoint: `POST /events/{id}/ticket-types`, `GET /events/{id}/availability`, `POST /events/{id}/reservations` (bắt buộc `Idempotency-Key`), `POST /reservations/{id}/confirm`, `DELETE /reservations/{id}`, `GET /users/me/tickets`, `POST /tickets/{id}/check-in`.

**Concurrency:** transaction khóa hàng inventory bằng `SELECT ... FOR UPDATE`; không gọi mạng trong transaction. Ràng buộc `CHECK (sold >= 0 AND reserved >= 0 AND sold + reserved <= capacity)`. Ghi reservation và tăng reserved nguyên tử. Confirm chuyển reserved sang sold, tạo ticket và outbox event. Worker hết hạn giải phóng reserved đúng một lần. Phát `ReservationCreated`, `RegistrationConfirmed`, `TicketIssued`, `ReservationExpired`; nhận `EventCancelled`.

### 3.4 Payment Service (`payment_db`)

**Trách nhiệm:** khởi tạo/theo dõi giao dịch, adapter provider (mock local) và hoàn tiền. Payment không cập nhật reservation hay ticket trực tiếp.

| Bảng | Cột chính |
|---|---|
| `payments` | `id UUID PK`, `reservation_id UUID`, `user_id UUID`, `amount NUMERIC(12,2)`, `currency CHAR(3)`, `status TEXT`, `provider_reference TEXT NULL`, `idempotency_key TEXT UNIQUE`, `created_at TIMESTAMPTZ`, `updated_at TIMESTAMPTZ` |
| `refunds` | `id UUID PK`, `payment_id UUID`, `amount NUMERIC(12,2)`, `status TEXT`, `provider_reference TEXT NULL`, `created_at TIMESTAMPTZ` |
| `processed_messages` | `message_id UUID PK`, `processed_at TIMESTAMPTZ` |
| `outbox_events` | `id UUID PK`, `aggregate_id UUID`, `event_type TEXT`, `payload JSONB`, `published_at TIMESTAMPTZ NULL` |

`reservation_id`/`user_id` là ID tham chiếu, không FK chéo. API nội bộ: `POST /internal/payments` (idempotency key), `GET /internal/payments/{id}`, `POST /internal/payments/{id}/refund`. Phát `PaymentSucceeded`, `PaymentFailed`, `RefundCompleted`; callback provider phải xác minh chữ ký và xử lý idempotent.

### 3.5 Notification Service (`notification_db`)

**Trách nhiệm:** consumer sự kiện, email/thông báo, retry và theo dõi gửi.

| Bảng | Cột chính |
|---|---|
| `notification_jobs` | `id UUID PK`, `recipient_user_id UUID NULL`, `recipient_email TEXT`, `event_type TEXT`, `template_key TEXT`, `payload JSONB`, `status TEXT`, `attempts INT`, `created_at TIMESTAMPTZ` |
| `processed_messages` | `message_id UUID PK`, `processed_at TIMESTAMPTZ` |
| `delivery_attempts` | `id UUID PK`, `job_id UUID`, `provider TEXT`, `status TEXT`, `response TEXT`, `attempted_at TIMESTAMPTZ` |

Nhận `RegistrationConfirmed`, `TicketIssued`, `EventUpdated`, `EventCancelled` từ RabbitMQ. Lưu message đã xử lý để consumer idempotent. Local có thể gửi vào Mailpit hoặc log giả lập.

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
  tăng reserved; tạo reservation HELD + expires_at; ghi outbox
Registration: COMMIT
```

Confirm trong transaction: khóa reservation/inventory, xác nhận HELD và chưa hết hạn, trừ `reserved`, cộng `sold`, tạo registration/ticket, ghi outbox rồi commit. Hết hạn/hủy là hành động bù trừ giảm `reserved`. Không giữ lock khi gọi service, gửi email hoặc chờ broker. Trả `409 SOLD_OUT` nếu quota không đủ. Transactional Outbox bảo đảm commit dữ liệu và phát event nhất quán. Đây là Saga ngắn: hold → confirm hoặc expire/release.

### 4.3 API Composition

`GET /api/public/events/{slug}/details`: Gateway gọi song song Event (`event`, `organization_id`), Identity (`public organizer profile`) và Registration (`availability`) rồi trả response tổng hợp. Gateway chỉ tổng hợp response, không quyết định giá/quota. Không cache tồn kho lâu; định nghĩa rõ fallback khi một upstream không khả dụng.

Khi thanh toán bật, Registration phát `ReservationCreated` sau khi giữ quota; Payment xử lý giao dịch idempotent rồi phát `PaymentSucceeded` hoặc `PaymentFailed`. Registration là nơi duy nhất xác nhận reservation hoặc giải phóng quota. Nếu thanh toán thành công đến muộn sau khi reservation hết hạn, áp dụng void/refund qua Payment. Đây là Saga bất đồng bộ, không có transaction phân tán. Xem [sơ đồ Payment Saga](diagrams/payment-saga-flow.md).

## 5. Docker Compose và vận hành local

Compose gốc cần có Gateway, năm service, năm PostgreSQL database/volume độc lập và RabbitMQ. Chỉ Gateway expose cổng public; service/database nằm trong network riêng. Mỗi service tự chạy migration của database mình. Dùng healthcheck, biến môi trường trong `.env` (không commit secret), và Docker named volume riêng.

Lệnh dự kiến: `docker compose up --build`, `docker compose down`.

## 6. Lộ trình thực hiện

1. Chốt use case, OpenAPI, message contracts, ADR database-per-service.
2. Dựng monorepo, Compose, năm PostgreSQL database riêng và broker.
3. Làm Identity/Auth/RBAC và authorization check.
4. Làm Event CRUD, publish/cancel, RBAC.
5. Làm ticket inventory, lock, idempotency, reservation expiry và phát vé.
6. Làm Payment mock + Saga/outbox/consumer/notification.
7. Làm Gateway routes, composition và frontend.
8. Hoàn thiện báo cáo, hướng dẫn chạy local, demo tải đồng thời và kiểm tra invariant quota.

## 7. Tiêu chí nghiệm thu

- Frontend chỉ gọi Gateway; Gateway có routing, JWT chung và API Composition.
- Có năm service độc lập và năm PostgreSQL database riêng.
- Không FK chéo database/service; không dùng schema persistence chung.
- RBAC kiểm tra action và resource scope.
- Concurrent reservation không làm `sold + reserved` vượt capacity; retry idempotent không nhân đôi.
- Notification bất đồng bộ và không nằm trong transaction đặt vé. Payment độc lập, sở hữu payment_db riêng và không ghi reservation/ticket.
- Hệ thống local được điều phối từ một `docker-compose.yml`; tài liệu chỉ rõ cách cấu hình/chạy.





