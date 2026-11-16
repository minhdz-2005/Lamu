# Hợp đồng thông báo giữa các service

Trạng thái: **bản nháp chờ cả nhóm approve** — cùng cấp hợp đồng với [catalog.md](catalog.md). Viết từ cột "Event / bảng ghi" của catalog và 14 event trong [shared/contracts/events/README.md](../../shared/contracts/events/README.md).

Sau khi approve: **đổi tên exchange, routing key hoặc queue là PR phải có review của cả producer lẫn consumer**, vì đặt sai buộc sửa hai phía cùng lúc. Đây là một trong hai việc catalog §8 bắt buộc duyệt trước freeze.

Broker: RabbitMQ ở `docker-compose.yml` gốc, image `rabbitmq:3-management-alpine`, credential là key `RABBITMQ_USER`/`RABBITMQ_PASSWORD` trong `.env`. Không dùng plugin nào cả (không delayed-message, không shovel): mọi quy tắc dưới đây chạy được trên bản stock.

## 0. Ba cái tên, đừng nhầm

| Khái niệm | Ở đâu | Dạng | Ví dụ |
|---|---|---|---|
| `event_type` | envelope của schema | PascalCase | `PaymentSucceeded` |
| routing key | broker | `<aggregate>.<action>.v<major>` | `payment.succeeded.v1` |
| queue | broker | `<service tiêu>.<mục đích>` | `registration.saga` |

Routing key luôn dẫn ra từ `event_type`; hậu tố `v<major>` trong routing key và `version` trong envelope là **cùng một số** (mục 11). Không được tự đặt tên khác.

## 1. Exchange — một cái cho mỗi service phát

Topic exchange, `durable = true`, `auto_delete = false`.

| Exchange | Producer | Event phát qua nó |
|---|---|---|
| `luma.identity` | Identity & Organization | `UserRegistered`, `OrganizationCreated`, `MembershipChanged` |
| `luma.event` | Event | `EventPublished`, `EventUpdated`, `EventCancelled` |
| `luma.registration` | Registration & Ticketing | `ReservationCreated`, `ReservationReleased`, `RegistrationConfirmed`, `TicketIssued`, `BookingCancelled` |
| `luma.payment` | Payment | `PaymentSucceeded`, `PaymentFailed`, `RefundCompleted` |
| `luma.dead` (direct) | Broker tự phát | message đã thử lại hết mức, đổ vào DLQ |

Không dùng exchange chung cho mọi service: tên domain nằm ở exchange nên routing key ngắn và đọc được ngay (`event.published.v1`), và sau này tách broker theo domain không phải đổi routing key.

## 2. Bảng routing key đầy đủ

| `event_type` | Exchange | Routing key | `aggregate_type` | Consumer ở MUST |
|---|---|---|---|---|
| `UserRegistered` | `luma.identity` | `user.registered.v1` | `user` | chưa có |
| `OrganizationCreated` | `luma.identity` | `organization.created.v1` | `organization` | chưa có |
| `MembershipChanged` | `luma.identity` | `membership.changed.v1` | `membership` | chưa có |
| `EventPublished` | `luma.event` | `event.published.v1` | `event` | `registration.event-snapshot` |
| `EventUpdated` | `luma.event` | `event.updated.v1` | `event` | `registration.event-snapshot` |
| `EventCancelled` | `luma.event` | `event.cancelled.v1` | `event` | `registration.event-snapshot`, `payment.event-cancelled` |
| `ReservationCreated` | `luma.registration` | `reservation.created.v1` | `reservation` | `payment.checkout` |
| `ReservationReleased` | `luma.registration` | `reservation.released.v1` | `reservation` | `notification.email` |
| `RegistrationConfirmed` | `luma.registration` | `registration.confirmed.v1` | `registration` | `notification.email` |
| `TicketIssued` | `luma.registration` | `ticket.issued.v1` | `ticket` | `notification.email` |
| `BookingCancelled` | `luma.registration` | `booking.cancelled.v1` | `registration` | `notification.email` |
| `PaymentSucceeded` | `luma.payment` | `payment.succeeded.v1` | `payment` | `registration.saga` |
| `PaymentFailed` | `luma.payment` | `payment.failed.v1` | `payment` | `registration.saga` |
| `RefundCompleted` | `luma.payment` | `refund.completed.v1` | `refund` | chưa có |

