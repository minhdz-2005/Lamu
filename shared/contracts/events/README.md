# Event schemas

Mười bốn event cần schema, mỗi schema có envelope `event_id`, `event_type`, `version`, `occurred_at`, `aggregate_type`, `aggregate_id`, `producer`, `payload`. Envelope giống nhau cho mọi event; bảng dưới đây chỉ liệt kê `payload`.

Quy tắc: `message_id` trên broker chính là `event_id` envelope, nên consumer dedupe bằng `processed_messages` mà không cần field riêng. Mọi ID là UUID string, thời gian RFC3339 UTC, field `snake_case` — đúng cùng quy ước với REST ở [danh mục API](../../../docs/api/catalog.md).

## Payload bắt buộc theo event

| Event | Producer | `payload` bắt buộc | Consumer ở MUST |
|---|---|---|---|
| `UserRegistered` | Identity | `user_id`, `email`, `display_name` | chưa có |
| `OrganizationCreated` | Identity | `organization_id`, `slug`, `created_by` | chưa có |
| `MembershipChanged` | Identity | `organization_id`, `user_id`, `roles[]` | chưa có |
| `EventPublished` | Event | `event_id`, `organization_id`, `slug`, `title`, `status`, `starts_at`, `ends_at` | Registration |
| `EventUpdated` | Event | `event_id`, `slug`, `title`, `status`, `starts_at`, `ends_at` | Registration |
| `EventCancelled` | Event | `event_id`, `organization_id`, `slug`, `title`, `status`, `starts_at`, `ends_at`, `cancelled_reason` | Registration, Payment |
| `ReservationCreated` | Registration | `reservation_id`, `event_id`, `organization_id`, `user_id`, `total_amount`, `currency`, `expires_at` | Payment |
| `ReservationReleased` | Registration | `reservation_id`, `event_id`, `recipient_email`, `event_title`, `event_starts_at`, `reason` (`EXPIRED`/`CANCELLED`/`PAYMENT_FAILED`/`EVENT_CANCELLED`) | Notification |
| `RegistrationConfirmed` | Registration | `registration_id`, `reservation_id`, `event_id`, `recipient_email`, `event_title`, `event_starts_at`, `total_amount` | Notification |
| `TicketIssued` | Registration | `ticket_id`, `code`, `registration_id`, `event_id`, `ticket_type_name`, `recipient_email`, `event_title`, `event_starts_at` | Notification |
| `BookingCancelled` | Registration | `registration_id`, `event_id`, `recipient_email`, `event_title`, `event_starts_at`, `cancelled_reason` | Notification |
| `PaymentSucceeded` | Payment | `payment_id`, `reservation_id`, `event_id`, `amount`, `currency` | Registration |
| `PaymentFailed` | Payment | `payment_id`, `reservation_id`, `event_id`, `failure_reason` | Registration |
| `RefundCompleted` | Payment | `refund_id`, `payment_id`, `reservation_id`, `event_id`, `organization_id`, `amount`, `currency` | chưa có |

## Vì sao payload phải đủ ngay từ đầu

- **Bốn** event của Notification (`ReservationReleased`, `RegistrationConfirmed`, `TicketIssued`, `BookingCancelled`) phải tự mang `recipient_email` + `event_title` + `event_starts_at`: email "vé của bạn" không thể gọi REST sang Registration hay Event để lấy tên sự kiện, và cũng không được gọi sang Identity để lấy email (quyết định 1, nguyên tắc service-autonomy §7 kiến trúc). Registration có email là nhờ `X-User-Email` do Gateway chuyển tiếp từ claim `email` trong access token của Identity, lưu vào `reservations.recipient_email` lúc giữ chỗ (BR-RSV-06) — worker và consumer không có request context đọc lại cột này.
- `ReservationCreated` phải mang `reservation_id` + `organization_id` + `total_amount` + `currency`: Payment tạo giao dịch chỉ từ message, không hỏi lại ai. Thiếu một trong bốn field là phải gọi REST ngược chiều — `organization_id` là để sau này kiểm quyền `payment.refund` mà không cần tra Event; Registration lấy giá trị này từ `event_snapshot.organization_id`.
- `PaymentSucceeded`/`PaymentFailed` phải mang `reservation_id`: đó là khóa duy nhất Registration dùng để confirm hoặc giải phóng quota.
- `EventPublished`/`EventUpdated`/`EventCancelled` phải mang `title` và `slug`: đó là nguồn duy nhất của `event_snapshot.title`/`slug`, thứ mà trang "Vé của tôi" hiển thị. `event_snapshot.organization_id` ghi từ `EventPublished`/`EventCancelled`; `EventUpdated` không mang lại field này vì org không bao giờ đổi, consumer giữ nguyên giá trị cũ.
- `RefundCompleted` và ba event Identity chưa có consumer ở MUST, vẫn cần schema để producer không đổi shape tùy tiện.

## Trạng thái tài liệu

Bảng trên **là** hợp đồng field, không phải bản nháp dẫn xuất: thêm/bỏ/đổi tên field trong `payload` là PR phải có review của cả producer lẫn consumer, y như đổi API. File JSON Schema (`draft 2020-12`) cho envelope và từng payload là việc tuần 1 trong §6 kiến trúc, đặt cùng thư mục này; khi chưa có file thì sinh code/kiểm thử theo bảng trên. Tên queue, routing key, exchange và quy tắc ack nằm ở [docs/api/messaging.md](../../../docs/api/messaging.md).
