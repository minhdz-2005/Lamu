# 01. Đăng ký và đăng nhập

Cập nhật triển khai 16/11/2026: ba luồng login/register/recovery đã nối Identity qua same-origin `/api/identity` khi build `NEXT_PUBLIC_AUTH_MODE=real`; canonical v1.4.1. Recovery là mode trong `/auth`, reset proof chỉ ở memory. Default `/me`, Account vẫn preview ngoài nghiệm thu. Các mô tả M4/NOT RUN bên dưới là lịch sử thiết kế; xem [báo cáo hiện tại](../../services/identity-service/report/REPORT_FRONTEND_AUTH_INTEGRATION_01.md) cho evidence thật và giới hạn.

**Route:** `/auth` · **Cần đăng nhập:** Không · **Ưu tiên:** 1 · **API:** `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/refresh`, `POST /api/auth/logout`, `GET /api/users/me`

Mục tiêu: user vào được hệ thống bằng email + password, và frontend giữ được phiên khi access token hết hạn. Một trang, hai tab, không route phụ.

Cập nhật thiết kế M4 Gateway/Identity: trang đích mặc định `/me`, không phụ thuộc Event. Authority là [Identity OpenAPI v1.2.0](../../shared/contracts/http/identity.openapi.json), schema RegisterRequest/LoginRequest/RefreshRequest/Tokens/Profile/LoggedOut; [00 §2 và §14](00-conventions.md) áp dụng session/trust boundary. **Đây là đặc tả, chưa triển khai chuyển đổi API; browser integration backend thật NOT RUN.** [Báo cáo01](reports/01-auth.md) giữ kết quả mock lịch sử; không suy thành PASS M4.

## 1. Layout

```text
+------------------------------------------------+
|  Lamu                               [logo, trái] |
+------------------------------------------------+
|                                                |
|   +---------------- FORM 480px ------------+  |
|   |  [ Đăng nhập ]  [ Đăng ký mới ]        |  |
|   |                                        |  |
|   |  Email                                 |  |
|   |  [__________________________]          |  |
|   |  Mật khẩu                                |  |
|   |  [__________________________]   [hiện/]  |  |
|   |                                          |  |
|   |  (tab Đăng ký thêm: Tên hiển thị)        |  |
|   |                                          |  |
|   |  [      Tiếp tục                  ]      |  |
|   |  Lỗi nhập liệu / lỗi kết nối nếu có     |  |
|   +------------------------------------------+  |
|   Ghi chú nhỏ: "Demo local — chưa có chức năng |
|   khôi phục mật khẩu qua email."              |
+------------------------------------------------+
```

Tab là state trong trang, không phải route riêng. Chuyển tab giữ nguyên giá trị email đã gõ.

| Component | Props | Ghi chú |
|---|---|---|
| `AuthPage` | — | sở hữu state `mode` (`login` hoặc `register`), `form`, `submitting`, `fieldErrors`, `apiError` |
| `AuthTabSwitch` | `mode`, `onChange` | hai button, `role="tablist"` |
| `Field` | `name`, `label`, `type`, `value`, `error`, `onChange` | dùng cho cả 3 input |
| `PasswordField` | như `Field` + `reveal` | mắt bấm đổi `type` |
| `SubmitButton` | `loading`, `disabled` | text "Tiếp tục" / "Đang kiểm tra..." |

## 2. Trường và validate

| Field | Tên gửi | Luật validate phía UI (trước khi gọi API) | Lỗi hiển thị |
|---|---|---|---|
| Email | `email` | trim/lowercase, email hợp lệ, tối đa254 ký tự | lỗi nhập email; “Email này đã có tài khoản.” nếu API EMAIL_TAKEN |
| Mật khẩu | `password` | 8–128 ký tự, không trim hoặc thay nội dung | “Mật khẩu cần từ 8 đến 128 ký tự.” |
| Tên hiển thị | `display_name` | chỉ register; trim, 1–100 ký tự | “Tên hiển thị cần từ 1 đến 100 ký tự.” |

Validate chạy khi blur từng field và khi submit. Submit chỉ gọi API khi không còn `fieldErrors`.

## 3. Hành vi theo API

### 3.1 Đăng nhập

```text
POST /api/auth/login  body {email, password}
200 -> {access_token, refresh_token, expires_in}
```

