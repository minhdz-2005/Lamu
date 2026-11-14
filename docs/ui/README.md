# Tài liệu giao diện

Bộ đặc tả giao diện: mỗi feature một file có layout, component, trường/validate, hành vi API, state, edge cases và checklist nghiệm thu. Tên component gợi ý cấu trúc, không là code đã triển khai. Các mục có dependency/decision còn mở cần chốt trước phần implementation phụ thuộc.

Phạm vi toàn hệ thống lấy từ MUST/STRETCH §3.0 của [kiến trúc](../architecture.md). Riêng yêu cầu chuẩn bị M4 **Gateway/Identity**, dùng01 và06–09; không tự nâng STRETCH toàn dự án thành MUST. Identity payload/status/error authority là [OpenAPI v1.2.0](../../shared/contracts/http/identity.openapi.json), [Gateway projection](../../shared/contracts/http/gateway.openapi.json) và types derive; [catalog](../api/catalog.md) là danh mục. UI docs không định nghĩa API mới.

**Trạng thái:**01 đã có frontend mock cần chuyển đổi;06–09 mới là thiết kế, chưa triển khai/chưa nghiệm thu browser thật.02–05 vẫn là thiết kế/implementation mock cho các service tương lai, không đưa vào gate tích hợp chỉ Gateway/Identity. [Reports](reports/README.md) giữ evidence theo lượt/provider; kết quả mock cũ không chứng minh API thật hoặc UI M4 PASS.

| File | Feature | Route frontend | Cần đăng nhập |
|---|---|---|---|
| [00-conventions.md](00-conventions.md) | Quy ước dùng chung: token, error, loading, tiền, thời gian, idempotency, design system (§13) | — | — |
| — (code trong `src/features/landing`) | Trang giới thiệu Lamu: hero, kiến trúc, hành trình, tài khoản demo. Không có wireframe riêng vì không gọi API | `/` | Không |
| [01-auth.md](01-auth.md) | Đăng ký + đăng nhập + phiên hết hạn | `/auth` | Không |
| [02-event-discovery.md](02-event-discovery.md) | Danh sách event, tìm kiếm, phân trang | `/events` | Không |
| [03-event-detail-and-booking.md](03-event-detail-and-booking.md) | Chi tiết event + giữ chỗ + chờ kết quả thanh toán | `/events/[slug]` | Khi giữ chỗ |
| [04-my-tickets.md](04-my-tickets.md) | Vé của tôi, mã vé, trạng thái check-in, event bị hủy | `/me/tickets` | Có |
| [05-organizer.md](05-organizer.md) | Tạo/publish event, thêm loại vé, bảng vé, check-in theo mã | `/organizer` | Có |
| [06-account.md](06-account.md) | Tài khoản chỉ đọc, membership và đăng xuất | `/me` | Có |
| [07-organizations.md](07-organizations.md) | Tổ chức của tôi và dialog tạo tổ chức | `/organizations` | Có |
| [08-organization-detail.md](08-organization-detail.md) | Tổng quan/members, đổi role ORG, mời user/receipt thu hồi | `/organizations/[orgId]` | Có; quyền theo backend |
| [09-my-invitations.md](09-my-invitations.md) | Inbox self, chấp nhận/từ chối, mọi trạng thái | `/me/invitations` | Có; không cần membership |

## Thứ tự chuẩn bị M4 chỉ Gateway/Identity

1. Chốt transport/proxy/CORS, storage/session và nhiều tab tại [00 §14](00-conventions.md); derive types, error handling, keys và coordinator logout trước các màn phụ thuộc.
2. [01 Auth](01-auth.md): login/register thật, redirect mặc định `/me`, refresh/logout đúng cùng phiên, không response cũ hồi sinh session.
3. [06 Tài khoản](06-account.md) → [07 Tổ chức](07-organizations.md) → [08 Chi tiết/thành viên](08-organization-detail.md) → [09 Lời mời](09-my-invitations.md).
4. Chạy checklist browser với Gateway/Identity/PostgreSQL thật, lưu kết quả mới theo provider trong reports. Chưa triển khai/test thì giữ NOT RUN; không dùng127 tests P8 backend làm PASS frontend.

