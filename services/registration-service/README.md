# Registration & Ticketing Service

Một câu: quản lý **chỗ ngồi và vé** — bán gì còn bao nhiêu, ai đang giữ chỗ, vé nào đã xuất, ai đã vào cửa. Database: `registration_db`.

`event_id` và `user_id` ở đây là ID tham chiếu, không có FK chéo. Phần này không gọi HTTP sang Event Service để kiểm tra trạng thái sự kiện.

## Phần này lo gì

- Danh mục bán: mỗi sự kiện có những loại vé nào, giá bao nhiêu, bao nhiêu chỗ, mở bán từ khi nào tới khi nào, loại nào đang đóng.
- Chỗ còn lại: biết rõ hai con số — chỗ đã bán hẳn và chỗ đang giữ hộ — và đảm bảo tổng hai con số không bao giờ vượt sức chứa.
- Giữ chỗ: một người bấm đăng ký thì chỗ khả dụng tụt xuống ngay; hai người không bao giờ cùng lấy một chỗ, kể cả khi hàng trăm yêu cầu tới cùng lúc.
- Nhả chỗ: chỗ giữ quá thời hạn, người dùng chủ động hủy, hoặc thanh toán thất bại — chỗ quay về danh sách còn trống và lý do được ghi rõ.
- Xuất vé: khi lượt đăng ký hoàn tất, tạo đúng số vé đã mua, mỗi vé có mã in ra được.
- Trạng thái vé: còn hiệu lực, đã vào cổng kèm thời điểm, hoặc vô hiệu vì sự kiện bị hủy.
- Bàn check-in tại cửa: quản trị viên nhập mã vé in trên ticket, hệ thống báo vào được hay đã vào rồi.
- Trang "vé của tôi": tên sự kiện, ngày diễn ra, trạng thái — lấy từ bản tóm tắt sự kiện mà phần này tự giữ, không hỏi ai.

## Nguyên tắc cứng

- Hai điều không được phép cắt trong bốn tuần: **sức chứa không bao giờ bị vượt** và **bấm lại hai lần không bị trừ chỗ hai lần**.
- Việc trừ chỗ, giữ chỗ, xác nhận và xuất vé diễn ra trong một giao dịch nội bộ của phần này; không gọi mạng khi đang giữ khóa.
- Với vé miễn phí: giữ chỗ, xác nhận và xuất vé trong một bước.
- Với vé có phí: phần này **không tự xác nhận**. Chỗ ở trạng thái đang giữ cho tới khi nhận tin "đã trả tiền xong". Đây là đường xác nhận duy nhất.
- Chỉ phần này được xác nhận một lượt giữ chỗ hoặc nhả chỗ đã giữ. Tiền và Thông báo không được động vào.
- Bản tóm tắt sự kiện cập nhật chậm vài giây là chấp nhận được; giá và chỗ thì không được chậm.

## API phải cung cấp

Nguồn hợp đồng là [docs/api/catalog.md](../../docs/api/catalog.md). Bảng này không định nghĩa API mới.

| API | Dùng để làm gì | Ai gọi | Quyền |
|---|---|---|---|
| `POST /events/{eventId}/ticket-types` | Thêm loại vé và cấp chỗ ban đầu | Frontend (bàn quản trị), qua cổng vào | `event.update` trên event |
| `GET /events/{eventId}/ticket-types` | Danh sách loại vé cho trang bán | Frontend, qua cổng vào | Công khai khi sự kiện đã công bố |
| `GET /events/{eventId}/availability` | Chỗ còn từng loại, kèm cửa bán đang mở hay đóng | Cổng vào (ghép trang chi tiết) | Công khai |
| `PATCH /ticket-types/{ticketTypeId}` | Đổi giá, đóng/mở loại vé, hạn bán; chỗ chỉ được tăng | Frontend, qua cổng vào | `event.update` |
| `POST /events/{eventId}/reservations` | **Giữ chỗ**, và với vé miễn phí thì xuất vé ngay; bắt buộc kèm header `Idempotency-Key` để bấm lại không tạo lần hai | Frontend (trang chi tiết), qua cổng vào | Đã đăng nhập |
| `GET /reservations/{reservationId}` | Trạng thái lượt giữ chỗ; frontend theo dõi kết quả thanh toán ở đây | Frontend, qua cổng vào | Self |
| `POST /reservations/{reservationId}/confirm` | Chuyển chỗ đang giữ sang đã bán và xuất vé | **Chỉ nội bộ**, do luồng tin "đã trả tiền xong" gọi; không mở ra frontend | Nội bộ |
| `DELETE /reservations/{reservationId}` | Người dùng chủ động hủy lượt giữ chỗ | Frontend, qua cổng vào | Self |
| `GET /users/me/tickets` | Trang "vé của tôi" | Frontend, qua cổng vào | Self |
| `GET /events/{eventId}/tickets` | Bảng vé của một sự kiện cho bàn check-in; không kèm tên người mua | Frontend (bàn quản trị), qua cổng vào | `event.read` trên event |
| `POST /tickets/check-in` | Đóng dấu đã vào cổng theo mã vé | Frontend (bàn quản trị), qua cổng vào | `ticket.checkin` |
| `GET /healthz` | Cho Docker biết service đã sẵn sàng | Docker Compose | Không qua cổng vào |

Chưa làm trong 4 tuần (STRETCH): check-in bằng mã QR, hàng đợi chờ khi hết chỗ, giỏ vé nhiều loại kèm ưu đãi.

## Nhận tin đến

| Thông báo | Từ ai | Phần này làm gì |
|---|---|---|
| `EventPublished` / `EventUpdated` | Sự kiện | Ghi đè bản tóm tắt sự kiện |
| `EventCancelled` | Sự kiện | Nhả toàn bộ chỗ đang giữ, vô hiệu vé đã xuất, báo từng người đã mua |
| `PaymentSucceeded` | Tiền | Xác nhận lượt giữ chỗ và xuất vé |
| `PaymentFailed` | Tiền | Nhả chỗ đã giữ, lý do `PAYMENT_FAILED` |

## Báo tin đi

| Thông báo | Khi nào | Ai nghe trong bản MUST |
|---|---|---|
| `ReservationCreated` | Vừa giữ chỗ **và** có tiền cần thu | Tiền |
| `RegistrationConfirmed` | Một lượt đăng ký hoàn tất | Thông báo |
| `TicketIssued` | Vé đã xuất | Thông báo |
| `ReservationReleased` | Hết hạn / bị hủy / trả tiền thất bại / sự kiện bị hủy | Thông báo |
| `BookingCancelled` | Sự kiện bị hủy, cho từng người đã mua | Thông báo |

Ngoài các API trên, phần này chạy một công việc nền không có cổng: định kỳ quét các lượt giữ chỗ quá hạn và nhả chỗ, mỗi lượt chỉ nhả đúng một lần kể cả khi nhiều tiến trình cùng quét.
