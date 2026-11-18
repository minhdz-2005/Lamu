# Notification Service

Một câu: **liên lạc với người dùng** sau khi nghiệp vụ đã xong, và giữ phép lịch sự chung để sáu phần của hệ thống nói chuyện cùng một kiểu. Database: `notification_db`.

## Phần này lo gì

- Gửi email ở bốn thời điểm: vé đã xuất, lượt đăng ký hoàn tất, chỗ giữ bị nhả (hết hạn, người dùng hủy, hoặc trả tiền thất bại), sự kiện bị hủy.
- Mỗi lá thư có sẵn địa chỉ người nhận trong tin nó nhận, nên phần này không bao giờ hỏi lại service hồ sơ.
- Lưu tình trạng từng lá thư: chờ gửi, đã gửi, thất bại, đã thử mấy lần.
- Gửi thất bại thì thử lại có nghỉ dài dần; thử mãi không được thì chuyển vào một ngăn riêng để người vận hành xem lại.
- Môi trường local: thư gửi vào hộp giả lập để cả nhóm đọc bằng trình duyệt, hoặc chỉ ghi log.
- Việc ngang của cả nhóm do phần này giữ (không phải dữ liệu của service nào): khuôn dạng thông báo chung, cách chống xử lý trùng, cách thử lại, tên các luồng tin và danh sách hàng đợi. Phần này cũng giữ bộ kiểm tra công khai của cả nhóm: trăm người giành trăm chỗ, bấm hai lần không trừ tiền hai lần, hủy sự kiện tự hoàn tiền.

## Nguyên tắc cứng

- Chỉ nghe, không sai ai: không gọi HTTP ngược về service sở hữu dữ liệu, không chèn vào giao dịch đặt vé, không nằm trên đường người dùng chờ.
- Không tự quyết định nội dung nghiệp vụ: tên sự kiện, thời gian, lý do hủy đều lấy từ tin nhận được; thiếu field nào là bug của bên gửi, không phải việc của phần này đoán.
- Một tin chỉ tạo một lá thư, kể cả khi tin tới hai lần.
- Không nhận tin về sự kiện bị sửa hoặc bị hủy nói chung, vì hai tin đó không chỉ ra người nhận cụ thể.

## API phải cung cấp

Nguồn hợp đồng là [docs/api/catalog.md](../../docs/api/catalog.md). Bảng này không định nghĩa API mới.

| API | Dùng để làm gì | Ai gọi | Quyền |
|---|---|---|---|
| `GET /internal/notifications` | Bảng thư đã/đang gửi, kèm trạng thái và số lần thử; dùng để chứng minh luồng bất đồng bộ trong demo và báo cáo | Lời gọi trong network nội bộ | Nội bộ |
| `GET /healthz` | Cho Docker biết service đã sẵn sàng | Docker Compose | Không qua cổng vào |

Đây là service có ít cổng nhất trong hệ thống, và cố ý như vậy: toàn bộ đầu vào của nó là thông báo từ hàng đợi, không phải request từ frontend.

Chưa làm trong 4 tuần (STRETCH): hộp thông báo trong ứng dụng, bảng ghi từng lần thử, chọn mẫu thư động, tin nhắn qua SMS hoặc push.

## Nhận tin đến

| Thông báo | Từ ai | Phần này làm gì |
|---|---|---|
| `RegistrationConfirmed` | Vé & chỗ ngồi | Thư "đăng ký hoàn tất", lấy `recipient_email` từ tin |
| `TicketIssued` | Vé & chỗ ngồi | Thư "vé của bạn", kèm mã vé |
| `ReservationReleased` | Vé & chỗ ngồi | Thư báo chỗ đã nhả, nội dung theo lý do: hết hạn, bạn tự hủy, trả tiền thất bại, hoặc sự kiện bị hủy |
| `BookingCancelled` | Vé & chỗ ngồi | Thư báo sự kiện hủy cho từng người đã mua |

Phần này không phát thông báo nào.
