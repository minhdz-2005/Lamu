# 04. Vé của tôi

**Route:** `/me/tickets` · **Cần đăng nhập:** Bắt buộc · **Ưu tiên:** 4 · **API:** `GET /api/users/me`, `GET /api/users/me/tickets`

Mục tiêu: khách thấy vé mình đã có, đọc được `code` để đưa cho ban tổ chức check-in, và biết vé nào còn hiệu lực.

## 1. Layout

```text
+------------------------------------------------+
| Vé của tôi            [Lọc: Tất cả ▾] [Tải lại] |
+------------------------------------------------+
|  +---- TicketCard (max-width 520px, 1 cột) ----+ |
|  |  TECH CONF 2026                    [Còn hiệu lực] |
|  |  14:30 · 01/12/2026 (GMT+7) · Nhà A          | |
|  |  Loại vé: Early                               | |
|  |  +----------- CODE KHỔ LỚN ----------------+  ||
|  |  |  LUMA-7F3A-91C4        [sao chép]       |  ||
|  |  +------------------------------------------+ ||
|  |  [In vé]   [Xem sự kiện]                      | |
|  +------------------------------------------------+ |
|  +---- TicketCard -------------------------------+ |
|  |  VUI FEST                        [Đã check-in] | |
|  |  đã vào lúc 18:04 · 12/12/2026                 | |
|  +------------------------------------------------+ |
+------------------------------------------------+
```

| Component | Props | Ghi chú |
|---|---|---|
| `MyTicketsPage` | — | sở hữu `tickets`, `filter`, `loading` |
| `TicketFilter` | `value`, `onChange` | `ALL` / `UPCOMING` / `USED` / `VOIDED` |
| `TicketCard` | `ticket`, `onPrint`, `onCopy` | một vé = một card; **không** gộp hai vé cùng event thành một card |
| `TicketCode` | `code` | font monospace, ≥ 24px, select-to-copy + nút sao chép |
| `StatusBadge` | `status`, `event_status` | xem bảng §3 |

## 2. Lấy dữ liệu

```text
GET /api/users/me            -> {id, email, display_name, memberships[]}
GET /api/users/me/tickets    -> [{ticket_id, code, event_id, event_title, event_slug,
                                  event_starts_at, event_status, ticket_type_name,
                                  status, checked_in_at}]
```

| Luật | Chi tiết |
|---|---|
| Sắp xếp | `event_starts_at` tăng dần, vé event đã qua xếp cuối |
| Phân trang | API không phân trang ở MUST → render toàn bộ; cảnh báo dev nếu `length > 200` |
| Cache | Không cache quá 30 giây; refetch khi route focus lại |
| `event_*` | luôn lấy từ payload ticket (Registration chiếu từ `event_snapshot`), **không** gọi `GET /api/public/events/{slug}` cho từng vé |
| Link "Xem sự kiện" | `/events/{event_slug}`; nếu `event_status = CANCELLED` vẫn cho bấm (trang 03 hiện banner hủy) |

## 3. Badge trạng thái

`status` của vé và `event_status` của event quyết định nhãn; hai thông tin phải hiển thị đồng thời vì một vé `ISSUED` trong event `CANCELLED` thực chất đã vô hiệu.

| `ticket.status` | `event_status` | Nhãn | Màu | Ghi chú thêm |
|---|---|---|---|---|
| `ISSUED` | `PUBLISHED` | Còn hiệu lực | xanh lá | mặc định |
| `ISSUED` | `CANCELLED` | Sự kiện đã hủy | đỏ | dòng phụ "Bạn sẽ được hoàn tiền tự động." (quyết định 7) |
| `USED` | bất kỳ | Đã check-in | xám | hiện `checked_in_at` định dạng 00 §6 |
| `VOIDED` | bất kỳ | Vé đã hủy | xám đậm | không nút "Xem sự kiện" nổi bật, vẫn cho vào |
| khác (giá trị lạ) | — | Trạng thái: `<raw>` | xám | không crash — để lộ dữ liệu seed sai |

## 4. Tương tác

| Hành động | Cách làm |
|---|---|
| Sao chép mã | `navigator.clipboard.writeText(code)`; fail (http không secure) → fallback `select()` + instr "bôi đen và Ctrl+C". Toast "Đã chép mã vé." |
| In vé | `window.print()` với print stylesheet chỉ giữ `.TicketCard` đang bấm (không cần API). Không sinh PDF phía client |
| Xem sự kiện | link route `/events/{event_slug}` |
| Tải lại | refetch `GET /api/users/me/tickets`, giữ nguyên `filter` |
| Hủy vé | **Không có** — ở MUST khách không tự hủy vé đã confirm; hủy chỉ áp dụng reservation `HELD` (trang 03 §6). Không đặt nút này |

## 5. State màn hình

| State | Trigger | Nội dung |
|---|---|---|
| Loading | request đầu | 3 skeleton card |
| Empty | mảng rỗng | "Bạn chưa có vé nào." + nút "Xem sự kiện đang mở bán" → `/events` |
| Empty theo filter | dữ liệu có nhưng filter loại hết | "Không có vé nào ở nhóm này." + nút "Xem tất cả" |
| Error | 401/5xx/network | 401 → refresh theo 00 §2, fail thì `/auth?next=/me/tickets`; khác → ErrorState + Thử lại |
| Success | có vé | danh sách card |

## 6. Edge cases

| Case | Xử lý |
|---|---|
| `event_slug` null (snapshot chưa có do event tạo trước khi consumer chạy) | Card vẫn hiện, khu tên event thay bằng "Sự kiện {event_id 8 ký tự đầu}", ẩn link "Xem sự kiện", log `request_id` |
| Hai vé cùng event (mua 2 chỗ) | Hai card riêng, mỗi card một `code` — bàn check-in quét từng mã |
| `checked_in_at` có nhưng `status != USED` | Ưu tiên `status`; ghi chú QA vì seed có thể lệch |
| User mở 2 tab, check-in ở tab khác | Trang này không realtime (00 §7 cấm poll) → đối xử bằng cách bấm "Tải lại"; document rõ trong báo cáo demo |
| Vé của event đã qua (`event_starts_at < now`, `status = ISSUED`) | Badge "Chưa dùng" + dòng phụ "Sự kiện đã diễn ra"; vẫn cho in |
| Mất `display_name` (users/me fail nhưng tickets fail theo) | Header hiện "Khách", không chặn danh sách vé nếu API ticket vẫn 200 |

## 7. Checklist nghiệm thu

- [ ] Đăng nhập user có 2 vé (1 free, 1 paid) → thấy đủ 2 card, mã vé đọc được ở cỡ ≥ 24px.
- [ ] Bấm sao chép trên máy http local → fallback hoạt động, không lỗi console.
- [ ] Bấm In → bản in chỉ có card đó, mã vé còn nguyên.
- [ ] Event bị cancel (chạy saga) → card chuyển đỏ "Sự kiện đã hủy" + dòng hoàn tiền tự động, vé `VOIDED` hiển thị đúng nhãn.
- [ ] Check-in xong (bên organizer) → bấm "Tải lại" thấy nhãn "Đã check-in" + giờ vào.
- [ ] User mới đăng ký, chưa có vé → Empty dẫn về `/events`.
- [ ] Xóa token rồi vào thẳng `/me/tickets` → redirect `/auth?next=/me/tickets`, login xong quay lại đúng trang.
- [ ] Không phát sinh request nào tới Event/Registration service ngoài hai endpoint §2.
- [ ] Ghi kết quả test vào `docs/ui/reports/04-my-tickets.md`.
