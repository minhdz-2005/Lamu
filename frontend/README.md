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
# NEXT_PUBLIC_AUTH_MODE=real
# IDENTITY_GATEWAY_URL=http://127.0.0.1:8080
```

`NEXT_PUBLIC_AUTH_MODE` là build-time: restart dev hoặc rebuild/start production và reload mọi tab sau khi đổi. Các endpoint auth, Profile và các endpoint tổ chức/lời mời được allowlist đi qua `/api/identity/...` → Gateway `/api/...` → Identity. Upstream là origin server-only cố định, không có `/api` ở cuối. Event, vé và thanh toán vẫn dùng `/api` mock. JWT thật chỉ gắn vào API Identity. `NEXT_PUBLIC_API_BASE_URL` cũ không còn dùng.

Canonical HTTP [Identity v1.5.0](../shared/contracts/http/identity.openapi.json) sinh consumer types và Gateway projection. Web Locks bắt buộc cho writer phiên real (browser mới, HTTPS hoặc localhost); chờ lock tối đa 15s. Một record localStorage `lamu.session.v2.real|mock` chứa generation, cặp token và cache. Không nhập token legacy `luma.access/refresh/profile`; không copy giữa mode. localStorage vẫn có rủi ro XSS theo quyết định được chấp nhận; reset token chỉ ở memory.

Bootstrap chỉ authenticated sau `/users/me` được xác minh. Profile lỗi tạm thời có nút tải lại phiên/đăng nhập lại tại auth. Default `/me` vẫn là Account preview ngoài phạm vi; không dùng fixture ở đó để xác nhận tài khoản thật. Logout thực ở header các trang có session, ví dụ `/events`.

Recovery tại `/auth?mode=recovery`, dùng được cả khi đang đăng nhập. Reload mất reset token và quay về bước email. UI không suy email tồn tại/thư đã đến từ 202. Cooldown mẫu 60s phải đồng bộ Identity; OTP expiry/attempt còn lại không được API công bố. Reset thành công xóa session local hiện hành xuyên tab (kể cả đang đăng nhập tài khoản khác), yêu cầu login lại; backend thu hồi mọi phiên của tài khoản được reset.

Local topology Next → Gateway loopback: giữ `GATEWAY_TRUSTED_PROXY_CIDRS` trống. Next loại cookie/context/XFF/client-IP do browser gửi; Gateway lấy socket IP của Next, nên budget IP được gộp tại proxy. Cần thiết kế edge/trust thật trước rollout nhiều người; không bật CORS hoặc tin XFF tùy ý.

Release: readiness DB/Identity/Gateway/mail → transport allowlist → session/coordinator → UI → build real và nghiệm thu. Khi readiness/routing/rotation sai, dừng real và rebuild mock; reload mọi tab. Xóa namespace real nếu muốn bỏ phiên local; không đưa token sang namespace mock. Code/config rollback không hoàn tác password đã đổi, token rotation hoặc session đã revoke.

Kiểm chứng local: `npm test` trong frontend; từ repo root chạy `node scripts/frontend-auth-rollback.cjs` (build mock → browser demo với Gateway down → khôi phục build real). E2E thật: build frontend với `NEXT_PUBLIC_AUTH_MODE=real`, sau đó `node scripts/test-db.cjs --migrate --seed --security --runTestsByPath tests/frontend-auth-browser.spec.ts`. Runner tạo DB/Mailpit riêng và xóa đúng container đó; không dùng DB shared hay SMTP ngoài. Cần Chrome local và dependency root/frontend đã cài. [Báo cáo triển khai](../services/identity-service/report/REPORT_FRONTEND_AUTH_INTEGRATION_01.md) phân biệt test thật và fault fixtures.

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

Đăng nhập demo: nhập một tài khoản trong bảng seed ở trên; không dùng credential demo cho mode real.


## Bốn trang Identity local

Build với `NEXT_PUBLIC_AUTH_MODE=real` và cấu hình `IDENTITY_GATEWAY_URL` cho Next server. Các route `/me`, `/organizations`, `/organizations/<uuid>` và `/me/invitations` dùng Profile và API Identity qua Next → Gateway. Form tạo tổ chức chỉ gửi tên. OWNER mở tab Lời mời đã gửi để xem và thu hồi lời mời đã lưu. Giới hạn thao tác ORG áp dụng cho tạo lời mời, thay vai trò và chấp nhận lời mời mới từ UI.

Preview của các trang này cần query rõ ràng trong development. Kiểm browser trên production build dùng `node scripts/test-db.cjs --migrate --seed --security --runTestsByPath tests/frontend-auth-browser.spec.ts` từ repo root. Runner tạo PostgreSQL/Mailpit riêng.
