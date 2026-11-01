# Event schemas

Mười bốn event cần schema, mỗi schema có envelope `event_id`, `event_type`, `version`, `occurred_at`, `aggregate_type`, `aggregate_id`, `producer`, `payload`. Envelope giống nhau cho mọi event; bảng dưới đây chỉ liệt kê `payload`.

Quy tắc: `message_id` trên broker chính là `event_id` envelope, nên consumer dedupe bằng `processed_messages` mà không cần field riêng. Mọi ID là UUID string, thời gian RFC3339 UTC, field `snake_case` — Same rule với REST ở [danh mục API](../../../docs/api/catalog.md).

## Payload bắt buộc theo event

| Event | Producer | `payload` bắt buộc | Consumer ở MUST |
|---|---|---|---|
| `UserRegistered` | Identity | `user_id`, `email`, `display_name` | chưa có |
| `OrganizationCreated` | Identity | `organization_id`, `slug`, `created_by` | chưa có |
| `MembershipChanged` | Identity | `organization_id`, `user_id`, `roles[]` | chưa có |
| `EventPublished` | Event | `event_id`, `organization_id`, `slug`, `title`, `status`, `starts_at`, `ends_at` | Registration |
| `EventUpdated` | Event | `event_id`, `slug`, `title`, `status`, `starts_at`, `ends_at` | Registration |
| `EventCancelled` | Event | `event_id`, `organization_id`, `slug`, `title`, `status`, `starts_at`, `ends_at`, `cancelled_reason` | Registration, Payment |
| `ReservationCreated` | Registration | `reservation_id`, `event_id`, `user_id`, `total_amount`, `currency`, `expires_at` | Payment |
| `ReservationReleased` | Registration | `reservation_id`, `event_id`, `recipient_email`, `event_title`, `event_starts_at`, `reason` (`EXPIRED`/`CANCELLED`/`PAYMENT_FAILED`/`EVENT_CANCELLED`) | Notification |
| `RegistrationConfirmed` | Registration | `registration_id`, `reservation_id`, `event_id`, `recipient_email`, `event_title`, `event_starts_at`, `total_amount` | Notification |
| `TicketIssued` | Registration | `ticket_id`, `code`, `registration_id`, `event_id`, `ticket_type_name`, `recipient_email`, `event_title`, `event_starts_at` | Notification |
| `BookingCancelled` | Registration | `registration_id`, `event_id`, `recipient_email`, `event_title`, `cancelled_reason` | Notification |
| `PaymentSucceeded` | Payment | `payment_id`, `reservation_id`, `event_id`, `amount`, `currency` | Registration |
| `PaymentFailed` | Payment | `payment_id`, `reservation_id`, `event_id`, `failure_reason` | Registration |
| `RefundCompleted` | Payment | `refund_id`, `payment_id`, `reservation_id`, `event_id`, `amount` | chưa có |

## Vì sao payload phải đủ ngay từ đầu

- Ba event của Notification phải tự mang `event_title` và `event_starts_at`: email "vé của bạn" không thể gọi REST sang Registration hay Event để lấy tên sự kiện (nguyên tắc service-autonomy, §7 kiến trúc).
- `ReservationCreated` phải mang `reservation_id` + `total_amount` + `currency`: Payment tạo giao dịch chỉ từ message, không hỏi lại ai. Thiếu một trong ba field là phải gọi REST ngược chiều.
- `PaymentSucceeded`/`PaymentFailed` phải mang `reservation_id`: đó là khóa duy nhất Registration dùng để confirm hoặc giải phóng quota.
- `EventPublished`/`EventUpdated`/`EventCancelled` phải mang `title` và `slug`: đó là nguồn duy nhất của `event_snapshot.title`/`slug`, thứ mà trang "Vé của tôi" hiển thị.
- `RefundCompleted` và ba event Identity chưa có consumer ở MUST, vẫn cần schema để producer không đổi shape tùy tiện.

Nguồn schema JSON là thư mục này; tên queue và routing key ghi trong `docs/api/messaging.md` khi freeze hợp đồng.
