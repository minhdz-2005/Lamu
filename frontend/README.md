# Frontend

Ứng dụng web cho khách tham dự và người tổ chức. Chỉ gọi API Gateway, không gọi trực tiếp các microservice.

`/` là **trang giới thiệu của Lamu** (hero, kiến trúc 5 service, hành trình 4 bước, tài khoản demo). Năm màn hình nghiệp vụ bắt đầu từ `/events`.

Mô tả từng màn hình, trường, trạng thái lỗi và checklist nghiệm thu nằm ở [docs/ui](../docs/ui/README.md). Đọc [quy ước chung](../docs/ui/00-conventions.md) trước khi code vì nó chốt cách lưu token, map mã lỗi, định dạng tiền và thời gian.

## Chạy

```bash
cd frontend
npm install
npm run dev          # http://localhost:3000
```

Mặc định UI gọi `/api` cùng origin, tức là **mock gateway** viết trong chính app (`src/app/api/[...path]/route.ts` + `src/mock/store.ts`). Mock dựng sẵn trong RAM: 3 tài khoản, 1 tổ chức, 4 event (3 công khai, 1 bản nháp ẩn), 5 loại vé kèm kho, và 2 vé đã bán cho chủ tọa — bật `npm run dev` là chạy được cả sáu trang mà chưa cần service nào. Restart server là seed quay về trạng thái gốc.

Tài khoản demo (mật khẩu `password123`):

| Email | Vai trò | Dùng để |
|---|---|---|
| `demo@luma.dev` | OWNER của Luma Studio | trang 05: tạo/publish/hủy event, thêm loại vé, check-in |
| `khach@luma.dev` | khách vãng lai | trang 03/04: giữ chỗ, vé, hoàn tiền khi event bị hủy |
| `speaker@luma.dev` | SPEAKER (chỉ `event.read`) | nhánh quyền: mọi nút ghi ẩn, tab Check-in không hiện |

## Nối Gateway thật

```bash
cp .env.example .env.local
# NEXT_PUBLIC_API_BASE_URL=http://localhost:8080/api
```

Có biến này thì `src/lib/apiClient.ts` mọi request sang Gateway; route handler mock vẫn tồn tại nhưng không được gọi vì UI không còn bắn `/api/...`. Không cần sửa code màn hình nào: catalog [docs/api/catalog.md](../docs/api/catalog.md) là hợp đồng duy nhất, mock chỉ là bản giả lập cùng shape.

## Knob demo

| Biến / tham số | Tác dụng |
|---|---|
| `NEXT_PUBLIC_MOCK_PAYMENT_DELAY_SECONDS` (5) | bao lâu thì mock quyết `payment_status`; đặt 15 để kịp bấm "Hủy giữ chỗ" trên màn hình 03 |
| `?degraded=availability,organization,event` trên `/events/<slug>` | bắt Gateway giả trả `degraded: true` cho từng nguồn, để demo nhánh "tắt một service" của 03 §7 |
| giá loại vé có phần lẻ `.99` (tạo qua API) | mock trả `PaymentFailed` → màn 03 hiện "Thanh toán thất bại, chỗ đã được giải phóng." |
| `HOLD_SECONDS = 120` trong `src/mock/store.ts` | hạn giữ chỗ; sửa tại chỗ nếu muốn countdown dài ra |

## Giao diện và theme

Toàn bộ màu, font, khoảng cách là token CSS trong `src/app/globals.css` (`:root` cho nền sáng, `:root[data-theme="dark"]` cho nền tối), theo §13 của [quy ước chung](../docs/ui/00-conventions.md).

| Thứ | Nằm ở | Ghi chú |
|---|---|---|
| Nền sáng / tối | nút mặt trời/mặt trăng trên header | chọn lần đầu theo hệ điều hành, lưu key `luma.theme`; script `THEME_BOOTSTRAP` (`src/lib/theme.ts`) chạy trước paint nên không nhấp nháy |
| Font | `<link>` Google Fonts trong `src/app/layout.tsx` | `Be Vietnam Pro` (body, đủ dấu tiếng Việt) + `Space Grotesk` (title). Không dùng `next/font` để build không cần mạng; mất mạng thì rơi về system font |
| Bảng màu | `--primary` indigo, `--secondary` teal, `--accent` coral | quy tắc 60-30-10: accent chỉ cho một CTA quan trọng nhất mỗi màn |
| Khoảng cách | `--s-1 … --s-11` | thang 4pt (4/8/12/16/24/32…), component không tự đặt số lẻ |
| Trang giới thiệu | `src/features/landing/LandingPage.tsx` | `src/app/page.tsx` render trực tiếp, `MainArea` bỏ container để hero chiếm toàn bề ngang |

## Kiểm tra trước khi commit

```bash
npm run typecheck    # tsc --noEmit
npm run build        # production build + route manifest
```

Kết quả test tay từng màn hình theo checklist nghiệm thu: [docs/ui/reports](../docs/ui/reports/README.md).

## Cấu trúc

```text
src/app/            route layer (App Router), mỗi trang chỉ là wrapper mỏng
src/features/       một thư mục mỗi màn hình: landing, auth, event-discovery, event-detail, my-tickets, organizer
src/components/     phần dùng chung cho >= 2 feature (Toast, Modal, Header, TicketCard, ui.tsx)
src/lib/            apiClient, auth token, format, errors, theme, useSession
src/mock/           store in-memory cho mock gateway
src/app/api/        mock gateway (route handler catch-all)
```

Style là class CSS thuần trong `src/app/globals.css` (không Tailwind): token định nghĩa một lần ở `:root`, component chỉ tham chiếu `var(...)`. Cách này giữ được neumorphism/glassmorphism, dark mode và micro-interaction mà không thêm build pipeline nào để giải thích với hội đồng.

Đăng nhập nhanh khi demo: form ở `/auth` có ba chip tài khoản seed, bấm một lần là điền đủ email + mật khẩu.
