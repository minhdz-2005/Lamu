# Quy tắc nghiệp vụ

Mỗi luật trong file này có **một** chỗ chặn, **một** kết quả quan sát được và **một** phép thử. Code không tự thêm luật; tài liệu UI không tự đổi câu chữ. Khi file này và catalog/architecture nói khác nhau, chỗ đó là bug tài liệu — báo chủ service liên quan, đừng chọn bừa một bên.

Cột "Chỗ chặn" là nơi duy nhất được phép từ chối request. Cột "UI" trỏ tới màn hình hiển thị thông báo (không phải nơi quyết định).

## 1. Định dạng field và validate phía client

Validate ở UI chỉ để báo sớm; **service phải chặn lại y hệt** và trả `400 VALIDATION_FAILED`. Một mình UI pass không có nghĩa là hợp lệ.

| ID | Field | Luật | Chỗ chặn | Lỗi | UI |
|---|---|---|---|---|---|
| BR-FMT-01 | `email` | có `@`, có `.` sau `@`, lowercase trước khi gửi và trước khi lưu; ≤ 254 ký tự | Identity `POST /auth/register`, `/auth/login` | `VALIDATION_FAILED` | 01 §2 |
| BR-FMT-02 | `password` | ≥ 8 ký tự, không đòi độ phức tạp nào khác ở MUST | Identity register | `VALIDATION_FAILED` | 01 §2 |
| BR-FMT-03 | `display_name` | không rỗng, ≤ 80 ký tự | Identity register | `VALIDATION_FAILED` | 01 §2 |
| BR-FMT-04 | `slug` (org & event) | khớp `^[a-z0-9](?:-?[a-z0-9]){2,59}$`; org: unique toàn hệ thống, event: unique trong org | Identity `POST /organizations`, Event `POST /events` | `SLUG_TAKEN` 409 | 01 §2, 05 §3.2 |
| BR-FMT-05 | `title` event | không rỗng, ≤ 120 ký tự | Event `POST /events` | `VALIDATION_FAILED` | 05 §3.2 |
| BR-FMT-06 | `description` event | không rỗng, ≤ 2000 ký tự | Event `POST /events` | `VALIDATION_FAILED` | 05 §3.2 |
| BR-FMT-07 | `starts_at`, `ends_at` | `ends_at > starts_at`; không quá 2 năm sau; RFC3339 UTC khi ra, offset `+07:00` khi vào | Event `POST /events` | `VALIDATION_FAILED` | 05 §3.2, 00 §6 |
| BR-FMT-08 | `timezone` | hằng số `"Asia/Ho_Chi_Minh"` ở MUST, không có ô chọn | Event `POST /events` (bỏ mọi giá trị khác) | `VALIDATION_FAILED` | 05 §3.2 |
| BR-FMT-09 | `venue` | object key cố định `{name, address}`, chuỗi rỗng được phép, **không** thêm key; cả hai rỗng thì gửi `{}` | Event | `VALIDATION_FAILED` | 05 §3.2, 03 §8 |
| BR-FMT-10 | `name` loại vé | không rỗng, ≤ 60 ký tự | Registration `POST /events/{id}/ticket-types` | `VALIDATION_FAILED` | 05 §4.2 |
| BR-FMT-11 | `price` | string decimal 2 chữ số thập phân (`"150000.00"`), ≥ 0; `currency` luôn `"VND"` ở MUST | Registration | `VALIDATION_FAILED` | 00 §6, 05 §4.2 |
| BR-FMT-12 | `capacity` | integer 1..100000 | Registration ticket-types | `VALIDATION_FAILED` | 05 §4.2 |
| BR-FMT-13 | `sales_start`, `sales_end` | bắt buộc, `sales_end > sales_start` | Registration ticket-types | `VALIDATION_FAILED` | 05 §4.2 |
| BR-FMT-14 | `quantity` | integer 1..10 mỗi loại, tổng `Σ quantity ≥ 1`; clamp `0..min(10, available)` | Registration reservations | `VALIDATION_FAILED` | 03 §3, 00 §10 |
| BR-FMT-15 | `reason` khi hủy event | không rỗng, ≤ 300 ký tự | Event `POST /events/{id}/cancel` | `VALIDATION_FAILED` | 05 §3.4 |
| BR-FMT-16 | `code` vé khi check-in | trim hai đầu, không phân biệt hoa thường; chuỗi rỗng thì không gửi request | Registration `POST /tickets/check-in` | `NOT_FOUND` 404 | 05 §5.2 |
| BR-FMT-17 | `limit` / `offset` | `limit` mặc định 20, tối đa 100; `offset ≥ 0`; vượt biên thì trả `items: []` chứ không 400 | mọi endpoint phân trang | — | 02 §5 |
| BR-FMT-18 | Mọi ID | UUID string, không tự tăng dần, không suy ra từ ID khác | toàn hệ thống | — | 00 §1 |

