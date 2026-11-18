GATE: FAIL 24 (round 1 of 3)

# Báo cáo cải thiện giao diện xác thực Lamu

Ngày thực hiện: 16/11/2026 (Asia/Saigon).

## Phạm vi và hiện trạng

- Chỉ chỉnh giao diện đăng nhập, đăng ký, quên mật khẩu trong feature frontend auth; báo cáo này là file duy nhất ghi trong identity service.
- Frontend: Next.js 16.4.3 / React 19, App Router, CSS thuần. Đã đọc frontend/AGENTS.md, README liên quan, quy ước UI và hướng dẫn CSS của Next.js cài tại repository.
- Identity service thực tế: services/identity-service. Không sửa backend, API proxy, hợp đồng HTTP, môi trường hoặc bí mật.
- Route wrapper: frontend/src/app/auth/page.tsx. Đăng nhập/đăng ký là hai tab của AuthPage, quên mật khẩu mở bằng nút hoặc /auth?mode=recovery. Không bổ sung route hoặc thay đổi semantics query.
- Trước khi sửa đã mở trang chủ và cả ba màn hình bằng Chrome. Frontend dev đã chạy sẵn tại localhost:3000; dùng server đó, chạy thêm production build tại 127.0.0.1:3100 để đo hiệu năng.
- Repository có sẵn nhiều thay đổi tích hợp auth khi bắt đầu. Những thay đổi đó được giữ nguyên. RecoveryForm.tsx đã là file untracked từ trước lượt này.

## Hướng thiết kế và kế thừa trang chủ

Kind: software; màn hình tác vụ xác thực của nền tảng cộng đồng và sự kiện Lamu. Hành động chính: đăng nhập, tạo tài khoản, gửi/xác nhận mã, đổi mật khẩu tùy bước.

Kế thừa bảng màu thực tế từ LandingPage.tsx và globals.css: nền trắng/ấm, chữ than, sage #49735e, cam mật ong #e9a45b; dark mode tương ứng. DM Sans cho biểu mẫu, DM Serif Display nghiêng cho phần nhận diện; giữ SVG logo Lamu hiện có. Dùng nút chính dạng pill, input 12px, card 18–22px, viền nhẹ, khoảng cách theo nhịp 4/8px.

Desktop có phần giới thiệu ngắn và hình thức lời hẹn ở cạnh form; từ 900px trở xuống chỉ giữ cột biểu mẫu. Thứ tự đọc và Tab tập trung vào thao tác. Form đủ chiều cao nội dung và cho cuộn trên điện thoại, không ép mọi trạng thái vào một màn hình.

Voice card: tiếng Việt trực tiếp, thân thiện, lời gọi thao tác rõ; giữ nguyên thông tin bảo mật và kết quả chưa xác định từ luồng có sẵn.

Không deal lại palette/font, không thêm shader, WebGL, ảnh stock, moment cuộn hay kit toàn cục: yêu cầu kế thừa thương hiệu và form gọn của người dùng được ưu tiên. Không thêm dependency, tên thương hiệu, số liệu, lời chứng thực hoặc sự thật giả định; không có ảnh thay thế hoặc client asset slot mới.

## Thay đổi từng màn hình

### Đăng nhập

- Canh trái tiêu đề, mô tả, tab và label; tăng khoảng cách trường nhập, độ dễ đọc và đường viền focus.
- Nút chính ghi rõ “Đăng nhập”, có mũi tên và phản hồi hover/press. Khi gửi, hiển thị spinner và “Đang xử lý…” với vùng thông báo polite; giữ nguyên disabled, aria-busy và readOnly theo trạng thái có sẵn.
- Giữ reveal mật khẩu, nút quên mật khẩu, lỗi theo từng trường, lỗi xác thực, request ID, retry/session và chuyển hướng hiện có.

### Đăng ký

- Đồng nhất form với đăng nhập, giữ trường tên hiển thị và autocomplete hiện có.
- Nút chính “Tạo tài khoản”; khi tài khoản đã tạo nhưng login chưa thành công, nút trở thành “Đăng nhập”, đúng với nhánh chỉ thử login đang có.
- Giữ validation, thông báo tài khoản đã tạo và xử lý EMAIL_TAKEN/API hiện có.

### Quên mật khẩu

- Thay heading phụ trùng ý bằng danh sách ba bước Email → Mã xác nhận → Mật khẩu mới, aria-current theo state hiện có.
- Áp dụng cùng input, focus, nút, loading, notice lỗi/cảnh báo/thành công cho toàn bộ bước.
- Giữ nguyên cooldown, gửi lại mã, thay email, xác minh mã, token expiry, xác nhận mật khẩu, session clearing và nội dung tránh tiết lộ email tồn tại.

### Responsive và khả năng truy cập

