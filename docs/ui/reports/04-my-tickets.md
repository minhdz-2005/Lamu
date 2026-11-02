# Báo cáo test tay — 04 Vé của tôi

Test trên `npm run dev` + mock gateway, ngày 02/11/2026.

| Checklist mục | Kết quả | Ghi chú |
|---|---|---|
| User có 2 vé (1 free, 1 paid) → đủ 2 card, mã đọc được cỡ ≥ 24px | đạt | `.ticket-code` `font-size: 24px`, 7 card khi user đã mua nhiều lượt |
| Bấm sao chép trên http local → fallback, không lỗi console | đạt (fallback) | `navigator.clipboard` bị chặn vì tab automation không có focus → toast "Trình duyệt chặn sao chép — bôi đen mã và nhấn Ctrl+C." Mã vẫn chọn được bằng `user-select: all` + double-click |
| Bấm In → bản in chỉ có card đó, mã còn nguyên | chưa test | `.print-area` + `@media print` đã bật theo từng card nhưng không đọc được bản in từ automation; cần bấm Ctrl+P tay trước buổi bảo vệ |
| Event bị cancel → card đỏ "Sự kiện đã hủy" + dòng hoàn tiền, vé `VOIDED` đúng nhãn | đạt một phần | sau cancel, mock void luôn nên card hiện "Vé đã hủy" (nhãn `VOIDED`, đúng 04 §4). Nhãn `ISSUED` + `event_status = CANCELLED` ("Bạn sẽ được hoàn tiền tự động.") chỉ tồn tại transient giữa `EventCancelled` và saga — không bắt được bằng mock |
| Check-in xong → "Tải lại" thấy nhãn "Đã check-in" + giờ vào | đạt | "Đã check-in" + "đã vào lúc 00:51 · 02/11/2026" |
| User mới đăng ký, chưa có vé → Empty dẫn về `/events` | đạt | "Bạn chưa có vé nào." + nút "Xem sự kiện đang mở bán" |
| Bộ lọc 4 nhóm vé hoạt động, đếm số vé từng nhóm | đạt | 02/11 redesign: dropdown `Select` đổi thành hàng chip một chạm, nhãn kèm số đếm "Tất cả (2) / Sắp diễn ra (1) / Đã check-in (0) / Đã hủy (0)" |
| Xóa token rồi vào thẳng `/me/tickets` → `/auth?next=/me/tickets` → login xong quay lại | đạt | kiểm cả trường hợp xóa mỗi `luma.access` (tự refresh ngầm) và xóa cả hai token (redirect) |
| Không phát sinh request nào ngoài hai endpoint §2 | đạt | chỉ `GET /api/users/me/tickets` (+ `POST /api/auth/refresh` khi token hết hạn) |

Lệch wireframe 04: bản vẽ có dòng địa điểm trong card, nhưng `GET /api/users/me/tickets` không trả field venue nào (catalog §Registration). Thà thiếu dòng đó còn hơn suy diễn — card hiện `event_title`, `event_starts_at`, `ticket_type_name`, `code`, `checked_in_at`, `event_status`, `event_slug` là đủ các field contract. Sắp xếp: sự kiện đã qua xuống cuối, vé mới nhất trước (client-side, vì API không guarantee thứ tự).

Redesign 02/11 (design system §13): nền sáng/nền tối qua `luma.theme`, thẻ vé có dải gradient trên đỉnh và ô mã hover được; bản in vẫn ép về nền sáng nên đổi theme không làm vé in ra đen.
