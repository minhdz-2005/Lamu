# Báo cáo test tay — 05 Organizer tối giản

Test trên `npm run dev` + mock gateway, ngày 02/11/2026. Tài khoản: `demo@luma.dev` (OWNER), `speaker@luma.dev` (SPEAKER), `khachmoi@luma.dev` (tài khoản mới tạo giữa lượt test).

| Checklist mục | Kết quả | Ghi chú |
|---|---|---|
| Tài khoản chưa có org → gặp form tạo tổ chức; tạo xong dropdown hiện org | đạt | `khachmoi@luma.dev` → "Bạn chưa là thành viên tổ chức nào." → tạo "Xep Hang Thinh" → dropdown `Xep Hang Thinh · OWNER`, ba tab hiện ra |
| Tạo event DRAFT → tự nhảy sang Tab 2; bảng vé báo "Publish event trước khi mở bán." | đạt | URL `/organizer?tab=sell&event=<id>`, form loại vé khóa, nút "Về tab Sự kiện" |
| Publish khi chưa có loại vé → dialog có cảnh báo vàng, publish vẫn thành công, badge đổi PUBLISHED | đạt | dialog: "Chưa có loại vé. Khách vào sẽ thấy Hết vé…" → 200 → link công khai + note `event_snapshot`; bảng đổi "PUBLISHED · Đang mở" |
| Thêm loại vé miễn phí + loại 150.000 ₫ → bảng hiện đúng "Miễn phí" và format tiền | đạt | thêm trên event mới: "Miễn phí · không qua thanh toán" và "250.000 ₫"; `sales_end < sales_start` bị chặn ngay tại field, không gửi request |
| Copy link công khai, mở tab ẩn danh → thấy trang 03, số `available` khớp | đạt | organizer báo `Vào sớm 30 / Vé chính 100`; trang `/events/dem-nhac-thu-bay` hiện "còn 30" và "còn 100" |
| Đường thẳng đứng: mua vé 0 ₫ → `/me/tickets` có mã → dán mã vào Tab 3 → "Hợp lệ", đếm "Đã vào" tăng | đạt | `LUMA-5922-1184` → "Hợp lệ · Vào sớm · vào lúc 00:51 · 02/11/2026", 0 → 1/4 |
| Check-in lại cùng mã → đỏ "đã check-in lúc …", bảng không nhân đôi dòng | đạt | "Mã vé đã được check-in lúc 00:50 · 02/11/2026." — mock in giờ địa phương; bảng vẫn 4 dòng |
| Mã sai → đỏ "Mã vé không tồn tại", form không mất focus | đạt | ô `code` giữ focus sau mọi lần; input tự uppercase |
| Hủy event có khách → dialog 3 dòng, badge CANCELLED, phía khách chuyển nhãn "vé đã hủy" | đạt | reason bắt buộc (rỗng → lỗi field); `/me/tickets` của khách: 4 card "Vé đã hủy" |
| Tài khoản SPEAKER → không bấm được nút ghi; gửi request vẫn 403 | đạt | Tab "Bán vé" disabled, tab Check-in ẩn, "+ Tạo event" disabled kèm tooltip "Bạn cần quyền tạo event.", banner "Bạn chỉ có quyền xem…"; deep link `?tab=sell` bị đá về tab Sự kiện, link "Bán vé" trong bảng cũng ẩn |
| Không có request nào tới `PATCH /api/events/...` hay `PATCH /api/ticket-types/...` | đạt | grep `src/features` không còn lời gọi PATCH/PUT nào; Network log trong suốt lượt test chỉ có các endpoint catalog |
| Ghi kết quả vào báo cáo | đạt | file này |

Đã chạy thêm ngoài checklist: check-in mã thuộc event khác ("Lưu ý: mã này thuộc event Đêm nhạc Thứ Bảy, khác event đang chọn." — lấy từ `event_id`/`event_title` trong response), vé `VOIDED` của event đã hủy → banner cam + bảng 4 dòng VOIDED, ô mã gửi hai lần trong 800 ms bị chặn client-side, `?limit=50&offset=` + "Xem tiếp" (chưa có >50 vé để bấm thật).

Ghi chú lệch tài liệu:
- 05 §3.1 nói lọc `status` qua `?status=`; bản code lấy **toàn bộ** event của org một lần rồi lọc client-side, vì Tab 2 và Tab 3 cần nhìn thấy cả event `DRAFT`/`CANCELLED` từ cùng một nguồn. URL vẫn ghi `?tab=events&status=` như tài liệu.
- 05 §5.1: nhãn "Miễn phí" trong bảng được đổi thành "không qua thanh toán" để khỏi lặp lại đúng chữ "Miễn phí" mà `formatMoney` đã in ra; tooltip vẫn là câu đầy đủ.
- `PATCH /api/ticket-types/{id}` (05 §4.3) tồn tại trong catalog nhưng không màn hình nào gọi — demo muốn đổi giá/capacity thì tạo loại vé mới.

Redesign 02/11: tiêu đề trang đổi thành "Bàn tổ chức" kèm sub nêu tên org đang chọn; header CTA "Bán vé" trỏ thẳng `/organizer?tab=sell` (một click từ mọi trang tới bàn bán). Deep link `?tab=sell` vẫn bị đá về tab `events` khi role không có `event.update` — đã test lại với `speaker@luma.dev` trước redesign, hành vi không đổi.
