# Báo cáo test tay — 02 Tìm sự kiện

Test trên `npm run dev` + mock gateway, ngày 02/11/2026. Seed khởi động chỉ có 3 event công khai (2 PUBLISHED + 1 CANCELLED, DRAFT bị ẩn) nên vài mục phân trang đánh dấu "chưa test". Con số dưới đây lấy từ store vừa restart — mock sống trong RAM, tạo thêm event bằng tay sẽ làm đổi số card.

| Checklist mục | Kết quả | Ghi chú |
|---|---|---|
| `/events` không tham số → list mặc định, đếm khớp `total` | đạt | "Kết quả: 3 sự kiện", 3 card, `total = 3`; DRAFT không xuất hiện |
| Gõ `q=` → sau 300 ms một request, URL thành `/events?q=` | đạt | `q=summit` → 1 card, URL `/events?q=summit` |
| Bấm Lùi trình duyệt → về bộ lọc và trang cũ | chưa test | URL là nguồn state (`router.replace`) nên lùi đúng lý thuyết, chưa đi tay |
| Đổi `pageSize` 50 → `offset` trang 2 = 50, không nhân đôi card | chưa test | seed < 20 nên `Pager` chưa hiện (`total <= pageSize`) |
| Lọc không có kết quả → Empty + "Xóa bộ lọc" chạy đúng | đạt | `?q=zzz` → "Chưa tìm thấy sự kiện nào khớp bộ lọc."; bấm nút → `q` rỗng, URL `/events`, 3 card |
| Chip lọc ngày một chạm → `?from=` đúng, không cần mở ô date | đạt | redesign 02/11: "Mọi ngày" (bỏ `from`), "Từ hôm nay" (`from=hôm nay`), "Sau 7 ngày" (`from=+7 ngày`); chip đang chọn sáng nền, URL và kết quả đổi ngay một click |
| Tắt service → ErrorState + Thử lại | chưa test | mock cùng process; nhánh lỗi 5xx/network đã code-review, cần Gateway thật |
| Gõ nhanh 5 ký tự → chỉ response mới nhất render | đạt (một phần) | có `requestSeq` chặn response cũ; chưa đo được vì mock trả lời < 100 ms |
| 37 event → "Trang 1 / 2", trang 2 có 17 card | chưa test | seed 3 event, cần seed lớn hơn hoặc tạo thêm event qua trang 05 |
| Không card nào gọi `/public/events/{slug}/details` | đạt | Network chỉ có `GET /api/public/events?...` |

Ghi chú hiển thị: card chỉ dùng 4 field API list trả (`title`, `starts_at`, `slug`, `organization_slug`); event CANCELLED vẫn hiện trong list vì catalog `GET /public/events` không chốt bộ lọc trạng thái — trạng thái thật do trang 03 quyết định (02 §6).

Redesign 02/11: card thêm dải accent trên đỉnh và dòng "Xem chi tiết →" (chỉ là CTA, không phải field mới); nút submit đổi nhãn "Lọc" → "Áp dụng" và nút "Xóa bộ lọc" chỉ hiện khi đang có bộ lọc.