## 3. Queue — một queue cho một nhóm xử lý, không bao giờ chia sẻ giữa hai service

Mỗi queue có **đúng một** service tiêu. Không có competing consumer giữa các service: thêm một service vào cùng queue là đổi hợp đồng.

| Queue | Service tiêu | Bind | `prefetch` | Hàng đợi chết |
|---|---|---|---|---|
| `registration.event-snapshot` | Registration | `luma.event` → `event.published.v1`, `event.updated.v1`, `event.cancelled.v1` | 1 | `registration.event-snapshot.dlq` |
| `registration.saga` | Registration | `luma.payment` → `payment.succeeded.v1`, `payment.failed.v1` | 1 | `registration.saga.dlq` |
| `payment.checkout` | Payment | `luma.registration` → `reservation.created.v1` | 1 | `payment.checkout.dlq` |
| `payment.event-cancelled` | Payment | `luma.event` → `event.cancelled.v1` | 1 | `payment.event-cancelled.dlq` |
| `notification.email` | Notification | `luma.registration` → `reservation.released.v1`, `registration.confirmed.v1`, `ticket.issued.v1`, `booking.cancelled.v1` | 10 | `notification.email.dlq` |

Khai báo mỗi queue: `durable = true`, `x-dead-letter-exchange = luma.dead`, `x-dead-letter-routing-key = <tên queue>`. DLQ tương ứng là queue bền, direct-bound vào `luma.dead` bằng đúng routing key đó.

`prefetch = 1` cho bốn queue nghiệp vụ: giữ đúng thứ tự từng bước của saga và làm cho chống trùng đơn giản. `prefetch = 10` cho email: gửi chậm không ảnh hưởng đúng sai.

Hai service cùng nghe một tin: `EventCancelled` tới cả `registration.event-snapshot` lẫn `payment.event-cancelled`. Hai queue hoàn toàn độc lập — không queue nào chờ queue nào, và mỗi bên tự chống trùng theo cách của mình.

## 4. Sơ đồ

```text
luma.identity   ──(3 event, chưa có queue ở MUST: broker bỏ qua)

luma.event ─┬─ event.published.v1 ─┐
            ├─ event.updated.v1  ─┴─> registration.event-snapshot ─> registration.event-snapshot.dlq
            └─ event.cancelled.v1 ─┬─> registration.event-snapshot
                                   └─> payment.event-cancelled   ─> payment.event-cancelled.dlq

luma.registration ─┬─ reservation.created.v1 ──> payment.checkout      ─> payment.checkout.dlq
                   └─ reservation.released.v1 / registration.confirmed.v1
                      ticket.issued.v1 / booking.cancelled.v1
                                                └──> notification.email ─> notification.email.dlq

luma.payment ─┬─ payment.succeeded.v1 ┐
              ├─ payment.failed.v1   ─┴─> registration.saga  ─> registration.saga.dlq
              └─ refund.completed.v1 ──(chưa có queue ở MUST)
```

## 5. Envelope và header bắt buộc

Envelope: 8 field đã chốt ở [shared/contracts/events/README.md](../../shared/contracts/events/README.md) (`event_id`, `event_type`, `version`, `occurred_at`, `aggregate_type`, `aggregate_id`, `producer`, `payload`).

