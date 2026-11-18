# Event Service

Một câu: quản lý **một chương trình** từ lúc còn nháp tới lúc mở bán hoặc bị hủy. Database: `event_db`.

`organization_id` và `user_id` ở đây là ID tham chiếu, không có FK sang database của service khác.

## Phần này lo gì

- Hồ sơ sự kiện: tên, mô tả, thời gian bắt đầu/kết thúc, múi giờ, địa điểm, hình ảnh.
- Vòng đời ba trạng thái: nháp (chỉ nội bộ thấy) → đã công bố (mọi người thấy, bán được) → đã hủy.
- Trang chương trình công khai: danh sách sự kiện, tìm theo từ khóa, lọc theo ngày, phân trang — người chưa đăng nhập vẫn xem được.
- Báo cho toàn hệ thống biết một sự kiện vừa mở bán, vừa bị sửa, hoặc vừa bị hủy.

## Nguyên tắc cứng

- Trước **mọi** thay đổi, phần này hỏi điểm chốt quyền của service hồ sơ & quyền hạn; không tự suy ra quyền.
- Sau khi công bố và đã có chỗ bán hoặc chỗ đang giữ: được sửa tên, mô tả, địa điểm; **không được dời giờ** — vé đã in giờ cũ. Trường hợp này trả về mã lỗi `TIME_LOCKED`.
- Bản nháp không phát tin nào cả, vì chưa có ai cần biết.
- Thông báo phát đi phải tự chứa đủ tên và thời gian sự kiện, để bên nhận không phải gọi ngược lại phần này.
- Không có dữ liệu dùng chung. `events` chỉ phần này ghi.

## API phải cung cấp

Nguồn hợp đồng là [docs/api/catalog.md](../../docs/api/catalog.md). Bảng này không định nghĩa API mới.

| API | Dùng để làm gì | Ai gọi | Quyền |
|---|---|---|---|
| `POST /events` | Tạo sự kiện ở dạng nháp | Frontend (bàn quản trị), qua cổng vào | `event.create` trên tổ chức |
| `GET /events/{eventId}` | Xem chi tiết một sự kiện để quản trị | Frontend, qua cổng vào | `event.read` trên event |
| `GET /organizations/{orgId}/events` | Lịch sự kiện của một tổ chức, lọc theo trạng thái và ngày | Frontend (bàn quản trị), qua cổng vào | `event.read` trên tổ chức |
| `PATCH /events/{eventId}` | Sửa thông tin, có chặn ghi đè; sau công bố chỉ sửa tên/mô tả/địa điểm | Frontend, qua cổng vào | `event.update` |
| `POST /events/{eventId}/publish` | Chuyển nháp → đã công bố, mở cửa bán | Frontend, qua cổng vào | `event.publish` |
| `POST /events/{eventId}/cancel` | Hủy sự kiện kèm lý do | Frontend, qua cổng vào | `event.cancel` |
| `GET /public/events` | Trang chủ danh sách sự kiện đã công bố | Frontend (trang khám phá), qua cổng vào | Công khai |
| `GET /public/events/{slug}` | Thông tin một sự kiện cho trang chi tiết | Cổng vào (ghép trang chi tiết) | Công khai |
| `GET /healthz` | Cho Docker biết service đã sẵn sàng | Docker Compose | Không qua cổng vào |

Chưa làm trong 4 tuần (STRETCH): diễn giả, lịch nhiều phiên, thư viện ảnh của sự kiện.

## Báo tin đi

| Thông báo | Khi nào | Nội dung bắt buộc | Ai nghe trong bản MUST |
|---|---|---|---|
| `EventPublished` | Vừa công bố | `event_id`, `organization_id`, `slug`, `title`, `status`, `starts_at`, `ends_at` | Vé & chỗ ngồi |
| `EventUpdated` | Vừa sửa sau công bố | `event_id`, `slug`, `title`, `status`, `starts_at`, `ends_at` | Vé & chỗ ngồi |
| `EventCancelled` | Vừa hủy | như trên + `cancelled_reason` | Vé & chỗ ngồi, Tiền |

Phần này không nhận thông báo từ service nào; nó là nguồn của sự thật về chương trình.