## 2. Vòng đời trạng thái

Enum khóa. Không service, không seed, không UI nào được thêm giá trị mới. Giá trị lạ xuất hiện trong response là seed sai → UI hiển thị nguyên văn và report (04 §3).

### 2.1 `events.status`

| Từ | Sang | Ai trigger | Hệ quả dây chuyền |
|---|---|---|---|
| — | `DRAFT` | `POST /events` | chưa ai ngoài org thấy; **không** phát event |
| `DRAFT` | `PUBLISHED` | `POST /events/{id}/publish` (cần `event.publish`) | phát `EventPublished`; Registration ghi `event_snapshot`; trang 03 mở bán |
| `PUBLISHED` | `CANCELLED` | `POST /events/{id}/cancel` (cần `event.cancel`) | phát `EventCancelled` → Registration nhả `reserved`, đặt vé `VOIDED`, phát `BookingCancelled` cho từng registration; Payment refund 100% |
| `DRAFT` | `CANCELLED` | cũng qua `POST /events/{id}/cancel` (hủy bản nháp, chưa có khách nào) | phát `EventCancelled`; không có registration nào để nhả |
| `CANCELLED` | bất kỳ | **không có đường ra** | `publish`/`cancel` lần hai → `409 CONFLICT` |

| ID | Luật |
|---|---|
| BR-EVT-01 | `publish` chỉ hợp lệ từ `DRAFT`; `cancel` hợp lệ từ `DRAFT` hoặc `PUBLISHED`; mọi transition khác → `409 CONFLICT`, UI refetch để đồng bộ badge. |
| BR-EVT-02 | Publish **không** yêu cầu đã có loại vé. Event publish mà chưa có ticket type là hợp lệ, trang 03 hiện "Hết vé"; 05 §3.3 cảnh báo vàng nhưng không chặn. |
| BR-EVT-03 | `GET /public/events` chỉ trả `PUBLISHED`. `GET /public/events/{slug}` trả 200 cho `PUBLISHED` và `CANCELLED`, 404 cho `DRAFT` và slug sai. |
| BR-EVT-04 | Sau `PUBLISHED`, `PATCH /events/{id}` chỉ sửa `title`, `description`, `venue`. Đổi `starts_at`/`ends_at` khi `sold + reserved > 0` → `409 TIME_LOCKED` (quyết định 6). Ở MUST không màn hình nào gọi `PATCH /events`. |
| BR-EVT-05 | `PATCH` dùng `If-Match: <version>`; version lệch → `409 CONFLICT`. |
| BR-EVT-06 | Tạo `DRAFT` không phát message nào. |

### 2.2 `reservations.status`