| Header RabbitMQ | Lấy từ | Quy tắc |
|---|---|---|
| `message_id` | `event_id` | **Trùng khớp tuyệt đối.** Consumer chống trùng bằng cách ghi `message_id` vào bảng đã xử lý, không cần field riêng |
| `correlation_id` | `X-Request-Id` của request gốc | Một lượt đặt vé phải lần ra được ở mọi service nó đi qua |
| `causation_id` | `event_id` của message đã kích hoạt handler này | Dùng để đọc ngược đường saga khi demo hỏng; rỗng với message do người dùng tạo |
| `timestamp` | `occurred_at` | RFC3339 UTC |
| `type` | `event_type` | Để người xem UI broker không phải mở payload |
| `delivery_mode` | 2 (persistent) | Message nghiệp vụ không được mất khi broker khởi động lại |

`producer` chỉ nhận 5 giá trị: `identity`, `event`, `registration`, `payment`, `notification`. `aggregate_type` chỉ nhận 9 giá trị ở cột `aggregate_type` của mục 2.

## 6. Bên phát: chỉ phát sau khi ghi được dữ liệu

1. Handler nghiệp vụ ghi bảng của mình **và** một row outbox trong cùng một transaction. Chưa publish gì trong transaction.
2. Worker outbox đọc row chưa phát theo thứ tự `id`, publish với `confirm_select` bật, chỉ khi broker xác nhận mới đánh dấu đã phát.
3. Row chưa phát thì để nguyên; lần quét sau phát lại với **cùng** `event_id`. Vì vậy "phát hai lần" là bình thường, và đó chính xác là lý do mục 7 tồn tại.

Không service nào được nhân danh service khác để phát event, và không được phát event mà không ghi row outbox.

## 7. Bên tiêu: ít nhất một lần, tự chống trùng

1. Trước khi ack: kiểm `message_id` đã nằm trong bảng đã xử lý chưa. Rồi mới chạy handler.
2. Toàn bộ việc của handler — thay đổi dữ liệu của mình **và** ghi dấu đã xử lý — nằm trong một transaction. ack sau khi commit.
3. Handler thất bại: không ack, không tự đưa message về đầu hàng đợi. Làm theo mục 8 — thử lại trong tiến trình có nghỉ, hết ba lần thì nack sang DLQ.
4. Bảng chống trùng: `processed_messages(message_id UUID PK, processed_at)` đã có trong `payment_db` và `notification_db`. `registration_db` chưa có — xem mục 13.

**Không bao giờ** ack trước khi ghi, và **không bao giờ** giữ khóa database khi đang chờ broker.

## 8. Thử lại và ngăn dành cho message hỏng

- Thử lại trong tiến trình, ba lần, nghỉ 1s → 5s → 25s. Không dùng `requeue = true` để thử lại (rất dễ thành vòng lặp nóng), và không dùng plugin message chậm.
- Hết ba lần: `basic.nack(requeue = false)` → message sang `luma.dead`, đổ vào `<queue>.dlq`. Giữ nguyên header, thêm `x-death` do broker ghi.
- Đọc DLQ: `rabbitmqctl list_queues name messages` hoặc UI `15672`; một message trong DLQ là một bằng chứng cần giải thích, không phải lỗi được bỏ qua.
- Không tự động bơm lại DLQ. Muốn xử lý lại thì người vận hành chọn từng message và publish thủ công với **cùng** `message_id`, để chống trùng vẫn chặn được phần ghi lặp.

## 9. Hai cuộc đua đã biết, không phải bug

| Tình huống | Kết quả đúng |
|---|---|
| `reservation.released.v1` (hết hạn) tới Notification trước `payment.succeeded.v1` tới Registration | Email "hết hạn giữ chỗ" có thể tới trước. Registration gặp `payment.succeeded.v1` trên reservation đã nhả: **không xuất vé**, và Payment hoàn tiền cho giao dịch đã thành công. Đã chốt ở §4.3 kiến trúc |
| Hai message `payment.succeeded.v1` khác `event_id` cho cùng một `reservation_id` | Chống trùng theo `message_id` không chặn được. Registration phải chặn bằng trạng thái reservation: đã `CONFIRMED` thì trả 409 và bỏ qua message |