Create organization là dialog của07; mời/đổi role/receipt thu hồi là dialog/panel của08; không cần route riêng cho từng thao tác. Header chung: Tài khoản/Tổ chức/Lời mời/Đăng xuất, đủ trạng thái pending/empty/error/forbidden; mobile/keyboard/theme theo00. Không cần màn dashboard Gateway, RabbitMQ hoặc outbox trong phạm vi người dùng này.

Hai giới hạn thiết kế: mutation **EVENT** chờ [D09](../integration/identity-handoff.md#d09-draft), đợt này chỉ ORG và hiển thị snapshot EVENT nếu có; **chưa có GET invitation theo org**, nên08 chỉ quản lý receipt vừa tạo, chưa hứa tab lịch sử lời mời đã gửi. Mở rộng các API này cần review riêng; không fallback mock hay gọi internal từ browser.

## Cách dùng khi chia 5 người

Lộ trình01 →02 →03 →04 →05 là kế hoạch UI toàn hệ thống trước đây. Chỉ thực hiện luồng business khi backend tương ứng đã sẵn sàng;03 và05 chạm saga/RBAC. Trong đợt chỉ Gateway/Identity, dùng thứ tự riêng phía trên và đọc00 trước. Không sửa hoặc xóa luồng business cũ để giả đã tích hợp.

## Bản đồ route → API Gateway

| Route | API gọi ra (tất cả có tiền tố `/api`) |
|---|---|
| `/` | Không call API nào — trang tĩnh, chỉ link tới các route bên dưới |
| `/auth` | `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /users/me` |
| `/me` | `GET /users/me`; refresh/logout qua coordinator chung |
| `/organizations` | `GET /users/me`, `POST /organizations` |
| `/organizations/[orgId]` | `GET /organizations/{orgId}`, `GET /organizations/{orgId}/members`, `PUT /organizations/{orgId}/members/{userId}/roles`, `POST /organizations/{orgId}/members/invitations`, `POST /organizations/{orgId}/members/invitations/{id}/revoke`; refetch `GET /users/me` khi cần |
| `/me/invitations` | `GET /users/me/invitations`, `POST /users/me/invitations/{id}/accept`, `POST /users/me/invitations/{id}/decline`; refetch `GET /users/me` sau accept |
| `/events` | `GET /public/events` |
| `/events/[slug]` | `GET /public/events/{slug}/details` (composition), `POST /events/{eventId}/reservations`, `GET /reservations/{reservationId}`, `DELETE /reservations/{reservationId}` |
| `/me/tickets` | `GET /users/me`, `GET /users/me/tickets` |
| `/organizer` | `GET /users/me`, `POST /organizations`, `POST /events`, `GET /organizations/{orgId}/events`, `POST /events/{id}/publish`, `POST /events/{id}/cancel`, `POST /events/{id}/ticket-types`, `GET /events/{id}/availability`, `GET /events/{id}/tickets`, `POST /tickets/check-in` |

Không có màn hình nào gọi Payment: ở MUST, Payment chỉ tiêu `ReservationCreated` từ broker và frontend biết kết quả qua `GET /reservations/{id}`.

Các dòng `/events`, `/events/[slug]`, `/me/tickets`, `/organizer` trong bản đồ trên là luồng business tương lai/mock, chưa được Gateway thật route trong rollout Identity. Public organization endpoint đã có nhưng chưa cần màn public riêng. Runtime/commands xem [Identity README](../../services/identity-service/README.md); trạng thái bàn giao/owner/dependency xem [handoff](../integration/identity-handoff.md), không duy trì bảng acceptance thứ hai ở UI docs.