- Form một cột trên tablet/mobile, input 16px, nút chính toàn chiều ngang; vùng bấm auth/header tối thiểu 44px qua kiểm tra hình học trình duyệt (dung sai số lẻ 0.5px).
- Label liên kết với input; lỗi đăng nhập/đăng ký giữ aria-invalid, aria-describedby, role alert. Notice giữ role status/alert có sẵn.
- Kiểm tra phím Tab, Arrow/Home cho tab, focus trường lỗi đầu tiên, reveal mật khẩu và skip link.
- Entrance 360ms một lần trên card; hover/press nhẹ; prefers-reduced-motion tắt animation/transition và dịch chuyển nút trong form.
- Màu chữ muted được tăng tương phản so với bản auth trước. Đã xem ảnh cả theme sáng/tối; chưa chạy một audit WCAG đầy đủ hoặc kiểm tra screen reader thực tế.

## File thay đổi trong lượt này

| File | Thay đổi |
| --- | --- |
| frontend/src/features/auth/AuthPage.tsx | Bố cục, phần nhận diện, CTA, loading và liên kết trang chủ; tách style |
| frontend/src/features/auth/auth.css | File mới; mọi selector phần trình bày được giới hạn dưới .lamu-auth-page |
| frontend/src/features/auth/AuthHeader.tsx | Canh lề cùng nội dung, vùng bấm link và theme toggle tối thiểu 44px; format |
| frontend/src/features/auth/RecoveryForm.tsx | Chỉ phần render: chỉ dẫn bước và loading; format |
| services/identity-service/report/AUTH_UI_REPORT.md | Báo cáo này |

Không thay đổi AuthControls, content, validation, recoveryState, authApi hoặc các file lib trong lượt này.

## Kết quả kiểm tra thực tế

| Kiểm tra | Kết quả |
| --- | --- |
| npm run typecheck (frontend) | PASS |
| npm test (frontend, chạy lại sau sửa cuối) | PASS: 22/22, không skip |
| npm run build (frontend, sau sửa cuối) | PASS: compile, TypeScript, prerender và route manifest |
| Chrome/Playwright, 3 màn hình × 6 viewport × 2 theme | PASS: 36 ca, không tràn ngang, không input thiếu label, không control dưới ngưỡng vùng bấm; 0 pageerror |
| Kích thước đã kiểm tra | 1440×900, 1024×768, 820×1180, 768×1024, 390×844, 320×740 |
| Validation và keyboard | PASS: lỗi email/password/tên, focus email đầu tiên, điều hướng tab Arrow/Home, Tab tới skip link, hiện/ẩn mật khẩu, reduced motion |
| Gửi form bằng response fixtures trong browser | PASS: loading/readOnly/disabled/aria-busy, 401, 429/cooldown, register-created notice, profile-verified login redirect |
| Recovery bằng response fixtures trong browser | PASS: email sai, mã sai định dạng, gửi mã, cooldown gửi lại, verify mã, hai mật khẩu không khớp, reset thành công, quay lại login |
| Điều hướng | PASS: tab login/register, quên mật khẩu, trở lại login, về trang chủ; next=/events được sanitize về /me theo logic cũ |
| Skill copy-lint trên rendered HTML của /auth | 0 FAIL, 0 WARN (80 words) |
| Skill gate trên dev /auth | FAIL 24, 7 WARN; xem phân tích dưới; không tuyên bố gate PASS |
| Skill layout/check riêng trên production, yêu cầu 5 kích thước | Chỉ hoàn thành 1440×900: overflowX=false, FAIL container “no .wrap”; sau đó script lỗi Cannot read properties of undefined (reading 'map'). Không có kết quả skill layout cho 4 kích thước còn lại |
| Skill perf trên production /auth, 1440 và 390, 3 lần đo/kích thước | 0 FAIL, 4 WARN; CLS 0.000 cả hai, không broken request, không WebGL |
| git diff --check trong auth | PASS |
| So sánh AST phần ngoài render | AuthPage và RecoveryForm không thay đổi logic |
| Diff ngoài frontend/src/features/auth so với baseline đầu lượt | Giữ nguyên toàn bộ tracked diff đã có |
| SHA-256 của trang chủ, globals.css, layout.tsx, Header.tsx và MainArea.tsx | Không đổi |

Các ca trạng thái dùng Playwright route.fulfill, đi qua UI và code transport hiện có nhưng không gọi Identity thật. Không tạo tài khoản, gửi email thật hoặc đổi mật khẩu thật. Các fixtures và screenshot nằm trong thư mục tạm của phiên, không thêm test/dependency hay fixture runtime vào source.

Hiệu năng production: transfer 304.5 KiB ở 1440, 268.4 KiB ở 390; JS parsed 559.9 KiB, gzip JS 175.1 KiB. WARN gồm lượng JS và SVG logo có natural size lớn hơn kích thước hiển thị, mỗi mục ở hai viewport. Số đo là headless CPU local, không đại diện field performance. Lần đo dev ban đầu FAIL lượng JS 3893.4 KiB; kết quả production được dùng để đánh giá bản build. Đo production diễn ra trước thay đổi cuối chỉ về aria-live và format; chưa đo lại đúng build cuối.

## Gate và giới hạn áp dụng skill