| Từ | Sang | Ai trigger | Quota |
|---|---|---|---|
| — | `HELD` | `POST /events/{id}/reservations` (vé có phí) | `reserved += qty` |
| — | `CONFIRMED` | cùng request trên với vé miễn phí (`total_amount = 0`) | `sold += qty`, xuất vé ngay |
| `HELD` | `CONFIRMED` | consumer `PaymentSucceeded` gọi confirm nội bộ | `reserved -= qty`, `sold += qty`, tạo `registrations` + `tickets` |
| `HELD` | `RELEASED` | worker quá `expires_at` (`reason EXPIRED`), `DELETE /reservations/{id}` (`CANCELLED`), consumer `PaymentFailed` (`PAYMENT_FAILED`), `EventCancelled` (`EVENT_CANCELLED`) | `reserved -= qty` |
| `CONFIRMED` / `RELEASED` | bất kỳ | **không có** | repeat confirm/release → bỏ qua idempotent, không đổi số |

| ID | Luật |
|---|---|
| BR-RSV-01 | Với vé có phí, `PaymentSucceeded` là **đường xác nhận duy nhất** (quyết định 3). UI không có nút "xác nhận", không gọi `POST /reservations/{id}/confirm`, không gọi Payment. |
| BR-RSV-02 | Reservation không còn ở `HELD` mà nhận `PaymentSucceeded` → ack và bỏ qua, không xuất vé, không đổi quota, ghi log kèm `request_id` (messaging §9). |
| BR-RSV-03 | `expires_at = created_at + RESERVATION_HOLD_TTL_SECONDS` (mặc định 120). Bất biến cấu hình: `PAYMENT_MOCK_DELAY_SECONDS` < TTL. |
| BR-RSV-04 | Worker hết hạn nhả mỗi reservation **đúng một lần**, kể cả khi nhiều tiến trình cùng quét (`FOR UPDATE SKIP LOCKED`). |
| BR-RSV-05 | Rời trang 03 khi đang `HELD` không hủy hộ: UI dừng poll, chỗ tự nhả theo BR-RSV-03. |

### 2.3 `tickets.status` và `ticket_types.status`

| Hiện tại | Sang | Trigger |
|---|---|---|
| `ISSUED` | `USED` | `POST /tickets/check-in` thành công, ghi `checked_in_at` |
| `ISSUED` | `VOIDED` | `EventCancelled` (registration hàng loạt) |
| `USED` | bất kỳ | không có — check-in lại → `409 ALREADY_CHECKED_IN` |
| `VOIDED` | bất kỳ | không có — check-in → `409 TICKET_VOIDED` |
| `ticket_types.ACTIVE` | `CLOSED` | `PATCH /ticket-types/{id}` (chưa màn hình nào gọi ở MUST) |

| ID | Luật |
|---|---|
| BR-TCK-01 | Mỗi vé là một hàng `tickets` với một `code` duy nhất, không gộp "2 vé cùng event" thành một mã. `code` do Registration sinh: `LUMA-` + 4 hex hoa + `-` + 4 hex hoa (17 ký tự), va chạm `UNIQUE` thì sinh lại trong cùng transaction. |
| BR-TCK-02 | Check-in tra theo **mã in trên vé**, không theo `ticket_id`. Response 200 kèm `event_id` + `event_title` để UI cảnh báo "mã thuộc event khác" (05 §7). |
| BR-TCK-03 | `409 ALREADY_CHECKED_IN` phải nhét timestamp RFC3339 của lần vào trước vào `message`; UI in nguyên văn, không tự tra bảng vé. |
| BR-TCK-04 | Vé `VOIDED` vẫn hiển thị ở trang 04 với nhãn "Vé đã hủy", vẫn cho in, không còn nút "Xem sự kiện" nổi bật. |
| BR-TCK-05 | Ở MUST khách **không** tự hủy vé đã `CONFIRMED`; chỉ hủy được reservation đang `HELD` (BR-RSV-05, 03 §6). |

## 3. Quyền hạn (RBAC)

