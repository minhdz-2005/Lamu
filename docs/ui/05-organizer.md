# 05. Trang organizer tối giản

**Route:** `/organizer` · **Cần đăng nhập:** Bắt buộc + có membership trong tổ chức · **Ưu tiên:** 5 · **API:** `GET /api/users/me`, `POST /api/organizations`, `POST /api/events`, `GET /api/organizations/{orgId}/events`, `POST /api/events/{id}/publish`, `POST /api/events/{id}/cancel`, `POST /api/events/{id}/ticket-types`, `GET /api/events/{id}/availability`, `GET /api/events/{id}/tickets`, `POST /api/tickets/check-in`

Mục tiêu: đủ để tự chứng minh đường thẳng đứng demo — tạo event, mở bán, thêm loại vé, rồi đứng ở cửa check-in khách. Một trang, ba tab, không có sidebar quản trị.

Không làm ở MUST (STRETCH): sửa event đã publish, đổi giờ, quản lý thành viên/role, dashboard số liệu, QR.

## 1. Guard và chọn tổ chức

```text
GET /api/users/me -> memberships[]
   memberships: [{organization_id, name, slug, roles[]}]   (shape chốt ở catalog §1)
  rỗng            -> Tab 0: form "Tạo tổ chức" (bắt buộc trước khi làm gì khác)
  có 1            -> auto-select org đó
  có nhiều         -> dropdown "Tổ chức" ở header trang, lưu lựa chọn vào sessionStorage
```

| Thành phần | Quyền cần | Nếu thiếu |
|---|---|---|
| Xem tab Sự kiện của tổ chức | membership bất kỳ (`event.read`) | Ẩn tab, hiện "Bạn chưa là thành viên tổ chức nào." |
| Tạo event | `event.create` | Nút "Tạo event" disabled + tooltip "Bạn cần quyền tạo event." Server vẫn 403 → banner đỏ |
| Publish / cancel | `event.publish` / `event.cancel` | từng nút ẩn theo vai trò, không ẩn cả tab |
| Thêm loại vé | `event.update` | panel loại vé disabled |
| Check-in | `ticket.checkin` | tab Check-in chỉ hiện khi có quyền; chủ tọa demo dùng tài khoản OWNER/ADMIN |

Identity là nguồn quyền duy nhất; frontend suy từ `memberships[].roles[]` trả về ở `GET /api/users/me` và **luôn** xử lý 403 như một nhánh bình thường.

## 2. Layout

```text
+------------------------------------------------+
| Tổ chức: [Luma Studio ▾]        [Tạo tổ chức mới]|
| [ Sự kiện của tôi ] [ Bán vé ] [ Check-in ]     |
+---------------- TAB 1: SỰ KIỆN -----------------+
|  [+ Tạo event]                                  |
|  | TITLE        | slug        | status  | hành động |
|  | TECH CONF    | tech-conf   | DRAFT   | [Publish] [Hủy] |
|  | VUI FEST     | vui-fest    |PUBLISHED| [Bán vé]  [Hủy] |
|  | OLD MEET     | old-meet    |CANCELLED| —         |
+------------------------------------------------+
+---------------- TAB 2: BÁN VÉ ------------------+
|  Event: [TECH CONF ▾]                           |
|  | Loại vé  | Giá VND  | Capacity | Đã bán/giữ | còn | Mở bán |
|  | Early    | 150000   |   100    |  40 / 5    |  55 | 20/11  |
|  | Free     | 0        |    50    |   0 / 0    |  50 | 20/11  |
|  [+ Thêm loại vé]  -> form inline (tên, giá, capacity, sales_start, sales_end)
+------------------------------------------------+
+-------------- TAB 3: CHECK-IN ------------------+
|  Event: [TECH CONF ▾]    Đã vào: 40 / 41        |
|  Mã vé: [ LUMA-7F3A-91C4________ ] [Check-in]   |
|  (kết quả current in ra: xanh "Hợp lệ - Early"  |
|   hoặc đỏ "Đã check-in lúc 18:04")              |
|  | code            | loại vé | trạng thái | giờ vào |
|  | LUMA-7F3A-91C4  | Early   | USED       | 18:04   |
|  | LUMA-1B22-CD09  | Early   | ISSUED     |   —     |
+------------------------------------------------+
```

## 3. Tab 1 — Sự kiện của tôi

### 3.1 Danh sách

```text
GET /api/organizations/{orgId}/events?status=&from=&to=
200 -> [{id, title, slug, status, starts_at}] + total
```