Dòng GATE ở đầu báo cáo là kết quả script thực tế. Lần gọi lại dùng cache URL và vẫn trả cùng 24 FAIL, không chạy fresh trên markup cuối. Không tạo waiver, không sửa kit hoặc ẩn nội dung để vượt checker. Không ép các quy tắc landing page trái phạm vi form xác thực; đây không phải nghiệm thu toàn bộ gate của skill.

Danh sách toàn bộ nhóm FAIL đang mở (tổng 24):

- hero-fill: 1
- flush: 1
- button-styles: 2
- same-action: 1
- cta: 2
- copy-headline: 1
- copy-fact: 1
- focus-ring: 1
- focus-visible: 2
- action-repeat: 1
- moment-none: 1
- section-height: 1
- one-section: 1
- container-edges: 6
- no-visual: 1
- container: 1

- hero-fill, flush, cta, copy-headline, copy-fact, moment-none, section-height, one-section, no-visual, container và phần lớn container-edges yêu cầu cấu trúc marketing theo .wrap/hero/section toàn màn hình hoặc hình ảnh/moment. Không áp dụng nguyên mẫu này cho tác vụ auth gọn. Không thêm claim/số liệu để vượt copy-fact.
- button-styles, same-action và action-repeat đếm chung nav hiện có, tab đổi mode và nút submit; giữ các vai trò/hành vi khác nhau của form. Không thay header chung hoặc điều hướng khác.
- focus-ring trỏ tới .home-search input:focus trong stylesheet chung: ngoài phạm vi sửa. Auth input có outline riêng. Một focus-visible thuộc nextjs-portal/devtools; mục còn lại thuộc skip link chung. Test trình duyệt xác nhận Tab tới skip link và focus input, nhưng không coi đó là đã chứng minh toàn bộ các cảnh báo focus của gate sai.
- container-edges còn phản ánh lưới marketing của checker. Đã canh lại padding header auth với phần nội dung sau lần gate đầu; kết quả cache chưa phản ánh thay đổi này.
- 7 WARN consistency đã được giữ: copy-buttons, copy-actions, section-gaps, skip-link và share-meta (một số ID xuất hiện ở nhiều viewport). Không sửa metadata/layout chung. copy-lint riêng không có WARN.

## Chưa xác minh và vấn đề còn tồn tại

- Chưa chạy E2E thật Next → Gateway → Identity → PostgreSQL/Mailpit; chưa xác nhận gửi/nhận email, OTP thật, revocation hoặc thao tác tài khoản thật.
- Chưa kiểm tra Safari, Firefox, thiết bị cảm ứng thật, trình đọc màn hình, autofill/password manager thực tế hoặc audit WCAG đầy đủ.
- Skill gate chưa PASS; layout script riêng lỗi giữa chừng như ghi ở trên. Các kiểm tra responsive độc lập bằng browser đạt không thay thế kết quả skill bị thiếu.
- Query mode/register, next allowlist và recovery quay lại không sửa URL được giữ theo thiết kế hiện có; không thay routing để phục vụ UI.
- Không cung cấp ảnh mới, domain/canonical mới, địa chỉ liên hệ hoặc dữ liệu giả định; các mục này không thuộc lượt cải thiện form auth.

## Bằng chứng tạm

Trong phiên này, thư mục OS temp lamu-auth-ui chứa render-results.json (36 ca), browser-results.json (kiểm tra trạng thái), screenshot sáng/tối, trạng thái lỗi/thành công, perf.json (dev), perf-production.json và skill-artifacts (gate/checker gốc). Đây là artifact tạm, không cam kết lưu lâu dài. Báo cáo này lưu kết quả trong repository.

## Bổ sung: sửa font tiếng Việt trong chữ nghiêng (16/11/2026)

- Người dùng phát hiện chữ “điều” bị lệch font. Chrome CSS.getPlatformFontsForNode xác nhận dòng dùng lẫn DM Serif Display, Georgia và Times New Roman.
- Chuyển hai đoạn serif nghiêng trong auth sang family riêng `Lamu Auth Serif`, dùng Noto Serif italic 400 lưu cục bộ, với subset Latin và Vietnamese (tổng 21.4 KB). Giữ màu, nội dung, layout và logic; không sửa font trang chủ hoặc layout chung.
- File bổ sung: `frontend/public/auth/fonts/noto-serif-italic-latin.woff2`, `noto-serif-italic-vietnamese.woff2` và giấy phép `OFL.txt` trong cùng thư mục. Nguồn font: Google Fonts; giấy phép SIL Open Font License từ repository google/fonts, thư mục ofl/notoserif.
- File sửa: `frontend/src/features/auth/auth.css` và báo cáo này.
- Đã kiểm tra Chrome: toàn bộ glyph của cả hai đoạn nghiêng đều thuộc Noto Serif, không còn trộn font; đã xem screenshot dòng “Một điều đáng nhớ.”.
- Không tràn ngang tại 1440, 1024, 768, 390 và 320px. Font auth vẫn tải thành công khi chặn cả fonts.googleapis.com và fonts.gstatic.com.
- `npm run build`: PASS, gồm TypeScript và prerender. `git diff --check` cho CSS: PASS. Không chạy lại toàn bộ gate/perf hoặc bộ 36 ca ở lần sửa font nhỏ này.
