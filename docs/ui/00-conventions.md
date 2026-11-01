# 00. Quy ước giao diện dùng chung

Áp dụng cho cả năm feature. File này là hợp đồng giữa các người làm frontend: làm khác đây thì ghép màn hình sẽ lệch.

## 1. Nguồn dữ liệu và prefix

| Quy ước | Chốt |
|---|---|
| Base URL | `VITE_API_BASE_URL` / tương đương, mặc định `http://localhost:8080/api`. Frontend chỉ biết đúng một origin đó. |
| Đường dẫn | Bằng đường dẫn trong catalog, nối sau `/api`. Ví dụ catalog `POST /events/{id}/reservations` → gọi `POST /api/events/{id}/reservations`. |
| Cấm | Không gọi thẳng cổng service (8081…8085), không gọi endpoint `/internal/...`, không tự suy đoán field chưa có trong catalog. |
| Response envelope | Success: JSON thô như catalog. Error: `{"error": {"code", "message", "request_id"}}`. |
| Field | `snake_case` như API, không đổi tên khi đưa vào UI. |

## 2. Phiên đăng nhập (token)

| Mục | Chốt |
|---|---|
| Lưu | `access_token` và `refresh_token` trong `localStorage` dưới key `luma.access`, `luma.refresh`. Demo local, chấp nhận rủi ro XSS để khỏi cần backend cookie; không dùng môi trường thật. |
| Gửi | Mọi request có token kèm `Authorization: Bearer <access_token>`. |
| Hết hạn | Interceptor bắt `401 UNAUTHENTICATED` → gọi `POST /api/auth/refresh` với `refresh_token` **một lần**, lưu token mới, retry request cũ. Refresh cũng 401 → xóa token, redirect `/auth?next=<route hiện tại>`, toast "Phiên hết hạn, đăng nhập lại". |
| Chồng request | Nếu 3 request cùng 401, chỉ một lần refresh; các request còn lại chờ cùng promise đó. |
| Trạng thái app | `authState ∈ {ANONYMOUS, AUTHENTICATED}` suy từ sự tồn tại của `access_token`. Không có "đang load session" vô hạn: timeout 3 giây coi như ANONYMOUS. |
| Logout | `POST /api/auth/logout` với `refresh_token`; dù API trả lỗi vẫn xóa token local rồi redirect `/auth`. |

## 3. Map mã lỗi → thông báo tiếng Việt

Hiện `message` từ API nếu nó là câu tiếng Việt; nếu API chỉ trả code, dùng bảng cố định sau. Luôn kèm `request_id` trong toast (chữ nhỏ, để demo khi lỗi báo cáo lại được).

| `error.code` | Status | Câu hiển thị | Hành động UI |
|---|---|---|---|
| `VALIDATION_FAILED` | 400 | "Thông tin nhập chưa hợp lệ, kiểm tra lại các trường được đánh dấu." | Bật lỗi dưới field |
| `UNAUTHENTICATED` | 401 | "Phiên hết hạn, đăng nhập lại." | Redirect `/auth?next=` |
| `FORBIDDEN` | 403 | "Bạn không có quyền làm việc này trên sự kiện/tổ chức đó." | Ẩn nút, hiện banner |
| `NOT_FOUND` | 404 | "Không tìm thấy dữ liệu." | Hiện trang empty, có nút quay lại |
| `IDEMPOTENCY_KEY_REQUIRED` | 400 | Lỗi dev: UI thiếu key | Không xảy ra nếu làm đúng §5 |
| `CONFLICT` | 409 | "Trạng thái đã thay đổi, tải lại dữ liệu." | Refetch |
| `SOLD_OUT` | 409 | "Vé này đã hết. Chọn loại vé khác hoặc số lượng ít hơn." | Disable nút, hiện số còn lại |
| `SALES_CLOSED` | 409 | "Sự kiện chưa mở bán hoặc đã đóng bán." | Ẩn widget đặt vé |
| `TIME_LOCKED` | 409 | "Đã có người giữ chỗ nên không đổi được giờ event." | Giữ field giờ disabled |
| `EMAIL_TAKEN` | 409 | "Email này đã có tài khoản." | Báo dưới field email |
| `SLUG_TAKEN` | 409 | "Đường dẫn (slug) này đã tồn tại." | Báo dưới field slug |
| `ALREADY_CHECKED_IN` | 409 | "Mã vé này đã được check-in lúc <checked_in_at>." | Highlight dòng vé đã dùng |
| `TICKET_VOIDED` | 409 | "Vé đã bị hủy vì sự kiện bị hủy." | Banner đỏ trên dòng vé |
| `UPSTREAM_UNAVAILABLE` | 502 | "Một phần dịch vụ đang tạm lỗi, thử lại sau ít phút." | Nút "Thử lại" |