| Cột | Hiển thị |
|---|---|
| title | link sang `/events/{slug}` chỉ khi `status = PUBLISHED`; DRAFT/CANCELLED hiển thị text thường (API public trả 404 cho DRAFT) |
| slug | monospace, chữ nhỏ |
| status | badge: DRAFT xám, PUBLISHED xanh, CANCELLED đỏ |
| starts_at | `14:30 · 01/12/2026` (00 §6) |
| hành động | `PUBLISHED` → [Bán vé] [Hủy]; `DRAFT` → [Publish] [Hủy]; `CANCELLED` → không có nút |

Lọc `status` (dropdown All/DRAFT/PUBLISHED/CANCELLED) phản ánh vào `?tab=events&status=`. Sắp xếp mặc định `starts_at` tăng dần do UI sort client-side trên `total` đã lấy (API không guarantee thứ tự ở MUST).

### 3.2 Form tạo event (modal)

| Field | Gửi | Luật UI | Lỗi |
|---|---|---|---|
| `title` | `title` | bắt buộc, ≤ 120 ký tự | `VALIDATION_FAILED` |
| `slug` | `slug` | auto từ title (lowercase, bỏ dấu, `-`), khớp regex 00 §10; sửa tay thì ngừng auto | `SLUG_TAKEN` → "Đường dẫn (slug) này đã tồn tại trong tổ chức." |
| `description` | `description` | bắt buộc, ≤ 2000, có counter | — |
| `starts_at` | `starts_at` | `datetime-local`, không quá 2 năm sau | `ends_at > starts_at` check client |
| `ends_at` | `ends_at` | phải sau `starts_at` | báo dưới field, không gửi request |
| `timezone` | `timezone` | select, mặc định `Asia/Ho_Chi_Minh`; chỉ 2 lựa chọn `Asia/Ho_Chi_Minh`, `UTC` ở MUST | — |
| `venue` | `venue: {name, address}` | 2 ô text, không bắt buộc; gửi object `{}` nếu cả hai rỗng | — |

```text
POST /api/events  body {organization_id, title, slug, description, starts_at, ends_at, timezone, venue}
200 -> {event_id, version}
```

Thành công → toast "Đã tạo bản nháp.", đóng modal, refetch danh sách, event mới ở `DRAFT` và **tự mở Tab 2 "Bán vé" cho event đó** (bước tiếp theo hiển nhiên nhất, đỡ một lượt click khi demo).

Không phát event nào khi tạo DRAFT (kiến trúc §3.2) nên UI không có trạng thái "đang thông báo".

### 3.3 Publish

| Bước | Nội dung |
|---|---|
| 1 | Confirm dialog: "Public event sẽ hiển thị cho mọi người và bắt đầu nhận giữ chỗ." |
| 2 | Nếu event đó chưa có loại vé nào (`GET /api/events/{id}/availability` rỗng hoặc 409) → cảnh báo vàng trong dialog: "Chưa có loại vé. Khách vào sẽ thấy Hết vé cho tới khi bạn thêm vé." Vẫn cho publish — API không chặn. |
| 3 | `POST /api/events/{id}/publish` → `{status: "PUBLISHED"}` |
| 4 | Refetch danh sách; badge đổi PUBLISHED; hiện link công khai copy được `/events/{slug}` |

`409` (đã publish rồi / trạng thái không hợp lệ) → toast + refetch để đồng bộ badge.

### 3.4 Hủy event

```text
POST /api/events/{id}/cancel  body {reason}   (reason bắt buộc, ≤ 300 ký tự)
```

Dialog hủy nêu hậu quả bằng ba dòng cố định, vì đây là hành động khó hoàn tác nhất trong demo:

```text
1. Khách đã giữ chỗ sẽ mất chỗ, vé đã bán thành VOIDED.
2. Payment sẽ tự hoàn 100% các giao dịch SUCCESS (quyết định 7).
3. Notification gửi email "BookingCancelled" tới từng người có vé.
```

Thành công → badge CANCELLED, hết sạch nút hành động của event đó.

## 4. Tab 2 — Bán vé

### 4.1 Danh mục

```text
GET /api/events/{eventId}/availability
200 -> [{ticket_type_id, name, price, currency, capacity, sold, reserved, available, sales_open}]
409 -> event chưa PUBLISHED -> panel hiện "Publish event trước khi mở bán." + nút tới Tab 1
```