| ID | Luật | Chỗ chặn | Lỗi |
|---|---|---|---|
| BR-RBAC-01 | `POST /internal/authorization/check` là điểm chốt duy nhất. Không service nào tự đọc bảng role, tự suy quyền từ `display_name`, hay tin vào header do client gửi. | Identity | — |
| BR-RBAC-02 | Chỉ dùng 10 mã permission seed ở kiến trúc §3.1.1. Mã lạ gửi tới → `allowed: false` + `reason`, không 500. | Identity | — |
| BR-RBAC-03 | Permission cấp ORG kế thừa xuống mọi event thuộc org đó. Permission cấp EVENT không lan sang event khác. | Identity | `FORBIDDEN` 403 |
| BR-RBAC-04 | Thành viên org A không có quyền trên event của org B, kể cả khi email giống nhau. | Identity (resource scope) | 403 |
| BR-RBAC-05 | `SPEAKER` là chức danh cấp event: không có `event.read` cấp org nên không xem được `GET /organizations/{orgId}/events`. Mock frontend đang làm khác (frontend/README "Chỗ mock lệch hợp đồng"). | Identity | 403, 05 §7 |
| BR-RBAC-06 | `ATTENDEE` không có permission quản trị; check-in do `OWNER`/`ADMIN` của org sở hữu event thực hiện. | Identity | 403 |
| BR-RBAC-07 | `ADMIN` = `OWNER` trừ `org.member.manage`. `payment.refund` thì ADMIN vẫn có. | Identity seed | — |
| BR-RBAC-08 | Service **không** ẩn nút hộ UI. Service từ chối; UI ẩn/Disable theo `memberships[].roles[]` chỉ để đỡ bấm nhầm, và vẫn phải xử lý 403 như một nhánh bình thường. | mọi service | 403 |

## 4. Tiền, chỗ và chống bán vượt

| ID | Luật | Chỗ chặn | Quan sát được |
|---|---|---|---|
| BR-INV-01 | `sold + reserved ≤ capacity` luôn đúng. Chặn bằng `CHECK` trong DB **và** bằng `SELECT ... FOR UPDATE` trong transaction, không dựa vào một mình phép tính ở app. | Registration | 100 request đồng thời trên capacity 100 → không bao giờ có 101 vé |
| BR-INV-02 | `409 SOLD_OUT` khi không đủ chỗ cho request; toàn bộ request fail, không bán "một phần số loại đã chọn". | Registration | 03 §4 |
| BR-INV-03 | Không gọi mạng (REST, broker, SMTP) khi đang giữ lock inventory. | Registration | không có lock chờ IO |
| BR-INV-04 | `total_amount` do **server** tính lại từ `price × quantity` lúc giữ chỗ; số UI hiển thị chỉ là nháp. | Registration | response reservation |
| BR-INV-05 | Cửa bán theo `sales_start`/`sales_end` của **loại vé**, cộng thêm điều kiện event `PUBLISHED`. Ngoài cửa → `409 SALES_CLOSED`; UI hiện "Chưa mở/đã đóng bán" và đếm ngược tới `sales_start` (03 §3, §8). | Registration (`event_snapshot` + `ticket_types`) | 03 §3 |
| BR-INV-06 | `PATCH /ticket-types/{id}` chỉ được **tăng** `capacity`; giảm xuống dưới `sold + reserved` → 409. | Registration | — |
| BR-INV-07 | Vé miễn phí (`total_amount = 0`) confirm và xuất vé trong một transaction, Payment không xuất hiện ở đâu cả (quyết định 2). | Registration | 03 checklist: một request duy nhất tới `/me/tickets` có mã |
| BR-INV-08 | `available = capacity - sold - reserved`, tính từ `inventory`, không cache quá 5 giây, không làm tròn, không âm. | Registration `GET /availability` | 03 §3, 05 §4.1 |
| BR-INV-09 | Idempotency: `POST /events/{eventId}/reservations` **bắt buộc** header `Idempotency-Key`; cùng key + cùng body → trả đúng kết quả cũ, không trừ chỗ lần hai. Endpoint ghi khác không nhận key (chống trùng bằng ràng buộc tự nhiên). | Registration | 400 `IDEMPOTENCY_KEY_REQUIRED` khi thiếu |

