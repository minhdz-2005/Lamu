# Báo cáo test tay — 01 Đăng nhập & đăng ký

Test trên `npm run dev` + mock gateway (`src/app/api/[...path]/route.ts`), Chrome ngày 02/11/2026. Tài khoản seed: `demo@luma.dev`, `khach@luma.dev`, `speaker@luma.dev` (mật khẩu `password123`).

| Checklist mục | Kết quả | Ghi chú |
|---|---|---|
| Đăng ký email mới → tự login → header hiện `display_name` → về `/events` | đạt | `khachmoi@luma.dev` → header "Khách mới", `/events` |
| Đăng ký email đã tồn tại → lỗi dưới ô email + tự chuyển tab Đăng nhập | đạt | `DEMO@luma.dev` → "Email này đã có tài khoản.", tab `Đăng nhập` active, email giữ nguyên trong ô |
| Đăng nhập sai mật khẩu 2 lần → cùng một câu lỗi, không lộ email nào có tài khoản | đạt | cả hai lần "Email hoặc mật khẩu không đúng." + focus ô mật khẩu; khác nhau chỉ ở `request_id` |
| Chưa login bấm "Giữ chỗ" → `/auth?next=/events/<slug>` → login xong quay lại, cart còn | đạt | qty `Early bird` = 1 sống qua lượt đăng nhập (`sessionStorage.luma.cart.<slug>`) |
| Xóa `luma.access`, giữ `luma.refresh` → request kế tiếp vẫn chạy | đạt | `/me/tickets` tự refresh ngầm, không redirect, vẫn render vé |
| Xóa cả hai token → redirect `/auth`, không lặp vô hạn | đạt | `/me/tickets` → `/auth?next=/me/tickets`, dừng ở form |
| `next=http://evil.com` → bỏ qua, về `/events` | đạt | login xong URL là `/events` |
| Tắt Gateway rồi bấm Đăng nhập → banner network fail + Thử lại | chưa test | mock gateway chạy trong cùng process Next, không tắt riêng được. Copy `NEXT_PUBLIC_API_BASE` trỏ cổng chết mới test được |
| Tab đang submit không đổi được tab, không gửi request thứ hai | chưa test | cơ chế `submitting` đã chặn trong code, chưa bắt được vì request mock trả lời < 100 ms |

Redesign 02/11: thẻ seed ở cuối form điền cả email + `password123` bằng một click (đã test: "Khách · khach@luma.dev" → submit → `/events`); trang giới thiệu phát `/auth?email=<seed>&next=<route>` nên form mở sẵn email và focus ô mật khẩu.
