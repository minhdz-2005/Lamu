# Báo cáo test tay — 03 Chi tiết sự kiện & giữ chỗ

Test trên `npm run dev` + mock gateway, ngày 02/11/2026. Cấu hình mock: `PAYMENT_DELAY_SECONDS = 5`, `HOLD_SECONDS = 120`, poll reservation 2000 ms.

| Checklist mục | Kết quả | Ghi chú |
|---|---|---|
| Event miễn phí: một request → thấy `code` ngay, không countdown | đạt | `soa-open-talk` → chỉ `POST /events/{id}/reservations`, panel "Bạn đã có vé" + `LUMA-2E1F-95A2` |
| Event có phí: `HELD` + countdown → tự đổi Success khi poll thấy `CONFIRMED` | đạt | "Đang chờ kết quả thanh toán… còn 01:53 · 150.000 ₫"; 2 lượt poll rồi Success |
| Hủy giữa chừng: `DELETE` → panel về cart, `available` tăng lại | đạt | "Đã hủy giữ chỗ.", `Vé giấy` còn 19/20, giữ qty 1 trong cart |
| Hai tab tranh 1 chỗ → một Success, một `SOLD_OUT`, không vé âm | chưa test | thay bằng 13 request gọi thẳng API: request thứ 3 nhận `409 SOLD_OUT`, không loại vé nào `available < 0` |
| Bấm "Giữ chỗ" khi chưa login → `/auth?next=/events/<slug>` → login xong cart còn | đạt | xem báo cáo 01 |
| Tắt Payment → HELD tới hạn, `expires_at + 10s` hiện "Chờ lâu bất thường" | chưa test | mock luôn settle ở 5 s < 120 s nên không tới nhánh này; logic `slow` + nút "Kiểm tra lại" đã code-review |
| Tắt Registration → composition `degraded: true`, hero vẫn hiện, khu vé empty + Tải lại | đạt | `/events/soa-open-talk?degraded=availability,organization`: banner vàng "Kho vé chưa tải được…", "Thông tin ban tổ chức tạm không tải được", nút "Tải lại kho vé" |
| `POST` fail mạng → bấm Thử lại dùng **cùng** Idempotency-Key | chưa test | cần tắt Gateway; code giữ `keyRef` tới khi có response |
| Event `CANCELLED` → banner hủy, panel disabled | đạt | `luma-dev-summit` sau khi cancel: "Sự kiện đã bị hủy…", mọi input `aria-disabled` |
| Không request nào tới `/internal/...` | đạt | Network log chỉ có `/api/public/...`, `/api/events/...`, `/api/reservations/...`, `/api/users/me/tickets` |
| Ghi kết quả vào báo cáo | đạt | file này |

Nhánh đã chạy thêm ngoài checklist:
`409 SALES_CLOSED` từ UI (`/events/cong-ben-24-gio`: "Chưa mở bán" + "Mở bán lúc 18:01 · 02/11/2026 — còn 16:57:57", nút giữ chỗ ẩn),
`SOLD_OUT` toàn bộ loại vé (`/events/dem-nhac-thu-bay` sau khi hết kho: banner "Hết vé" + link "Xem sự kiện khác"),
thanh toán thất bại (`payment_status: FAILED` → "Thanh toán thất bại, chỗ đã được giải phóng." + nút "Thử lại" với key mới).

Ghi chú lệch thiết kế: 03 §1 vẽ một panel sticky duy nhất; bản code tách thành hai card — card trên là danh mục loại vé (luôn còn để giữ lần mua kế tiếp), card dưới là khu trạng thái `cart / held / success / failed`. Nhánh `?degraded=` đọc từ search param của route rồi chuyển tiếp vào request composition, chỉ để demo; Gateway thật tự quyết định `degraded`.

Redesign 02/11: ngày + địa điểm gom thành hai pill trong `.event-meta` (không thêm field, vẫn là `starts_at`/`timezone`/`venue`); nút "Giữ chỗ" dùng variant accent cỡ lớn vì đây là CTA duy nhất của màn hình. Đã chạy lại luồng free-ticket sau redesign: `+` → "Giữ chỗ" → banner "Bạn đã có vé." + mã `LUMA-69BC-8D13`.