## 5. Thanh toán và hoàn tiền

| ID | Luật | Chỗ chặn | Ghi chú |
|---|---|---|---|
| BR-PAY-01 | Một `reservation_id` tạo đúng một giao dịch, kể cả khi `ReservationCreated` tới hai lần (`idempotency_key = reservation_id`). | Payment | messaging §7 |
| BR-PAY-02 | Mock tự chốt SUCCESS sau `PAYMENT_MOCK_DELAY_SECONDS` (mặc định 5). Không có cổng thật ở MUST. | Payment | — |
| BR-PAY-03 | `payments.status` đã `SUCCEEDED`/`FAILED` thì không đổi được nữa; `simulate` lần hai → 409. | Payment | — |
| BR-PAY-04 | Chuẩn bị `SUCCEEDED` mà `now > expires_at` → **không** phát `PaymentSucceeded`; ghi `SUCCEEDED`, tạo `refunds` toàn phần, phát `RefundCompleted`. | Payment | kiến trúc §4.2 |
| BR-PAY-05 | Nhận `EventCancelled` mà giao dịch còn `PENDING` → chuyển `FAILED`, không phát `PaymentSucceeded`. | Payment | kiến trúc §4.2 |
| BR-PAY-06 | `EventCancelled` → refund 100% mọi giao dịch `SUCCEEDED` của cùng `event_id`, phát `RefundCompleted`, idempotent theo `message_id` (quyết định 7). Không màn hình nào bấm thay. | Payment | 04 §3 dòng phụ "hoàn tiền tự động" |
| BR-PAY-07 | Refund không vượt số tiền còn lại của giao dịch; `amount` bỏ trống = toàn phần. Hoàn một phần là khả năng API, MUST không có UI. | Payment | 409 |
| BR-PAY-08 | Frontend không bao giờ gọi Payment. Kết quả tiền chỉ tới UI qua `GET /reservations/{id}` (`payment_status`). | Gateway (không route `/internal`) | 00 §1, 03 §4 |

## 6. Bất đồng bộ và chống trùng

| ID | Luật | Áp cho |
|---|---|---|
| BR-ASY-01 | Ghi nghiệp vụ và row `outbox_events` trong **cùng một** transaction; publish sau commit, có publisher confirm. Không phát message mà không ghi outbox. | Identity, Event, Registration, Payment |
| BR-ASY-02 | Consumer kiểm `message_id` (= `event_id`) trong `processed_messages` **trước khi** xử lý; xử lý + ghi dấu trong một transaction; ack sau commit. | Registration, Payment, Notification |
| BR-ASY-03 | Handler lỗi: thử lại trong tiến trình 1s → 5s → 25s, rồi `basic.nack(requeue = false)` sang DLQ. Không bao giờ `requeue = true` để thử lại. | mọi consumer |
| BR-ASY-04 | Không tự bơm lại DLQ. Phát lại thủ công phải giữ **cùng** `message_id` để BR-ASY-02 còn chặn được phần ghi lặp. | vận hành |
| BR-ASY-05 | `EventUpdated`/`EventPublished`/`EventCancelled` cập nhật `event_snapshot` theo kiểu ghi đè toàn bộ field có trong payload; hai hàng đợi cùng tiêu `EventCancelled` (Registration và Payment) hoàn toàn độc lập, không bên nào chờ bên nào. | Registration, Payment |
| BR-ASY-06 | Đọc dữ liệu của service khác: **chỉ** từ payload message hoặc từ projection của mình. Không có REST gọi ngược từ consumer về producer. | mọi service |

## 7. Email