Quy tắc: không toast chứa `error.code`, JSON raw, stack trace hay text tiếng Anh của framework.

## 4. Trạng thái bắt buộc của mỗi màn hình

Mọi block dữ liệu phải đủ bốn đường, không màn hình nào được thiếu:

| State | Trigger | Hiển thị |
|---|---|---|
| Loading | request đang bay | Skeleton cùng kích thước nội dung thật (không spinner quay giữa trang trắng) |
| Empty | 200 nhưng mảng rỗng | Icon + 1 câu giải thích + 1 hành động (ví dụ "Chưa có vé nào" → nút "Xem sự kiện đang mở bán") |
| Error | 4xx/5xx hoặc network fail | Theo bảng §3, kèm nút "Thử lại" gọi lại đúng request đó |
| Success | 200 có dữ liệu | Nội dung chính |

Degraded: response composition có `degraded: true` → hiện banner vàng "Một số thông tin (kho vé / ban tổ chức) chưa tải được" và khu tương ứng hiện empty, các phần khác vẫn dùng được.

## 5. Idempotency-Key

| Quy tắc | Chi tiết |
|---|---|
| Endpoint cần key | `POST /api/events/{id}/reservations`. |
| Giá trị | UUID sinh **một lần cho mỗi lần user bấm nút giữ chỗ**, lưu vào state của form. Retry tự động hoặc bấm lại khi chưa có response → **dùng lại key cũ**. |
| Kiêng | Không sinh key mới khi retry. Không đổi key nếu chưa đổi nội dung giỏ vé. |
| User đổi giỏ vé | Reset key mới (giỏ khác = giao dịch khác). |

## 6. Tiền, thời gian, timezone

| Loại | Xử lý |
|---|---|
| Giá | `price` và `total_amount` là **string decimal** trong JSON (`"150000.00"`), để khớp `NUMERIC(12,2)`. Không `parseFloat` rồi cộng; tổng tiền do API trả, UI chỉ hiển thị. |
| Hiển thị giá | Đơn vị tiền tệ VND: `150.000 ₫`; `price = "0.00"` hiển thị "Miễn phí". |
| Input giá (organizer) | ô số nguyên VND, gửi lên `price: String(value) + ".00"`, `currency: "VND"`. |
| Thời gian API | RFC3339 UTC, ví dụ `2026-12-01T02:30:00Z`. |
| Hiển thị | Định dạng `14:30 · 01/12/2026 (GMT+7)` bằng `Intl.DateTimeFormat('vi-VN')`; nếu event có `timezone` khác thì ghi thêm tên timezone. |
| Input datetime | `<input type="datetime-local">`, gửi `starts_at`/`ends_at` kèm offset `+07:00`, `timezone` cố định `"Asia/Ho_Chi_Minh"` ở MUST. |
| Countdown | Tính từ `expires_at` trừ `Date.now()`, cập nhật 1 giây/lần, tự dừng khi về 0 và refetch reservation một lần. |

## 7. Polling

Chỉ hai chỗ dùng polling, cả hai theo cùng luật:

