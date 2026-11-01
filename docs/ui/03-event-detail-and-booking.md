# 03. Chi tiết sự kiện và đặt vé

**Route:** `/events/[slug]` · **Cần đăng nhập:** chỉ khi bấm Giữ chỗ · **Ưu tiên:** 3 · **API:** `GET /api/public/events/{slug}/details`, `POST /api/events/{eventId}/reservations`, `GET /api/reservations/{reservationId}`, `DELETE /api/reservations/{reservationId}`

Mục tiêu: một trang trả lời đủ "event này là gì, còn vé không, lấy vé thế nào" và dẫn user tới kết quả cuối cùng (có `ticket.code`) mà không phải sang trang khác.

## 1. Layout

```text
+---------------------------+  +----------------------+
|  BREADCRUMB Sự kiện / ...  |  |                      |
|  TITLE (h1)                |  |  PANEL GIỮ CHỠ       |
|  14:30 · 01/12/2026 (GMT+7)|  |  (sticky, 360px)     |
|  [venue icon] Nhà A, Q1    |  |                      |
|  -------------------------  |  |  Loại vé             |
|  MÔ TẢ (rich text thường)   |  |  [ ] Early  150.000₫ |
|  -------------------------  |  |      còn 55   [-][2][+]
|  BAN TỔ CHỨC                |  |  [ ] Regular 300.000₫|
|  Luma Studio  (ghép slug)   |  |      còn 20   [-][0][+]
|                             |  |  ------------------- |
|                             |  |  Tổng: 300.000 ₫     |
|                             |  |  [      Giữ chỗ     ]|
|                             |  |  còn 09:41 (khi HELD)|
+---------------------------+  +----------------------+
```

| Component | Props | Ghi chú |
|---|---|---|
| `EventDetailPage` | `slug` (từ route) | sở hữu `data`, `booking`, `reservation` |
| `EventHero` | `event` | title, ngày giờ, venue, badge trạng thái |
| `EventDescription` | `description` | render text thường + xuống dòng; **không** render HTML từ API (chống XSS) |
| `OrganizerCard` | `organization` | tên + slug; link `/events?q=<slug>` |
| `BookingPanel` | `availability[]`, `onReserve`, `cart`, `reservation`, `disabledReason` | toàn bộ logic giữ chỗ |
| `TicketTypeRow` | `item`, `qty`, `onQtyChange` | checkbox/số lượng |
| `ReservationStatus` | `reservation` | HELD / CONFIRMED / RELEASED + countdown + link vé |

## 2. Load trang

`GET /api/public/events/{slug}/details` một lần, không gọi `GET /public/events/{slug}` riêng (composition đã gộp `event` + `organization` + `availability`; shape và `degraded_sources` xem catalog §6).

| Key | Quyết định |
|---|---|
| `event.id` | dùng làm `{eventId}` khi giữ chỗ; **không** dùng slug trong đường dẫn reservation |
| `event.status` | `PUBLISHED` → cho giữ chỗ; `CANCELLED` → banner đỏ + panel disabled; khác → coi như not found |
| `availability[]` | nguồn duy nhất của tên loại vé, giá, số còn và `sales_open` |
| `organization` | khu "Ban tổ chức"; lỗi → hiện "Thông tin ban tổ chức tạm không tải được" |
| Refresh | refetch khi tab quay lại focus và dữ liệu cũ hơn 15 giây; giữ nguyên `cart` đã chọn |

## 3. Panel giữ chỗ — luật hiển thị

| Điều kiện | Panel | Nút chính |
|---|---|---|
| Chưa login | hiện đầy đủ giá và số còn | "Giữ chỗ" → redirect `/auth?next=/events/<slug>` |
| `event.status = CANCELLED` | mờ, input disabled | banner "Sự kiện đã bị hủy. Bạn đã giữ chỗ/đã mua sẽ được hoàn tiền tự động." (quyết định 7 kiến trúc) |
| `sales_open = false` mọi loại vé | hiện giá nhưng không chọn được | "Chưa/đã đóng bán" + lý do theo `sales_start`/`sales_end` của loại gần nhất |
| `available = 0` mọi loại | hiện "Hết vé" | disabled, gợi ý "Xem sự kiện khác" link `/events` |
| `degraded_sources` chứa `availability` | khu vé trống | banner vàng + nút "Tải lại kho vé" (refetch composition) |
| Bình thường | chọn số lượng 1..10 mỗi loại, tổng tiền nhân từ `price` × qty **do API tính lại khi giữ chỗ**; UI chỉ nháp | "Giữ chỗ" enabled khi `Σ qty ≥ 1` |

