# Payment Service

Một câu: ghi nhận **một lượt giữ chỗ có phí đã trả hay chưa**, và hoàn tiền khi sự kiện bị hủy. Database: `payment_db`.

`reservation_id`, `user_id`, `event_id`, `organization_id` ở đây là ID tham chiếu, không có FK chéo.

## Phần này lo gì

- Giao dịch: mỗi lượt giữ chỗ có phí tạo đúng một giao dịch, kèm số tiền, loại tiền, trạng thái chờ/thành công/thất bại.
- Cổng thanh toán: ở bản này là đồ giả lập cho demo. Sau một khoảng thời gian cấu hình được, giao dịch tự chốt thành công; cũng có một endpoint nội bộ cho phép bấm ra kết quả thành công hoặc thất bại khi trình bày.
- Hoàn tiền: hoàn toàn phần hoặc một phần theo yêu cầu, và **tự động hoàn 100%** cho mọi giao dịch thành công của một sự kiện vừa bị hủy — không có màn hình hoàn tiền thủ công.
- Tra cứu: cho phép hỏi trạng thái tiền của một lượt giữ chỗ, phục vụ demo và báo cáo.

## Nguyên tắc cứng

- Phần này **không** sửa chỗ ngồi và **không** xuất vé. Nó chỉ nói kết quả trả tiền; vé là việc của service vé.
- Phần này khởi động bằng tin "có người vừa giữ chỗ" từ hàng đợi, **không** bằng lệnh gọi từ frontend. Frontend không có màn hình nào chạm tới tiền.
- Một lượt giữ chỗ chỉ tạo đúng một giao dịch, kể cả khi tin tới hai lần.
- Tin tới không được xử lý hai lần; mỗi tin đã xử lý được ghi lại để lần sau bỏ qua.
- Kết quả trả tiền chỉ đi tới service vé qua thông báo, không qua gọi ngược.

## API phải cung cấp

Nguồn hợp đồng là [docs/api/catalog.md](../../docs/api/catalog.md). Bảng này không định nghĩa API mới.

| API | Dùng để làm gì | Ai gọi | Quyền |
|---|---|---|---|
| `GET /internal/payments/{paymentId}` | Trạng thái một giao dịch | Service khác trong network nội bộ, hoặc cổng vào khi cần | Nội bộ |
| `GET /internal/payments/by-reservation/{reservationId}` | Giao dịch của một lượt giữ chỗ, dùng cho demo và đối soát | Lời gọi trong network nội bộ | Nội bộ |
| `POST /internal/payments/{paymentId}/simulate` | Bấm kết quả thành công/thất bại khi trình diễn; có chữ ký chặn bên ngoài bấm | Người vận hành demo | Nội bộ |
| `POST /internal/payments/{paymentId}/refund` | Hoàn tiền toàn phần hoặc một phần; bản MUST chỉ dùng cho luồng tự động khi sự kiện bị hủy | Lời gọi trong network nội bộ | `payment.refund` |
| `GET /healthz` | Cho Docker biết service đã sẵn sàng | Docker Compose | Không qua cổng vào |

Bốn API trên là toàn bộ phần cổng của service này; frontend không gọi bất kỳ API nào trong số đó trực tiếp.

Chưa làm trong 4 tuần (STRETCH): tạo giao dịch bằng lệnh gọi trực tiếp, cổng thanh toán thật, báo cáo đối soát.

## Nhận tin đến

| Thông báo | Từ ai | Phần này làm gì |
|---|---|---|
| `ReservationCreated` | Vé & chỗ ngồi | Tạo giao dịch ở trạng thái chờ, nhớ cả `event_id` và `organization_id` từ tin, rồi cho cổng giả lập trả kết quả |
| `EventCancelled` | Sự kiện | Hoàn 100% mọi giao dịch thành công của sự kiện đó; giao dịch còn chờ thì chuyển sang thất bại và không thu tiền nữa |

## Báo tin đi

| Thông báo | Khi nào | Ai nghe trong bản MUST |
|---|---|---|
| `PaymentSucceeded` | Giao dịch thành công **và lượt giữ chỗ còn hạn**. Hết hạn thì không phát tin này, mà phát `RefundCompleted` | Vé & chỗ ngồi |
| `PaymentFailed` | Giao dịch thất bại | Vé & chỗ ngồi |
| `RefundCompleted` | Đã hoàn tiền: tự hoàn khi sự kiện bị hủy, hoặc hoàn theo lệnh ops ở endpoint nội bộ | chưa có |

`ReservationCreated` mang `expires_at`, nên phần này biết hạn giữ chỗ mà không phải hỏi lại. Hai quy tắc chốt ở [docs/architecture.md §4.2](../../docs/architecture.md):

- Chuẩn bị chốt thành công mà `now > expires_at` → ghi `SUCCEEDED`, tự tạo một `refunds` toàn phần, phát `RefundCompleted`, **không** phát `PaymentSucceeded`.
- Nhận `EventCancelled` mà giao dịch còn `PENDING` → chuyển thẳng `FAILED`, **không** phát `PaymentSucceeded`. Đang hủy thì đừng thu tiền nữa.