| Cột | Nguồn | Ghi chú |
|---|---|---|
| Loại vé | `name` | — |
| Giá | `price` + `currency` | format 00 §6; `"0.00"` → "Miễn phí" + badge nhỏ "xác nhận ngay, không qua thanh toán" |
| Capacity | `capacity` | — |
| Đã bán / đang giữ | `sold` / `reserved` | số liệu thật, không suy đoán |
| Còn lại | `available` | ≤ 10 → chữ đỏ |
| Cửa bán | `sales_open`, `sales_start`, `sales_end` nằm sẵn trong `availability` | badge "Đang mở" / "Chưa mở" / "Đã đóng" |
| Trạng thái loại vé | `status` trong `availability` | `ACTIVE` / `CLOSED` |

### 4.2 Thêm loại vé (form inline, không modal)

| Field | Gửi | Luật |
|---|---|---|
| `name` | string, bắt buộc, ≤ 60 | — |
| `price` | ô số nguyên VND → gửi `String(value)` + `.00`, `currency: "VND"` | để trống hoặc 0 = vé miễn phí; hiện chú thích "Miễn phí: khách nhận vé ngay khi giữ chỗ" |
| `capacity` | int ≥ 1, ≤ 100000 | — |
| `sales_start`, `sales_end` | `datetime-local`, `sales_end > sales_start` | bắt buộc; mặc định điền `now` → `starts_at` của event |

```text
POST /api/events/{eventId}/ticket-types  body {name, price, currency, capacity, sales_start, sales_end}
200 -> {ticket_type_id}
```

| Lỗi | UI |
|---|---|
| `409` event chưa PUBLISHED | panel đã chặn, nếu vẫn gặp (race với tab khác) → banner + refetch availability |
| `400 VALIDATION_FAILED` | báo dưới field theo `message` |
| `403 FORBIDDEN` | banner + disable form tới khi đổi event |

Thành công → thêm dòng vào bảng, focus lại ô `name` của form trống để nhập loại kế tiếp (demo hay cần 2-3 loại).

### 4.3 Đổi capacity/giá sau khi mở bán

Ở MUST **không có UI** này (`PATCH /ticket-types/{id}` tồn tại nhưng không màn hình nào gọi). Ghi chú trong báo cáo: tạo loại vé mới thay vì sửa.

## 5. Tab 3 — Check-in

| Thành phần | Chi tiết |
|---|---|
| Chọn event | chỉ event `PUBLISHED` hoặc `CANCELLED` (CANCELLED để đối chiếu, vé đều `VOIDED`) |
| Ô mã | `input` monospace, uppercase hóa khi gõ, trim; Enter = bấm nút |
| Nút | "Check-in" → `POST /api/tickets/check-in` body `{code}` |
| Bảng vé | `GET /api/events/{eventId}/tickets?status=&limit=50&offset=0` → `[{ticket_id, code, ticket_type_name, status, checked_in_at}]` |
| Bộ đếm | "Đã vào: {used} / {tổng}" tính từ `total` và `status=USED`; refresh 15 giây khi tab đang mở (00 §7) |

### 5.1 Kết quả check-in (panel kết quả ngay dưới ô mã)

| API | Panel | Âm thanh |
|---|---|---|
| `200 {status: "USED", checked_in_at}` | xanh: "Hợp lệ · <ticket_type_name> · vào lúc <checked_in_at>" | beep OK (tùy chọn, có toggle) |
| `409 ALREADY_CHECKED_IN` | đỏ: in nguyên văn `message` từ API — server đã nhét timestamp lần check-in trước vào câu đó | beep lỗi |
| `409 TICKET_VOIDED` | cam: "Vé đã hủy vì sự kiện bị hủy." | beep lỗi |
| `404 NOT_FOUND` | đỏ: "Mã vé không tồn tại. Kiểm tra lại phím tắt Tiếng Việt." | beep lỗi |
| `403 FORBIDDEN` | đỏ: "Bạn không có quyền check-in event này." + ẩn tab sau refetch | — |

Sau mỗi lần 200: refetch bảng vé một lần (không chờ 15 giây), scroll dòng vé tương ứng lên đầu bảng, giữ focus trong ô mã để quét mã liền mạch.

### 5.2 Quy tắc nhập liệu bàn check-in

| Luật | Lý do |
|---|---|
| Không auto-submit khi đủ 14 ký tự | mã vé dài bao nhiêu không phải hợp đồng UI |
| Không gửi mã rỗng / chỉ khoảng trắng | tránh 404 vô nghĩa |
| Hai lần gửi cùng mã trong 800 ms | chặn client-side, chỉ hiện kết quả của request đầu |
| Bảng hiển thị mã đầy đủ, không che | nhân viên cần đối chiếu với vé khách đọc |
| Không lưu danh sách đã check-in vào localStorage | dữ liệu quyền nhạy cảm, source of truth là server |