| ID | Luật |
|---|---|
| BR-NTF-01 | Địa chỉ người nhận nằm trong payload (`recipient_email`) — quyết định 1. Notification không gọi Identity. Thiếu field là bug của producer, Notification không được đoán. |
| BR-NTF-02 | Bốn template ở MUST, một tin = một thư: `registration_confirmed`, `ticket_issued`, `reservation_released` (nội dung theo `reason`), `booking_cancelled`. |
| BR-NTF-03 | `notification_jobs.status`: `PENDING` → `SENT` \| `FAILED`, kèm `attempts`. Gửi thất bại không làm hỏng nghiệp vụ đã thành. |
| BR-NTF-04 | Notification không nhận `EventUpdated`/`EventCancelled` (không chỉ định người nhận cụ thể). |
| BR-NTF-05 | Local: SMTP vào Mailpit (`SMTP_HOST=mailpit`, `SMTP_PORT=1025`, UI xem thư ở `8025`), hoặc log. Không có credential mail thật nào ở MUST. |

## 8. Danh tính và phiên

| ID | Luật |
|---|---|
| BR-AUTH-01 | JWT HS256, `JWT_SECRET` chung cho network local; Identity ký, Gateway verify, service nhận `X-User-Id` và **không** tự verify chữ ký (quyết định 8). |
| BR-AUTH-02 | Refresh token lưu hash (`refresh_sessions.token_hash`), logout là thu hồi thật (`revoked_at`), không phải xóa phía client. |
| BR-AUTH-03 | Sai credential trả **một** câu chung, không tiết lộ email nào có tài khoản (01 §3.1). |
| BR-AUTH-04 | MUST không có endpoint đặt lại mật khẩu. UI không được vẽ link "Quên mật khẩu?" (01 §1). |
| BR-AUTH-05 | `next` chỉ nhận đường dẫn bắt đầu bằng `/`; giá trị tuyệt đối hoặc theo protocol → bỏ qua, về `/events` (chống open redirect, 01 §5). |
| BR-AUTH-06 | Gateway không route `/internal/...` ra ngoài. `GET /healthz` của mỗi service cũng không đi qua Gateway. |

## 9. Bằng chứng nghiệm thu nối sang rule

| Phép thử | Luật được chứng minh | Nguồn chạy |
|---|---|---|
| 200 request đồng thời trên loại vé capacity 100 | BR-INV-01, BR-INV-02 | kiến trúc §6 tuần 3, §7 |
| Bấm "Giữ chỗ" hai lần liên tiếp cùng một giỏ vé | BR-INV-09: chỉ một reservation, `reserved` chỉ tăng một lần | 03 §8 |
| Đổi giờ event đã bán 1 vé | BR-EVT-04 | kiến trúc §7 |
| Admin org A sửa event org B | BR-RBAC-04 | kiến trúc §6 tuần 2 |
| Tắt Payment service, poll tới `expires_at + 10s` | BR-RSV-03, BR-RSV-05 | 03 checklist |
| Hủy event có khách đã mua | BR-PAY-06, BR-TCK-04, §2.1 | 04 checklist, 05 checklist |
| Dừng rồi khởi động lại RabbitMQ khi còn message chưa ack | BR-ASY-01, BR-ASY-02 | messaging §6 §7 |
| Phát lại một message đã tiêu từ DLQ | BR-ASY-03, BR-ASY-04 | messaging §8 |

## 10. Những gì cố tình không có trong file này

Công nghệ và thư viện từng service, cách tổ chức code trong `src/domain`, chiến lược migration, cấu hình CI/CD, cách dựng Docker image, kỹ thuật test (unit hay contract), áp lực hiệu năng: thuộc phần thiết kế của nhóm, nằm ở [docs/architecture.md](architecture.md) và do chủ service quyết. File này chỉ chốt **luật nghiệp vụ quan sát được từ ngoài**.