## 10. Bốn event chưa có queue trong bản MUST — vẫn phải phát

`UserRegistered`, `OrganizationCreated`, `MembershipChanged`, `RefundCompleted`. Chúng vẫn cần schema và vẫn được phát, nhưng topic exchange **không có queue nào bind** thì broker âm thầm bỏ message. Đó là hành vi được chấp nhận ở đây. **Không được** nhân danh "kẻo mất tin" mà thêm queue nhận hết (`#`), vì queue như vậy sẽ phình vô hạn và khiến một schema đổi shape trở thành lỗi dây chuyền.

## 11. Đổi version

| Thay đổi | Làm gì |
|---|---|
| Thêm field mới, bên nhận bỏ được | **Không tăng version.** Routing key vẫn `...v1`, `version` vẫn 1; ghi vào changelog của schema |
| Đổi tên field, đổi kiểu, bỏ field, đổi ngữ nghĩa | Routing key mới `...v2`, `version` = 2 |
| Lên `v2` | Producer phát cả `v1` và `v2` trong một khoảng; consumer bind cả hai; consumer cuối cùng bỏ `v1` rồi producer mới ngừng phát `v1`. Không cắt hai phía trong cùng một PR |

## 12. Kiểm tra topology

```bash
docker compose up -d rabbitmq
docker compose exec rabbitmq rabbitmqctl list_exchanges name type
docker compose exec rabbitmq rabbitmqctl list_queues name messages consumers
docker compose exec rabbitmq rabbitmqctl list_bindings
# UI: http://localhost:15672 (credential: key RABBITMQ_USER/RABBITMQ_PASSWORD trong .env)
```

Bằng chứng topology đã chạy đúng cho demo: mua vé có phí → `payment.checkout` có message rồi về 0 → `registration.saga` tiêu → `notification.email` tiêu → Mailpit `8025` có thư. Hủy sự kiện → `payment.event-cancelled` và `registration.event-snapshot` **cùng** nhận một `event_id`, và `notification.email` nhận `booking.cancelled.v1`.

## 13. Việc phải duyệt trước khi đóng băng

Ngoài hai việc catalog §8 đã nêu (danh sách 10 mã quyền, và tên/queue/routing key của tài liệu này), ba điểm sau phát hiện khi viết tài liệu:

1. **`registration_db` thiếu hai bảng mà các luồng đã ghi đều cần.** §3.3 kiến trúc liệt kê 7 bảng, không có `outbox_events` và `processed_messages`; nhưng §4.2 và catalog §3 đều yêu cầu "ghi outbox", và Registration là consumer của 5 event nên bắt buộc phải chống trùng. Cần approve thêm hai bảng này vào `registration_db`, nếu không mục 6 và 7 không thực hiện được.
2. **Cổng 5672 của RabbitMQ.** §5 kiến trúc ghi "RabbitMQ | 5672, 15672" ở cột cổng trên host, còn `docker-compose.yml` hiện chỉ publish 15672. Năm service nằm trong network `backend` nên không cần 5672 lộ ra host; cần chọn một: sửa §5 hoặc thêm publish vào compose.
3. **Đường dẫn message hỏng.** `luma.dead` là direct exchange, còn `x-dead-letter-routing-key` đặt bằng đúng tên queue — đây là cách làm chuẩn của RabbitMQ nhưng cần cả nhóm xác nhận, để không ai tự đổi sang `x-dead-letter-exchange` trỏ thẳng về topic exchange nghiệp vụ và làm message quay vòng lại handler vừa hỏng.

## 14. Chưa làm trong 4 tuần (STRETCH)

Phân tuyến theo tổ chức (`event.published.v1.<orgId>`), queue riêng cho từng user trong thông báo đẩy, exchange chậm có plugin để hoãn message thay vì nghỉ trong tiến trình, đối soát thứ tự phát giữa hai worker outbox chạy song song.