1. Nhận cặp token hiện hành và `expires_in=900`, đưa vào session coordinator theo00 §2. Access15 phút, refresh7 ngày tuyệt đối từ login; không giả token `at_...` hoặc dùng tài khoản mock làm seed backend.
2. Gọi `GET /api/users/me` để lấy profile/header; membership rỗng không chặn login. Nếu profile lỗi transport thì giữ trạng thái lỗi/tải lại ở `/me`, không tạo login mới chỉ vì lỗi profile.
3. Redirect sang `next` hợp lệ trong phạm vi Identity (`/me`, `/me/invitations`, `/organizations` và chi tiết org), mặc định `/me`. Dùng route allowlist cùng origin; từ chối URL external, `//host`, backslash, `/auth` và route business chưa tích hợp trong mode Identity. Không chỉ kiểm `startsWith('/')`.
4. Focus về main content, toast "Chào mừng lại, <display_name>".

Lỗi:

| Tình huống | API | UI |
|---|---|---|
| Sai email hoặc mật khẩu | `401 UNAUTHENTICATED` | Một câu chung "Email hoặc mật khẩu không đúng." — **không** tiết lộ email nào tồn tại; focus ô mật khẩu |
| Tài khoản bị khóa | `403 FORBIDDEN` | Banner "Tài khoản bị khóa. Liên hệ ban tổ chức demo." |
| Thiếu/sai field | `400 VALIDATION_FAILED` | Error canonical không có field_errors; chỉ map field khi UI biết chắc nguyên nhân, còn lại banner chung; không parse câu tiếng Anh để đoán field |
| Quá nhiều request | `429 RATE_LIMITED` | thông báo chờ; không auto-login/refresh/retry liên tục |
| Network/upstream/timeout | network/502/504 | banner giải thích lỗi kết nối hoặc hết thời gian chờ; giữ trạng thái phiên đã xác minh |

### 3.2 Đăng ký

```text
POST /api/auth/register  body {email, password, display_name}
200 -> {user_id}
```

Sau 200: **tự động gọi login** bằng đúng email/password vừa nhập (API register không trả token), rồi đối xử như §3.1. Không bắt user bấm lần hai. Nếu auto-login fail, hiện form login với thông báo "Tạo tài khoản xong, đăng nhập lại giúp bạn."

Lỗi `409 EMAIL_TAKEN` → báo đỏ dưới ô email, tự chuyển tab sang Đăng nhập và giữ email đã gõ (đây là đường user hay gặp nhất).

### 3.3 Refresh và logout

Refresh theo00 §2: body RefreshRequest,200 Tokens; rotation thay cả cặp, giữ sid và hạn tuyệt đối. Chỉ một request refresh đang chạy trong một coordinator; không auto-refresh đệ quy `/auth/*`.401 credential không dùng được → clear session/redirect route protected;403 khóa account là nhánh riêng; network/5xx/timeout không giả là credential sai. Nếu rotation đã commit nhưng mất response, không hứa refresh cũ còn dùng được.

Logout ở header dùng **Bearer access + refresh hiện hành thuộc cùng phiên**, không anonymous. Coordinator đánh dấu logging-out/ngăn tác vụ session mới, đợi refresh đang chạy với timeout hữu hạn rồi lấy cặp mới; access hết hạn thì refresh tối đa một lần, retry logout tối đa một lần. Không dùng cặp đã chụp trước rotation.

200 LoggedOut xác nhận server thu hồi refresh phiên hiện tại. Retry đúng cặp đã revoke khi refresh/access còn hạn có thể200; sai cặp hoặc refresh cũ401, không revoke phiên khác. Access đã cấp có thể còn hiệu lực đến exp tối đa15 phút; không gọi đây là logout-all hoặc thu hồi access tức thời.

Kết thúc logout luôn clear token/profile/cache/inflight local và về `/auth`, nhưng **chỉ báo server revoke confirmed khi nhận200 đúng contract**. Với401/network/5xx/timeout, hiện thông báo “Đã xóa phiên trên trình duyệt; chưa xác nhận được thu hồi phiên trên máy chủ.” qua thông báo một lần không chứa credential. Không giữ refresh để retry ngầm sau khi đã báo xóa local. Generation guard ngăn response login/refresh/profile cũ set session trở lại. Policy nhiều tab còn OPEN tại00 §14.

### 3.4 Phạm vi form

