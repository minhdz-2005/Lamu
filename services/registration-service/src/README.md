# Registration source

Code Java: `src/main/java/com/luma/registration/`, tổ chức **theo capability** (gom theo chức năng, không theo layer) — đã chốt ở bước 0.1 của [plan.md](../plan.md).

| Package | Lo gì | Phần plan |
|---|---|---|
| `common` | Việc dùng chung mọi capability: `RequestIdFilter` (`X-Request-Id` + MDC), error envelope, `GlobalExceptionHandler`, `/healthz` | 0 |
| `ticketing` | Loại vé, availability, check-in, vé của tôi | 1, 4 |
| `reservation` | Giữ chỗ, hủy giữ chỗ, idempotency, worker hết hạn | 2, 3.5 |
| `saga` | Consumer `PaymentSucceeded`/`PaymentFailed`, confirm nội bộ | 3.4 |
| `snapshot` | Consumer `EventPublished`/`EventUpdated`/`EventCancelled` | 3.2–3.3 |
| `outbox` | Outbox worker + publisher | 2.3 |

Nguyên tắc giữ nguyên từ scaffolding cũ: nhận request và validate đầu vào ở rìa HTTP; điều phối use-case và transaction của **chính service**, không mở transaction qua nhiều service; quy tắc nghiệp vụ cốt lõi không phụ thuộc framework; adapter database/broker/client chỉ kết nối đúng database service sở hữu.

- Migration: `src/main/resources/db/migration` (Flyway). Chỉ migration schema của `registration_db`; không tạo FK đến event hoặc identity database.
- Kiểm tra: `src/test/java` — kiểm tra use case, API và tích hợp database/broker của riêng service.
- Cấu hình: `src/main/resources/application.yml`; secret lấy từ biến môi trường (key trong `.env.example` gốc), không hardcode giá trị thật.

## Messaging

Phát `ReservationCreated` (chỉ khi `total_amount > 0`), `ReservationReleased`, `RegistrationConfirmed`, `TicketIssued`, `BookingCancelled`; tiêu `EventPublished`, `EventUpdated`, `EventCancelled`, `PaymentSucceeded`, `PaymentFailed`. Consumer idempotent theo `message_id` và ghi vào `processed_messages`. Registration không gọi REST sang Event hay Payment: trạng thái event đọc từ `event_snapshot`, email người nhận khi tiêu lấy từ payload; khi phát lấy từ `reservations.recipient_email` (ghi lúc giữ chỗ từ `X-User-Email` do Gateway chuyển tiếp), `organization_id` của `ReservationCreated` lấy từ `event_snapshot`.