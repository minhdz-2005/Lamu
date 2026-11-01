# 01. Đăng ký và đăng nhập

**Route:** `/auth` · **Cần đăng nhập:** Không · **Ưu tiên:** 1 · **API:** `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/refresh`, `POST /api/auth/logout`, `GET /api/users/me`

Mục tiêu: user vào được hệ thống bằng email + password, và frontend giữ được phiên khi access token hết hạn. Một trang, hai tab, không route phụ.

## 1. Layout

```text
+------------------------------------------------+
|  LumaSOA                          [logo, trái] |
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
|   |  (chỉ tab đăng nhập) Quên mật khẩu?      |  |
|   +------------------------------------------+  |
|   Ghi chú nhỏ: "Demo local — không có email    |
|   thật, mật khẩu tối thiểu 8 ký tự."           |
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
| Email | `email` | không rỗng, có `@` và `.` sau `@`, lowercase trước khi gửi | "Email này đã có tài khoản." nếu API `EMAIL_TAKEN` |
| Mật khẩu | `password` | 8 ký tự trở lên | "Mật khẩu tối thiểu 8 ký tự." |
| Tên hiển thị | `display_name` | chỉ tab register; không rỗng, ≤ 80 ký tự | "Trường này không được để trống." |

Validate chạy khi blur từng field và khi submit. Submit chỉ gọi API khi không còn `fieldErrors`.

## 3. Hành vi theo API

### 3.1 Đăng nhập

```text
POST /api/auth/login  body {email, password}
200 -> {access_token, refresh_token, expires_in}
```

1. Lưu `access_token` → `localStorage['luma.access']`, `refresh_token` → `luma.refresh` (xem 00 §2).
2. Gọi `GET /api/users/me` để lấy `display_name` và `memberships[]` đưa vào auth store (dùng cho header và guard `/organizer`).
3. Redirect sang `next` trong query (`/auth?next=/events/my-slug`), mặc định `/events`. Nếu `next` không bắt đầu bằng `/` → bỏ qua, về `/events` (chống open redirect).
4. Focus về main content, toast "Chào mừng lại, <display_name>".

Lỗi:

| Tình huống | API | UI |
|---|---|---|
| Sai email hoặc mật khẩu | `401 UNAUTHENTICATED` | Một câu chung "Email hoặc mật khẩu không đúng." — **không** tiết lộ email nào tồn tại; focus ô mật khẩu |
| Tài khoản bị khóa | `403 FORBIDDEN` | Banner "Tài khoản bị khóa. Liên hệ ban tổ chức demo." |
| Thiếu field | `400 VALIDATION_FAILED` | Map `message` xuống field tương ứng nếu có, không thì toast chung theo 00 §3 |

### 3.2 Đăng ký

```text
POST /api/auth/register  body {email, password, display_name}
200 -> {user_id}
```

Sau 200: **tự động gọi login** bằng đúng email/password vừa nhập (API register không trả token), rồi đối xử như §3.1. Không bắt user bấm lần hai. Nếu auto-login fail, hiện form login với thông báo "Tạo tài khoản xong, đăng nhập lại giúp bạn."

Lỗi `409 EMAIL_TAKEN` → báo đỏ dưới ô email, tự chuyển tab sang Đăng nhập và giữ email đã gõ (đây là đường user hay gặp nhất).

### 3.3 Refresh và logout

Refresh: theo 00 §2, gọi `POST /api/auth/refresh` body `{refresh_token}`; 200 trả payload như login; 401 thì xóa token + redirect `/auth?next=<route đang ở>`.

Logout (nút ở header, không nằm trong trang này): `POST /api/auth/logout` body `{refresh_token}` → xóa token bất kể kết quả → redirect `/auth`.

## 4. State màn hình

| State | Khi nào | Nội dung |
|---|---|---|
| Form rỗng | lần đầu vào `/auth` | form chưa validate, nút "Tiếp tục" enabled nhưng submit sẽ chặn nếu thiếu |
| Submitting | đang gọi API | nút `disabled` + "Đang kiểm tra...", input `readonly`, không cho đổi tab |
| Field error | sau submit fail có `fieldErrors` | lỗi đỏ dưới field, `aria-describedby`, focus field đầu tiên |
| Api error | 401/403/409/5xx | banner trên đầu form theo 00 §3, kèm `request_id` chữ nhỏ |
| Redirecting | 200 login | form mờ, nút "Đang mở..." tối đa 500 ms rồi chuyển route |

## 5. Edge cases phải xử lý

| Case | Xử lý |
|---|---|
| Vào `/auth` khi đã có token hợp lệ | Redirect thẳng `/events` (không hiện form) |
| `next=/auth` hoặc next không an toàn | Bỏ qua, về `/events` |
| Gõ email có hoa `A@Gmail.COM` | Lowercase trước khi validate và trước khi gửi |
| Bấm Enter khi đang ở ô mật khẩu | Submit form (không nhảy tab) |
| Hai tab cùng mở, một tab logout | Tab còn lại: request kế tiếp 401 → refresh fail → redirect `/auth` |
| API Gateway chưa lên (network fail, không có JSON error) | Banner "Không kết nối được server. Chạy `docker compose up` rồi thử lại." + nút Thử lại |
| `expires_in` trả về rất nhỏ | Không tự refresh chủ động; phụ thuộc interceptor 401 (đơn giản hơn, đủ cho demo) |

## 6. Checklist nghiệm thu

- [ ] Đăng ký email mới → tự login → header hiện `display_name` → URL về `/events`.
- [ ] Đăng ký email đã tồn tại → lỗi dưới ô email + form tự chuyển sang tab Đăng nhập.
- [ ] Đăng nhập sai mật khẩu 2 lần → cùng một câu lỗi, không lộ email nào có tài khoản.
- [ ] Vào `/events/abc` khi chưa login, bấm "Giữ chỗ" → sang `/auth?next=/events/abc` → sau login quay lại đúng trang event đó.
- [ ] Xóa `luma.access` nhưng giữ `luma.refresh` → request kế tiếp vẫn chạy được (refresh ngầm, không redirect).
- [ ] Xóa cả hai token → redirect `/auth`, URL không lặp vô hạn.
- [ ] `next=http://evil.com` → bỏ qua, về `/events`.
- [ ] Tắt Gateway rồi bấm Đăng nhập → banner network fail, bấm Thử lại khi bật lại thì thành công.
- [ ] Tab đang submit không đổi được tab, không gửi được request thứ hai.
- [ ] Ghi kết quả test vào `docs/ui/reports/01-auth.md`.