Số lượng: `[-] [n] [+]`, clamp `0..min(10, available)`; gõ trực tiếp ngoài khoảng thì clamp ngay khi blur. `available` hiển thị "còn 55"; `≤ 10` thì chữ đỏ + badge "Sắp hết".

## 4. Flow giữ chỗ

```text
bấm Giữ chỗ
  -> sinh idempotency key 1 lần cho phiên bấm (00 §5)
  -> POST /api/events/{eventId}/reservations
       header Idempotency-Key: <uuid>
       body {items: [{ticket_type_id, quantity}]}   (chỉ loại qty > 0)
  -> response:
     A) có registration_id + tickets[]  => VÉ MIỄN PHÍ, xong (quyết định 2)
     B) có reservation_id + status HELD => VÉ CÓ PHÍ, sang §5
```

| Kết quả | Hành động UI |
|---|---|
| A: `{registration_id, tickets[]}` | Panel đổi sang **Success**: danh sách vé (`code`, tên loại vé), nút "Xem vé của tôi" → `/me/tickets`, "Tải vé" (in/PDF trình duyệt). Không còn countdown. |
| B: `{reservation_id, status:"HELD", expires_at, total_amount}` | Panel đổi sang **Chờ thanh toán**: "Chúng tôi đang xử lý giao dịch mock…" + countdown từ `expires_at` + bắt đầu poll §5. Nút phụ "Hủy giữ chỗ" → `DELETE /api/reservations/{id}` |
| `409 SOLD_OUT` | toast + banner đỏ trong panel, refetch composition để cập nhật `available`, reset `cart` về qty không vượt số còn |
| `409 SALES_CLOSED` | panel về trạng thái "đã đóng bán" (§3), không retry |
| `400 VALIDATION_FAILED` | báo trong panel, không tự retry |
| `401 UNAUTHENTICATED` | 00 §2: thử refresh; fail → `/auth?next=/events/<slug>` |
| `404 NOT_FOUND` | trang "Sự kiện không tồn tại" + nút về `/events` |
| `502 / network` | giữ nguyên cart, hiện "Chưa gửi được yêu cầu, thử lại" + **dùng lại key cũ** khi bấm Thử lại |

Cấm: không gọi Payment, không gọi `POST /api/reservations/{id}/confirm` (endpoint nội bộ, saga tự confirm), không bấm "Thanh toán" giả.

## 5. Chờ kết quả thanh toán mock (vé có phí)

```text
mỗi 2000ms: GET /api/reservations/{reservationId}
  -> {status, expires_at, items[], total_amount, payment_status}
```

| `status` | `payment_status` | UI | Dừng poll |
|---|---|---|---|
| `HELD` | `PENDING` | "Đang chờ kết quả thanh toán…" + progress bar chậm + countdown | chưa |
| `HELD` | `null` | "Đang chuẩn bị giao dịch…" (Payment chưa tiêu message) | chưa |
| `CONFIRMED` | `SUCCEEDED` | **Success** (§4A): gọi tiếp `GET /api/users/me/tickets`, lọc theo `event_id` để lấy `code` | có |
| `RELEASED` | `FAILED` | "Thanh toán thất bại, chỗ đã được giải phóng." + nút "Thử lại" (giữ cart, **key mới** vì là giao dịch mới) | có |
| `RELEASED` | `SUCCEEDED`/`null` | "Hết thời gian giữ chỗ." + nút "Chọn vé lại" | có |
| quá `expires_at` + 10s vẫn `HELD` | — | "Chờ lâu bất thường" + nút "Kiểm tra lại" (1 lần refetch) rồi dừng poll | có |

`payment_status` do Registration cập nhật khi tiêu event, UI **không** gọi Payment để hỏi (00 §1).

## 6. Hủy và rời trang