Không có chức năng Quên mật khẩu, đổi mật khẩu, xác minh email hoặc login nhanh bằng credential mock khi backend chưa hỗ trợ. UI có thể giải thích chưa có khôi phục mật khẩu nhưng không tạo nút hứa gửi email. Auth POST không cần Idempotency-Key; login retry sau mất response có thể tạo thêm session, không hứa idempotent.

## 4. State màn hình

| State | Khi nào | Nội dung |
|---|---|---|
| Form rỗng | lần đầu vào `/auth` | form chưa validate, nút "Tiếp tục" enabled nhưng submit sẽ chặn nếu thiếu |
| Submitting | đang gọi API | nút `disabled` + "Đang kiểm tra...", input `readonly`, không cho đổi tab |
| Field error | sau submit fail có `fieldErrors` | lỗi đỏ dưới field, `aria-describedby`, focus field đầu tiên |
| Api error | 401/403/409/5xx | banner tiếng Việt trên đầu form theo 00 §3 |
| Redirecting | 200 login | form mờ, nút "Đang mở..." tối đa 500 ms rồi chuyển route |
| Session checking | có credential/cache nhưng chưa xác minh | skeleton/checking hữu hạn; lỗi mạng có trạng thái lỗi riêng, không suy authenticated từ token tồn tại |
| Logging out | đang điều phối refresh/logout | disable hành động session mới, thông báo kết quả thu hồi đúng mức xác nhận |

## 5. Edge cases phải xử lý

| Case | Xử lý |
|---|---|
| Vào `/auth` khi phiên đã xác minh hợp lệ | Redirect next Identity hợp lệ hoặc `/me`; không chỉ nhìn localStorage rồi redirect |
| `next=/auth`, external, backslash hoặc route chưa tích hợp | Bỏ qua, về `/me` trong mode Identity |
| Gõ email có hoa `A@Gmail.COM` | Lowercase trước khi validate và trước khi gửi |
| Bấm Enter khi đang ở ô mật khẩu | Submit form (không nhảy tab) |
| Hai tab cùng mở, một tab logout | Không hứa request tiếp theo401 vì access còn sống; cần chốt phối hợp liên tab/refresh theo00 §14 trước nghiệm thu |
| API Gateway chưa lên (network fail, không có JSON error) | Banner “Không kết nối được máy chủ. Vui lòng thử lại.”; hướng dẫn vận hành ở README, không đưa Docker command vào flow người dùng |
| Thiếu access nhưng còn refresh | bootstrap một lần theo coordinator; kiểm đúng session generation trước setSession |
| Logout/đổi user khi auto-login hoặc profile đang chờ | bỏ kết quả cũ theo generation; không tự lưu token/profile sau cleanup |

## 6. Checklist nghiệm thu

- [ ] Đăng ký email mới → tự login → header hiện `display_name` → `/me`; empty membership hợp lệ.
- [ ] Đăng ký email đã tồn tại → lỗi dưới ô email + form tự chuyển sang tab Đăng nhập.
- [ ] Đăng nhập sai mật khẩu 2 lần → cùng một câu lỗi, không lộ email nào có tài khoản.
- [ ] Vào `/organizations/<uuid>` khi chưa login → auth có next → login xong quay lại đúng detail; không gọi Event.
- [ ] Xóa `luma.access` nhưng giữ `luma.refresh` → request kế tiếp vẫn chạy được (refresh ngầm, không redirect).
- [ ] Xóa cả hai token → redirect `/auth`, URL không lặp vô hạn.
- [ ] next external/`//host`/backslash/`/auth`/route business chưa tích hợp → về `/me`.
- [ ] Tắt Gateway rồi bấm Đăng nhập → banner network fail, bấm Thử lại khi bật lại thì thành công.
- [ ] Tab đang submit không đổi được tab, không gửi được request thứ hai.
- [ ] Validation email254/password8–128/name100 và field thừa theo canonical, không theo mock cũ.
- [ ] Logout đúng cặp200, mismatch401, access expired/refresh đang chạy, network outcome unknown đều đúng thông báo và cleanup.
- [ ] Login/refresh/profile cũ không khôi phục phiên sau logout hoặc ghi cache cho user mới.
- [ ] Policy storage/transport/nhiều tab đã được chốt và kiểm; không coi single-flight trong một tab là liên tab.
- [ ] Ghi lượt browser/backend thật mới vào `docs/ui/reports/01-auth.md` theo section ngày/môi trường; giữ kết quả mock cũ là lịch sử, không nâng thành PASS M4.