| Where | Interval | Dừng khi |
|---|---|---|
| Kết quả giữ chỗ (`GET /api/reservations/{id}`) | 2000 ms | `status` là `CONFIRMED` hoặc `RELEASED`, hoặc quá `expires_at` thêm 10 giây, hoặc user rời route. Lỗi 5xx/network: tiếp tục nhưng nhân đôi interval tối đa 10 giây. |
| Số liệu bảng vé organizer | 15000 ms | Khi tab organizer đang mở; refetch ngay sau mỗi check-in thành công. |

Không dùng WebSocket ở MUST. Không poll `GET /users/me/tickets`.

## 8. Điều hướng và guard

| Route | Guard |
|---|---|
| `/auth` | Nếu đã đăng nhập → redirect `next` hoặc `/events`. |
| `/events`, `/events/[slug]` | Công khai. Widget giữ chỗ mới cần đăng nhập: bấm "Giữ chỗ" khi ANONYMOUS → sang `/auth?next=/events/<slug>`, sau khi login quay lại và mở sẵn panel giữ chỗ. |
| `/me/tickets` | ANONYMOUS → `/auth?next=/me/tickets`. |
| `/organizer` | ANONYMOUS → auth. Đã login nhưng `memberships` rỗng → hiện form tạo tổ chức (xem 05). |
| 404 router | Trang "Không tìm thấy" + nút về `/events`. |

Header chung mọi trang đã login: avatar/`display_name` + menu (Vé của tôi, Organizer nếu có membership, Đăng xuất). Header công khai: logo + "Sự kiện" + "Đăng nhập".

## 9. Cấu trúc thư mục frontend

Một feature = một thư mục, khớp tên với số thứ tự tài liệu:

```text
frontend/src/
  app/                 # router, layout, guard
  components/          # Button, Input, Select, Skeleton, EmptyState, ErrorState,
                       # Toast, Modal, TicketCard, EventCard, Countdown, StatusBadge
  features/
    auth/              # 01
    event-discovery/   # 02
    event-detail/      # 03
    my-tickets/        # 04
    organizer/         # 05
  lib/                 # apiClient (interceptor + error map §3), auth store,
                       # formatters (tiền, thời gian, countdown), idKey()
```

Quy tắc: component chỉ nằm trong `features/<tên>` nếu chỉ một feature dùng; dùng từ 2 feature trở lên mới đẩy lên `components/`. Gọi API chỉ qua `lib/apiClient`, không `fetch` rải rác trong component.

## 10. Chuẩn input dùng chung

| Loại field | Luật |
|---|---|
| Bắt buộc | hiện `*`; submit khi thiếu → báo "Trường này không được để trống" ngay dưới field, focus field đầu tiên lỗi. |
| Email | validate regex + lowercase trước khi gửi. |
| Password | tối thiểu 8 ký tự, không đòi độ phức tạp khác ở MUST. |
| Slug | `^[a-z0-9](?:-?[a-z0-9]){2,59}$`; tự sinh từ title khi user gõ title nếu slug chưa từng được sửa. |
| Số lượng vé | integer 1..10, clamp khi gõ ngoài khoảng, hiển thị số còn lại của loại vé. |
| Mô tả event | tối đa 2000 ký tự, đếm ký tự hiện ra. |
| Thời gian | `ends_at > starts_at`, sai → báo lỗi field, không gửi request. |
| Trạng thái submit | nút đổi thành "Đang..." + `disabled`, không overlay chặn cả trang. |

## 11. Accessibility tối thiểu (check khi review)

Form có `<label for>` thật, lỗi gắn `aria-describedby`, focus không mất sau submit, mọi nút bấm được bằng Enter, bảng vé có `<th scope="col">`, badge trạng thái không chỉ dựa vào màu (có chữ đi kèm).

## 12. Definition of done cho mỗi file UI

1. Đủ 4 state §4 và mọi mã lỗi ở §3 từng xảy ra trong feature đó đã được test tay.
2. Không request nào ngoài bảng "Route → API" của feature.
3. Snapshot route chính chạy được với `docker compose up` + seed data.
4. Test manual theo mục "Checklist nghiệm thu" cuối file feature, ghi kết quả vào `docs/ui/reports/<feature>.md`.