## 6. State màn hình (đủ 4 đường theo 00 §4)

| Khu | Loading | Empty | Error | Success |
|---|---|---|---|---|
| Guard org | skeleton header trang | "Bạn chưa là thành viên tổ chức nào" + form tạo org (§1) | 401 → auth; 5xx → Thử lại | dropdown org |
| Tab 1 list | 4 skeleton dòng | "Chưa có event. Bấm Tạo event." + nút mở modal | banner + Thử lại | bảng |
| Tab 2 | skeleton bảng vé | "Chưa có loại vé" + form mở sẵn | `409` chưa publish → hướng dẫn publish | bảng + counter |
| Tab 3 | skeleton bảng | "Event này chưa có vé nào" (capacity 0 hoặc chưa ai mua) | 403/5xx theo §5.1 | bảng + đếm |

## 7. Edge cases

| Case | Xử lý |
|---|---|
| `POST /organizations` fail `SLUG_TAKEN` | báo dưới field slug của form tạo tổ chức, focus lại ô slug |
| User có membership nhưng role `SPEAKER` (chỉ `event.read`) | Tab 1 xem được danh sách, mọi nút ghi bị ẩn; Tab 2/3 disabled kèm dòng "Bạn chỉ có quyền xem." |
| Publish xong nhưng `event_snapshot` phía Registration chưa cập nhật (eventual, vài giây) | Link `/events/{slug}` có thể 404 trong vài giây → 03 hiện ErrorState "thử lại"; tab 1 hiện note "Event vừa publish, trang công khai có thể chậm vài giây." |
| Hai organizer cùng tạo slug giống nhau | kẻ thắng 200, kẻ thua `SLUG_TAKEN` → UI giữ form để sửa |
| Thêm loại vé `price = 0` | badge "Miễn phí" trong bảng; khi khách mua, 03 §4 nhánh A confirm ngay — mô tả đúng trong tooltip của badge |
| Check-in mã của event khác event đang chọn | 200 bình thường (API tra theo mã); UI thêm dòng phụ "Lưu ý: mã này thuộc event `event_title`" — hai field `event_id`, `event_title` có sẵn trong response check-in, không cần gọi thêm API |
| Bảng vé lớn (> 200 dòng) | phân trang bằng `limit`/`offset` với nút "Xem tiếp", không virtualize |
| Đang mở form loại vé thì event bị tab khác cancel | submit gặp 409/403 → refetch, đóng form, banner "Event đã bị hủy." |

## 8. Checklist nghiệm thu

- [ ] Tài khoản mới, chưa có org → vào `/organizer` gặp form tạo tổ chức; tạo xong dropdown hiện org.
- [ ] Tạo event DRAFT → tự nhảy sang Tab 2 cho event đó; bảng vé báo "Publish event trước khi mở bán."
- [ ] Publish khi chưa có loại vé → dialog có cảnh báo vàng, publish vẫn thành công, badge đổi PUBLISHED.
- [ ] Thêm loại vé miễn phí + loại vé 150.000 ₫ → bảng hiện đúng "Miễn phí" và format tiền.
- [ ] Copy link công khai từ Tab 1, mở ở tab ẩn danh → thấy trang 03, số `available` khớp.
- [ ] Chạy đủ đường thẳng đứng: mua vé 0 ₫ → `/me/tickets` có mã → dán mã vào Tab 3 → "Hợp lệ", đếm "Đã vào" tăng 1.
- [ ] Check-in lại cùng mã → đỏ "đã check-in lúc ...", bảng không nhân đôi dòng.
- [ ] Mã sai → đỏ "Mã vé không tồn tại", form không mất focus.
- [ ] Hủy event có khách đã mua → dialog 3 dòng, xác nhận xong badge CANCELLED, `/me/tickets` phía khách chuyển nhãn "Sự kiện đã hủy".
- [ ] Đăng nhập bằng tài khoản SPEAKER → không bấm được nút ghi nào; nếu cố gửi request vẫn hiện banner 403 (test bằng devtools).
- [ ] Không có request nào tới `PATCH /api/events/...` hay `PATCH /api/ticket-types/...` (STRETCH, chưa mở).
- [ ] Ghi kết quả test vào `docs/ui/reports/05-organizer.md`.
