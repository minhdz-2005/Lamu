# Tài liệu giao diện

Bản mô tả để code ngay. Mỗi feature một file, đủ chi tiết về layout, trường, validate, API gọi, trạng thái lỗi và checklist nghiệm thu. Không quyết định framework: tên component là gợi ý cấu trúc, không bắt buộc.

Phạm vi lấy từ cột MUST §3.0 của [docs/architecture.md](../architecture.md). Đường dẫn API, payload và mã lỗi lấy từ [docs/api/catalog.md](../api/catalog.md); tài liệu UI không định nghĩa API mới.

| File | Feature | Route frontend | Cần đăng nhập |
|---|---|---|---|
| [00-conventions.md](00-conventions.md) | Quy ước dùng chung: token, error, loading, tiền, thời gian, idempotency | — | — |
| [01-auth.md](01-auth.md) | Đăng ký + đăng nhập + phiên hết hạn | `/auth` | Không |
| [02-event-discovery.md](02-event-discovery.md) | Danh sách event, tìm kiếm, phân trang | `/events` | Không |
| [03-event-detail-and-booking.md](03-event-detail-and-booking.md) | Chi tiết event + giữ chỗ + chờ kết quả thanh toán | `/events/[slug]` | Khi giữ chỗ |
| [04-my-tickets.md](04-my-tickets.md) | Vé của tôi, mã vé, trạng thái check-in, event bị hủy | `/me/tickets` | Có |
| [05-organizer.md](05-organizer.md) | Tạo/publish event, thêm loại vé, bảng vé, check-in theo mã | `/organizer` | Có |

## Cách dùng khi chia 5 người

Mỗi file tự chứa đủ thông tin để làm mà không phải đọc file khác, ngoại trừ 00-conventions.md (bắt buộc đọc trước). Làm theo thứ tự cột "Ưu tiên" trong từng file: 01 → 02 → 03 → 04 → 05. File 03 và 05 chạm saga và RBAC nên ghép sau khi backend tương ứng chạy được.

## Bản đồ route → API Gateway

| Route | API gọi ra (tất cả có tiền tố `/api`) |
|---|---|
| `/auth` | `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout` |
| `/events` | `GET /public/events` |
| `/events/[slug]` | `GET /public/events/{slug}/details` (composition), `POST /events/{eventId}/reservations`, `GET /reservations/{reservationId}`, `DELETE /reservations/{reservationId}` |
| `/me/tickets` | `GET /users/me`, `GET /users/me/tickets` |
| `/organizer` | `GET /users/me`, `POST /organizations`, `POST /events`, `GET /organizations/{orgId}/events`, `POST /events/{id}/publish`, `POST /events/{id}/cancel`, `POST /events/{id}/ticket-types`, `GET /events/{id}/availability`, `GET /events/{id}/tickets`, `POST /tickets/check-in` |

Không có màn hình nào gọi Payment: ở MUST, Payment chỉ tiêu `ReservationCreated` từ broker và frontend biết kết quả qua `GET /reservations/{id}`.