| Tình huống | Xử lý |
|---|---|
| Bấm "Hủy giữ chỗ" | `DELETE /api/reservations/{id}` → `{status:"RELEASED"}` → panel về cart, toast "Đã hủy giữ chỗ." Nếu API 409 (đã confirm) → refetch reservation và hiển thị Success |
| Rời route khi đang `HELD` | Dừng poll, không confirm hộ. Chỗ sẽ hết hạn theo `expires_at` (worker). Hiện toast nhẹ "Giữ chỗ vẫn đang chờ, vào lại trang này để xem kết quả." |
| Quay lại `/events/{slug}` khi chưa biết reservation cũ | KHÔNG có endpoint "liệt kê reservation của tôi" ở MUST → panel về cart bình thường. Ghi rõ trong báo cáo demo: user bấm giữ chỗ lại, key mới, quota cũ sẽ tự nhả khi hết hạn |
| Hai tab cùng giữ chỗ trên một event | Hai `reservation_id` độc lập, cả hai poll bình thường; không cần lock phía UI |

## 7. State màn hình

| State | Trigger | Nội dung |
|---|---|---|
| Loading | request composition đầu | skeleton hero + skeleton panel |
| Empty/404 | `404`, slug sai, `status != PUBLISHED` và không phải CANCELLED | trang "Không tìm thấy sự kiện" + link `/events` |
| Error | 5xx/network | ErrorState + Thử lại |
| Degraded | `degraded: true` | nội dung vẫn hiện; khu thiếu nguồn → empty riêng + banner vàng theo §3 |
| Cart | `Σ qty > 0` | panel hiện tổng tạm tính |
| Submitting | đang POST reservation | nút "Đang giữ chỗ...", disable toàn panel, **giữ idempotency key** |
| Held | §4B | countdown + poll |
| Success | §4A hoặc `CONFIRMED` | vé + `code` + link `/me/tickets` |
| Failed | `RELEASED` | theo bảng §5 |

## 8. Edge cases

| Case | Xử lý |
|---|---|
| `available` tụt về 0 trong lúc user đang chọn | khi POST → `SOLD_OUT` (UI không tự chặn sớm, vì quota thật ở server) |
| User chọn 2 loại, 1 loại hết vé | server fail toàn bộ reservation → banner ghi rõ loại nào không còn, refetch availability |
| `total_amount = "0.00"` nhưng API trả `HELD` (server bug / chưa đồng bộ quyết định 2) | UI vẫn poll bình thường; ghi issue — **không** tự đổi trạng thái phía client |
| `venue` là object rỗng `{}` | khu venue hiện "Địa điểm đang cập nhật" |
| `ends_at < starts_at` (seed lỗi) | hiển thị cả hai, badge cảnh báo trong trang, không crash |
| Đổi slug khi đang ở trang (click link event khác ở "sự kiện tương tự") | reset `cart`, `reservation`, dừng poll cũ trước khi start poll mới |
| `sales_start` tương lai | panel hiện "Mở bán lúc 09:00 20/11/2026", đếm ngược tới `sales_start`, nút disabled |
| User gửi form 2 lần rất nhanh | node thứ hai chặn bằng `submitting` + cùng key → server trả lại kết quả cũ (idempotent) |

## 9. Checklist nghiệm thu

- [ ] Event miễn phí: bấm Giữ chỗ → **một request** → thấy `code` vé ngay, không có countdown, Payment không bị gọi.
- [ ] Event có phí: bấm Giữ chỗ → `HELD` + countdown < 10 giây → sau `PAYMENT_MOCK_DELAY_SECONDS` thì tự đổi sang Success khi poll thấy `CONFIRMED`.
- [ ] Hủy giữa chừng: `DELETE` → panel về cart, số `available` tăng lại sau refetch.
- [ ] Chạy 2 tab demo capacity nhỏ (ví dụ còn 1): một tab Success, tab kia `SOLD_OUT`, không tab nào hiện vé âm.
- [ ] Bấm Giữ chỗ khi chưa login → vào `/auth?next=/events/<slug>` → login xong quay lại, cart vẫn còn.
- [ ] Tắt Payment service → reservation ở `HELD` tới hạn, poll hết `expires_at` + 10s thì hiện "Chờ lâu bất thường", không treo vô hạn.
- [ ] Tắt Registration service → composition `degraded: true`, hero + ban tổ chức vẫn hiện, khu vé empty + nút Tải lại.
- [ ] `POST` fail mạng → bấm Thử lại dùng **cùng** Idempotency-Key (verify: server không tạo reservation thứ hai).
- [ ] Event `CANCELLED` → banner hủy, panel disabled, không gửi được reservation.
- [ ] Không có request nào tới `/internal/...` (kiểm bằng Network tab lúc demo).
- [ ] Ghi kết quả test vào `docs/ui/reports/03-event-detail-and-booking.md`.
