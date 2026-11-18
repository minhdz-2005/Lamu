# Kế hoạch nối API frontend: đăng nhập, đăng ký và quên mật khẩu

## Quyết định triển khai hiện tại (16/11/2026, ưu tiên nội dung lịch sử bên dưới)

Yêu cầu hiện tại cho phép triển khai P0–P4. Evidence tại REPORT_FRONTEND_AUTH_INTEGRATION_01.md; không dùng PASS lịch sử.

- F01: `NEXT_PUBLIC_AUTH_MODE=mock|real` là build-time flag. `/api/identity/*` chỉ real, `/api/*` business vẫn mock. Session/cache nằm trong một record `lamu.session.v2.{mode}`; không migrate credential legacy. Real credential chỉ gửi tới allowlist Identity. Mock protected requests không lấy real credential và không kích hoạt refresh real. Đổi mode phải restart/rebuild và reload mọi tab; tab build cũ dùng namespace cũ, không trộn credential.
- F02: Web Locks exclusive `lamu.session.v2.{mode}`, chờ tối đa 15 giây; browser tự giải phóng khi tab crash. Không hỗ trợ Web Locks: fail closed thao tác ghi real, yêu cầu browser hỗ trợ; không dùng localStorage read/write làm mutex. Một record chứa version/generation/cặp token/profile/refresh-attempt. Writer login/refresh/logout/reset/cache đều dưới lock; so sánh generation và credential snapshot trước commit. Storage event chỉ là thông báo; đọc lại record mỗi thao tác nên mất message không làm token cũ ghi đè. Trước refresh ghi attempt marker; response mất/crash không replay refresh cũ, yêu cầu login lại. Network/5xx giữ record nhưng đánh dấu không refresh lại cùng proof.
- F03: bật server transport trước, tiếp session rồi UI trong cùng build; chỉ bật real sau readiness và test. Rollback bằng rebuild mock, reload tab, xóa namespace real dưới lock khi cần; không copy credential giữa mode. Password đã đổi/rotation/revocation không rollback được. Kiểm chứng local cả hai mode và upstream down, không deploy.
- F04: `/me` default; Account vẫn preview ngoài scope. Chỉ authenticated sau `/users/me` thật được validate; profile network/5xx hiển thị retry ở auth, không lấy fixture làm evidence.
- F05: runner Node test + tsx đã có ở root được nối ngay đầu P1; unit/session race trước UI. P4 dành browser/provider thật và tổng hợp.
- F06: browser `/api/identity/auth/{register,login,refresh,logout,forgot-password,verify-reset-code,reset-password}` (POST), `/api/identity/users/me` (GET); Gateway tương ứng `/api/...`. Route cụ thể `/api/identity/[...path]` ưu tiên catch-all mock. Upstream server-only `IDENTITY_GATEWAY_URL` cố định, không nhận từ client; không redirect upstream, timeout 8s, response/error/ID/Retry-After/Cache-Control được giữ. Chỉ forward Content-Type, Authorization, UUID X-Request-Id; loại toàn bộ forwarding/context/cookie header của browser. Topology local Next→Gateway loopback, Gateway không trust forwarding (`GATEWAY_TRUSTED_PROXY_CIDRS` trống): rate limit theo IP Next (giới hạn đã biết); không đoán IP browser từ XFF. Production cần edge tin cậy trước khi bật real cho nhiều người; không thêm CORS.
- F07: transport same-origin và storage localStorage đã chốt; mọi câu “chọn” trong lịch sử đọc là triển khai các quyết định trên. CORS chỉ dự phòng. Checkpoint RED/GREEN ghi báo cáo, không commit theo yêu cầu.

Các finding chỉ được đóng theo test runtime tương ứng, không theo cập nhật tài liệu này.

Ngày rà soát baseline: **16/11/2026**. Trạng thái baseline lịch sử: PLAN; trạng thái triển khai hiện tại xem mục 10 và báo cáo.

Cập nhật xác nhận lịch sử ngày **16/11/2026**: người dùng chấp nhận các đề xuất trong plan với giới hạn phạm vi tại mục 8.1. Lượt lập plan chỉ cập nhật tài liệu; yêu cầu triển khai hiện tại đã thay thế giới hạn phiên đó.

Đường dẫn `identity/report` được hiểu là thư mục báo cáo hiện có `services/identity-service/report/`. Báo cáo dựa trên đọc code trong working tree; chưa chạy backend, gửi email, chạy test hay nghiệm thu browser trong lượt lập kế hoạch. Các kết luận bên dưới phân biệt hiện trạng code, đề xuất và thông tin cần xác minh.

## 1. Kết luận và phạm vi

Không cần xây lại API auth. Backend Identity và Gateway đã có register/login/refresh/logout, profile và đủ ba API recovery. Frontend đã gọi register/login nhưng mặc định dùng mock; quên mật khẩu mới là thông báo. Việc chính là thiết lập transport thật, sửa session/client cho phù hợp backend, đồng bộ validation/error, bổ sung UI recovery và kiểm chứng end-to-end.

Phạm vi bắt buộc:

- Đăng nhập và đăng ký bằng Gateway thật; tự đăng nhập sau đăng ký thành công.
- Quên mật khẩu bằng email → OTP sáu chữ số → mật khẩu mới → trở lại đăng nhập.
- Bootstrap/refresh/logout đủ tin cậy để ba luồng không bị token cũ, redirect sớm hoặc race phá vỡ.
- Dùng `/users/me` để xác minh phiên phục vụ auth; giữ nguyên giao diện `/me`, chưa triển khai tích hợp trang Account trong đợt này.
- Kiểm thử browser, API, mail worker và lưu bằng chứng riêng cho tích hợp thật.

Ngoài phạm vi: OAuth, xác minh email lúc đăng ký, đổi mật khẩu khi đã đăng nhập, quản lý thiết bị/logout-all, tích hợp đầy đủ tổ chức/sự kiện/vé/thanh toán và đổi giao diện toàn bộ ứng dụng. Không cần migration hay endpoint mới cho happy path đã có; chỉ bổ sung backend nếu kiểm chứng phát hiện thiếu hoặc quyết định transport yêu cầu.

Giới hạn đã xác nhận: chỉ ba luồng đăng nhập, đăng ký và quên mật khẩu; backend chỉ Identity service và Gateway. Giữ nguyên các giao diện đã có, chưa thay đổi layout/style hoặc triển khai các trang khác. Các bước frontend bên dưới là kế hoạch nối logic cho ba luồng khi triển khai, không phải thay đổi đã thực hiện trong phiên này. Mail worker hiện có thuộc Identity được tái sử dụng; không bổ sung Notification, Event, Registration, Payment hoặc service mới. Shared runtime/contracts chỉ điều chỉnh khi trực tiếp phục vụ Identity/Gateway trong phạm vi này.

## 2. Nguồn đã rà soát

Các đường dẫn trong code block tính từ repository root; liên kết tài liệu tính từ file báo cáo này.

| Nhóm | Nguồn | Kết luận sử dụng |
|---|---|---|
| UI auth | `frontend/src/features/auth/{AuthPage,AuthControls}.tsx`, `content.ts` | Hai tab login/register; forgot chỉ bật notice |
| Client/session | `frontend/src/lib/{apiClient,auth,useSession,errors,types}.ts` | Base URL chung, localStorage, refresh promise trong một JS context, error map còn thiếu |
| Mock/config | `frontend/src/app/api/[...path]/route.ts`, `frontend/next.config.mjs`, `frontend/.env.example`, `frontend/README.md` | `/api` hiện là mock; cấu hình Next chưa có proxy |
| Auth backend | `services/identity-service/src/modules/auth/{auth.controller,auth.service}.ts`, `dto/auth.dto.ts` | Register trả user ID; login trả tokens; logout yêu cầu session context |
| Recovery | `services/identity-service/src/security/{recovery.controller,recovery.service,config,mail.worker}.ts` | OTP, reset token một lần, mail job, giới hạn theo email/IP |
| Gateway/runtime | `gateway/src/routes/{auth.controller,proxy.service}.ts`, `gateway/src/app.ts`, `shared/libraries/runtime/src/index.ts` | Public auth routes, protected logout, forward Retry-After, request ID UUID, chưa thấy bật CORS |
| Profile | `services/identity-service/src/modules/users/users.service.ts`, `frontend/src/features/account/accountData.ts` | Backend có profile/media/membership; frontend còn presentation fixtures cần kiểm tra đường render khi nối trang đích |
| Contract | [Identity OpenAPI](../../../shared/contracts/http/identity.openapi.json), [Gateway OpenAPI](../../../shared/contracts/http/gateway.openapi.json), [generated types](../../../shared/contracts/http/generated/identity.d.ts) | Authority để chốt request/response; không lấy mock làm chuẩn |
| Thiết kế/handoff | [UI auth](../../../docs/ui/01-auth.md), [quy ước UI](../../../docs/ui/00-conventions.md), [handoff](../../../docs/integration/identity-handoff.md), [ADR recovery](../../../docs/adr/0006-media-password-recovery.md) | Có thiết kế M4 chưa đồng bộ code; lịch sử PASS backend/mock không chứng minh browser thật |
| Tests/runbook | `tests/{p2-auth,p3-jwt-profile,p4-session,recovery,security-adapters}.spec.ts`, `services/identity-service/requests/media-recovery.http`, `docker-compose.yml` | Có test provider và request mẫu để tái sử dụng |

## 3. Khoảng trống và mức ưu tiên

| ID | Hiện trạng có bằng chứng trong code | Việc cần làm | Ưu tiên |
|---|---|---|---|
| G01 | Baseline: base URL chung và catch-all mock | Triển khai same-origin `/api/identity`, build flag mock/real và namespace session v2; business giữ mock | P0 |
| G02 | Baseline: Gateway chưa bật CORS | Triển khai same-origin proxy đã chốt; CORS chỉ dự phòng, không bật thêm | P0 |
| G03 | `useSession.logout()` gửi `anonymous: true`; Gateway dùng JwtGuard | Gửi Bearer + refresh hiện hành cùng session; điều phối refresh/logout | P0 |
| G04 | Refresh lỗi bất kỳ trả false rồi clear session; retry request sau refresh nhận 401 chưa có xử lý kết thúc riêng | Phân biệt 401/403/network/5xx; retry hữu hạn, không xóa phiên vì sự cố mạng | P0 |
| G05 | AUTHENTICATED được đặt chỉ từ sự tồn tại access token; AuthPage redirect ngay; `finishLogin` cũng redirect | Bootstrap xác minh session; thống nhất một nơi điều hướng; chặn response cũ ghi đè sau logout/login mới | P0 |
| G06 | FE giới hạn display_name 80, password chỉ min 8, email chưa max 254 | Đồng bộ backend: tên 1–100, password 8–128, email tối đa 254 | P1 |
| G07 | Register thành công nhưng login lỗi vẫn ở flow register; nút retry gọi lại submit | Tách trạng thái tài khoản đã tạo; retry chỉ login, không register lần hai | P1 |
| G08 | Forgot chỉ toggle notice; chưa có UI gọi ba endpoint recovery | Bổ sung flow OTP/reset, resend, hết hạn, lỗi và loading | P0 |
| G09 | ErrorCode thiếu `RATE_LIMITED`, `INVALID_RECOVERY`, `UPSTREAM_TIMEOUT`; client không giữ Retry-After; ưu tiên nguyên văn message backend tiếng Anh | Bổ sung types/map tiếng Việt, fallback mã lạ, metadata retry; không parse message để đoán field | P1 |
| G10 | Client tạo request ID `req-...`, runtime chỉ nhận UUID và thay ID không hợp lệ | Dùng UUID hợp lệ; lấy ID phản hồi làm nguồn chẩn đoán khi có | P1 |
| G11 | `sanitizeNext` chỉ kiểm prefix, mặc định `/events`; đặc tả Identity chọn `/me` và allowlist | Chuẩn hóa URL cùng origin, chặn backslash/external/auth loop; giới hạn route đã tích hợp | P0 |
| G12 | localStorage + listener nội bộ không điều phối nhiều tab; backend refresh rotation có một winner | Chốt chính sách nhiều tab, khóa refresh và đồng bộ phiên hoặc chọn lưu theo tab | P0 trước nghiệm thu reload/nhiều tab |
| G13 | Tài liệu auth còn thông báo chưa có recovery; một số mốc handoff ghi version lịch sử | Đồng bộ tài liệu theo contract hiện tại, giữ riêng lịch sử evidence | P1 |

G04 cần thêm regression: nhánh không có refresh token trả về trước `finally`, có nguy cơ giữ `refreshPromise` đã resolve false; bảo đảm promise được giải phóng ở mọi nhánh. Đây là phát hiện đọc code, cần tái hiện bằng test trước khi kết luận hành vi runtime.

## 4. Mapping API và hành vi frontend

Browser chỉ gọi Gateway với prefix `/api`; path truyền vào `request()` bỏ `/api` vì base đã chứa prefix. Các response thành công dưới đây không bọc thêm `data`.

| API Gateway | Request | Thành công | Hành vi |
|---|---|---|---|
| POST `/api/auth/register` | `{email,password,display_name}` | 200 `{user_id}` | Ghi nhận đã tạo, gọi login một lần |
| POST `/api/auth/login` | `{email,password}` | 200 `{access_token,refresh_token,expires_in}` | Lưu cặp token nhất quán, load profile, chuyển trang |
| GET `/api/users/me` | Bearer access | 200 Profile | Dùng type canonical; không thay bằng fixture khi lỗi |
| POST `/api/auth/refresh` | `{refresh_token}` | 200 Tokens | Thay cả cặp; không tự refresh đệ quy |
| POST `/api/auth/logout` | Bearer access + `{refresh_token}` | 200 `{status:"OK"}` | Thu hồi phiên hiện hành; phân biệt server thành công với chỉ xóa local |
| POST `/api/auth/forgot-password` | `{email}` | 202 `{status:"OK"}` | Thông báo chung, chuyển nhập OTP; không xác nhận email tồn tại hoặc mail đã tới |
| POST `/api/auth/verify-reset-code` | `{email,code}`; code là chuỗi 6 số | 200 `{reset_token,expires_in}` | Giữ reset token trong bộ nhớ, mở form mật khẩu mới |
| POST `/api/auth/reset-password` | `{reset_token,new_password}` | 200 `{status:"OK"}` | Xóa dữ liệu recovery/phiên local theo chính sách; yêu cầu login lại |

Auth public gửi `anonymous: true`, riêng logout phải có Bearer. Không gửi `confirm_password` lên API vì DTO chỉ nhận các field hợp lệ. Không tự gửi `X-User-Id`, `X-Session-Id` hoặc gọi Identity trực tiếp từ browser.

Lỗi cần xử lý:

- `400 VALIDATION_FAILED`: banner chung hoặc field do frontend tự xác định, không giả có `field_errors` từ backend.
- `401 UNAUTHENTICATED` ở login: email hoặc mật khẩu không đúng. Ở phiên protected: refresh hữu hạn theo coordinator.
- `403 FORBIDDEN` ở login/profile/refresh: tài khoản không khả dụng, không dùng thông báo thiếu quyền tổ chức.
- `409 EMAIL_TAKEN`: giữ email và chuyển login theo hành vi hiện có.
- `400 INVALID_RECOVERY`: mã/token không hợp lệ hoặc hết hạn; không suy ra email tồn tại. Reset token không dùng được thì bắt đầu lại recovery.
- `429 RATE_LIMITED`: đọc Retry-After nếu có, vô hiệu submit tương ứng; không tự retry liên tục. Hỗ trợ số giây và HTTP-date, fallback hữu hạn khi thiếu/sai header.
- Network/502/504: thông báo thử lại chủ động; không gọi lại mutation tự động, không kết luận mật khẩu sai.

### Quy tắc recovery đã có ở backend

Default cấu hình: OTP 600 giây; reset token 300 giây; tối đa 5 lần sai/challenge; resend cooldown 60 giây; forgot email 5/giờ, IP 20/giờ. Verify hiện có budget 20/email/giờ và 100/IP/giờ; reset 30/IP/giờ. Đây là giá trị trong code, không khẳng định môi trường triển khai đang dùng default; còn rate limit chung/auth tại runtime.

Forgot trả 202 chung cho email không tồn tại/không active, giới hạn email và cooldown; vượt budget IP có thể 429. Vì vậy countdown resend chỉ là UX, không chứng minh email mới đã gửi. API forgot không trả OTP expiry/cooldown: không dựng thời hạn chính xác nếu chưa đồng bộ config. Verify trả `expires_in` cho reset token, có thể dùng trực tiếp.

Gửi lại thành công tạo challenge mới khi backend cho phép và vô hiệu challenge/token cũ. OTP chỉ verify thành công một lần. Reset thành công đổi password, revoke mọi refresh session của tài khoản, consume các challenge và xếp mail thông báo. Không tự login sau reset; kiểm tra access cũ trên endpoint Identity có session validation, không suy ra mọi service chỉ verify JWT đều revoke tức thời.

## 5. Trình tự triển khai và đầu ra

### P0 — Chốt transport và baseline

1. Đối chiếu schema auth/recovery của canonical và Gateway projection; ghi version thực tế, commit/working tree, mode chạy và browser.
2. Áp dụng same-origin proxy dành cho Identity theo đề xuất đã chấp nhận, giữ mock demo là mode riêng. Proxy phải thực sự vượt qua route catch-all; không mặc định một rewrite thông thường sẽ thắng route có sẵn. Có thể dùng namespace riêng hoặc nhánh proxy explicit theo mode; thêm test chứng minh request đến Gateway. Không tạo service proxy mới; dùng lớp frontend/proxy hiện có.
3. Direct cross-origin/CORS là phương án dự phòng nếu môi trường thực tế không hỗ trợ same-origin, không triển khai đồng thời hai phương án. Khi cần dùng, cấu hình origin allowlist cho Gateway, OPTIONS, method/header cần thiết (`Authorization`, `Content-Type`, `X-Request-Id`), expose `Retry-After`/`X-Request-Id`. Không mở CORS cho Identity nội bộ.
4. Nếu qua proxy: timeout hữu hạn, preserve status/error/request ID/Retry-After/Cache-Control; cấu hình trusted proxy CIDR đúng để rate limit không gom mọi user vào IP proxy và không tin header giả từ client.
5. Kiểm tra DB/migration, Identity/Gateway readiness; mail worker/SMTP riêng cho recovery. Theo runbook hiện có, không reset dữ liệu để chuẩn bị demo.

Đầu ra: cấu hình mẫu không chứa secret, sơ đồ request path, cách chuyển mode/restart/build và smoke request thật. Chỉ đổi base URL chưa đủ điều kiện hoàn thành P0.

### P1 — Client và session dùng chung

1. Tạo lớp API auth typed, ví dụ `frontend/src/features/auth/authApi.ts` (file mới dự kiến); tái sử dụng `apiClient`, lấy request/response types từ generated contract hoặc adapter chỉ rõ mapping.
2. Bổ sung error codes, metadata Retry-After/request ID, lỗi body rỗng/không đúng JSON, timeout/cancel hữu hạn. Không trả success giả với body không hợp lệ cho tokens/profile.
3. Tập trung bootstrap/login/refresh/logout trong coordinator. Phân biệt chưa xác minh, anonymous, authenticated, lỗi tạm thời và logging-out; token có mặt không đồng nghĩa phiên hợp lệ.
4. Single-flight refresh, giải phóng promise mọi nhánh; 401 sau retry kết thúc hữu hạn; 403 khóa tài khoản tách network/5xx. Response chậm phải bị bỏ qua nếu phiên/generation đã thay đổi.
5. Logout đợi refresh đang chạy trong thời hạn hữu hạn, lấy cặp hiện hành; access hết hạn chỉ refresh tối đa một lần rồi retry logout tối đa một lần. Không retry với refresh đã rotation.
6. Áp dụng lựa chọn lưu token/nhiều tab đã ghi nhận ở mục 8. Xử lý đồng bộ logout/reset và cache profile; không làm mới profile bằng vòng emit/refetch vô hạn.

Đầu ra: client/session tests cho race và lỗi thực tế; UI header không giữ tên tài khoản cũ sau đổi user/logout. Không ghi mật khẩu/OTP/token vào log hoặc evidence.

### P2 — Hoàn thiện đăng nhập/đăng ký

1. Đồng bộ validation với DTO; giữ password nguyên vẹn, trim email/tên, chuẩn hóa email.
2. Tách rõ đăng ký đã thành công và login tiếp theo. Auto-login lỗi chỉ cho retry login; timeout register có thể đã commit nên không hứa chưa tạo tài khoản, hướng người dùng đăng nhập/khôi phục phù hợp.
3. Xử lý error theo ngữ cảnh, khóa submit, bỏ response lỗi thời khi đổi mode/rời trang; giữ email nhưng xóa password khi hoàn tất hoặc rời flow nhạy cảm.
4. Một điểm điều hướng sau xác minh session; allowlist `next` theo mode. Giữ default `/me` theo đề xuất đã chấp nhận, nhưng không sửa giao diện hoặc nối thêm feature Account. Nếu trang đích còn preview, ghi rõ giới hạn; không dùng nội dung preview làm bằng chứng profile thật. Kiểm chứng auth bằng response `/users/me` thật và trạng thái session.
5. Khi `/users/me` lỗi transport sau login thành công, hiển thị tải lại, không tạo phiên login mới và không hiển thị fixture như dữ liệu thật.

Đầu ra: login/register browser thật, gồm email trùng, tài khoản khóa và auto-login thất bại.

### P3 — UI quên mật khẩu hoàn chỉnh

Giữ giao diện auth hiện có; chọn recovery là mode trong `/auth`, tách logic/component trong `features/auth/` khi triển khai. Các ô OTP/mật khẩu mới còn thiếu là bổ sung chức năng riêng của luồng recovery trong kế hoạch, không redesign giao diện đang có. Phiên cập nhật plan này chưa tạo hoặc sửa component/giao diện.

State flow: `EMAIL → SENDING → CODE → VERIFYING → NEW_PASSWORD → RESETTING → SUCCESS`. Mỗi bước có lỗi và retry chủ động. Thao tác quay lại/đổi email/gửi lại phải hủy kết quả cũ và xóa reset token khi không còn phù hợp.

1. Email: điền sẵn email vừa nhập login; gửi forgot anonymous; thông báo “Nếu email phù hợp với tài khoản, bạn sẽ nhận được mã hướng dẫn”.
2. OTP: input text, numeric input mode, autocomplete one-time-code, giữ số 0 đầu; hỗ trợ paste, validate đúng 6 chữ số; email hiển thị chỉ từ giá trị người dùng nhập.
3. Resend: gọi lại forgot, cooldown UI theo cấu hình được thống nhất; chặn gửi trùng, xử lý 429; không gọi polling để tìm mã.
4. Verify: giữ reset token trong memory, không URL/localStorage/sessionStorage; hết hạn hoặc reload mất token thì hướng dẫn bắt đầu lại.
5. Mật khẩu mới: hai ô password/confirm, 8–128 ký tự, show/hide; confirm chỉ validate ở frontend. Không tự thêm luật độ mạnh mà backend chưa yêu cầu.
6. Reset: gửi một lần; thành công xóa token/OTP/password, báo đăng nhập lại bằng mật khẩu mới. Nếu mất response, giải thích kết quả chưa xác định, cho thử login hoặc bắt đầu recovery mới; không cam kết retry reset cùng token sẽ thành công.
7. Người đang có token vẫn cần truy cập recovery theo chính sách được chốt; tránh effect redirect hiện tại đẩy ra khỏi flow. Thông báo rõ hậu quả thu hồi các phiên của tài khoản được reset.
8. Keyboard/focus/aria-live/error association, mobile và dark/light; giữ thiết kế đang có, không làm redesign ngoài scope.

Đầu ra dự kiến: component/state recovery, copy tiếng Việt, API helpers/types và tests; cập nhật `AuthPage.tsx`, `AuthControls.tsx`, `content.ts` theo nhu cầu thực tế.

### P4 — Kiểm thử tích hợp và bàn giao

1. Chạy frontend typecheck/build; chạy contract check và backend test phù hợp nếu sửa Gateway/runtime/backend.
2. Runner Node test + tsx được thiết lập từ đầu P1; c8 kiểm coverage core, Playwright/Chrome cho P4. Frontend đã có scripts test/test:coverage. Đã đọc Next guide local theo `frontend/AGENTS.md` trước khi viết code.
3. Chạy ma trận mục 7 trên browser với Gateway/Identity/DB thật, tài khoản tổng hợp và hộp thư kiểm soát. Recovery cần mail worker đang chạy; API 202 không thay bằng chứng nhận OTP.
4. Ghi báo cáo mới hoặc bổ sung `docs/ui/reports/01-auth.md`, giữ evidence mock lịch sử; cập nhật README/env mẫu/UI spec/handoff. Ghi rõ provider thật, mail test inbox hay SMTP thật, không trộn kết quả.

Phụ thuộc: P0 → P1 → P2/P3 → P4. Các đề xuất đã được chấp nhận theo mục 8; trước khi thực hiện cần kiểm tra cấu hình/môi trường thực tế, không hỏi lại quyết định đã chốt. Phiên này chỉ cập nhật plan.

## 6. Phần cần bổ sung theo khu vực

| Khu vực | Thay đổi dự kiến | Điều kiện |
|---|---|---|
| Frontend config/mock route | Mode/transport thật, tránh fallback mock im lặng | Bắt buộc |
| `lib/apiClient.ts`, `errors.ts`, `types.ts` | Timeout, response validation, metadata, error mapping, canonical types | Bắt buộc |
| `lib/auth.ts`, `useSession.ts` và coordinator dự kiến | Bootstrap, refresh/logout, storage policy, cache, safe redirect | Bắt buộc |
| `features/auth/*` | Validation, partial success register, recovery states/components/copy | Bắt buộc |
| Trang `/me`/header | Giữ nguyên giao diện; chỉ logic session/logout trực tiếp phục vụ auth, chưa tích hợp trang Account | Giới hạn đã xác nhận |
| Gateway/bootstrap | CORS hoặc trust proxy, tests transport | Theo phương án P0 |
| Recovery backend/config | Chưa cần đổi contract; chỉ sửa nếu kiểm thử phát hiện lỗi | Có điều kiện |
| Frontend test setup + docs | Test session/flow và browser evidence, cập nhật tài liệu lệch code | Bắt buộc |

## 7. Ma trận kiểm chứng và tiêu chí hoàn thành

| ID | Tình huống | Kỳ vọng |
|---|---|---|
| T01 | Login đúng/sai/LOCKED | Tokens thật, profile thật; lỗi 401/403 đúng ngữ cảnh |
| T02 | Register mới/email trùng | 200 user_id → login; 409 giữ email, không tạo trùng |
| T03 | Register thành công, login timeout | Chỉ retry login, không register lại |
| T04 | Boundary email 254/255, password 7/8/128/129, tên 0/1/100/101 | FE/DTO đồng nhất; password không bị trim |
| T05 | Reload với token cũ; nhiều request cùng 401 | Không redirect dựa token presence; một refresh trong coordinator |
| T06 | Refresh 401/403/network/502/504; retry vẫn 401 | Không loop; không xóa phiên vì lỗi transport; recovery UI không bị redirect bất ngờ |
| T07 | Logout khi access hết hạn/refresh đang chạy; response profile chậm | Cặp token hiện hành; logout server xác nhận khi có thể; response cũ không hồi sinh phiên |
| T08 | Hai tab refresh/logout/reset | Đúng chính sách đã chọn; không lưu đè token đã rotation |
| T09 | `next` external, `//host`, backslash, encoded URL, `/auth`, business route | Chỉ tới route cùng origin được allowlist; default an toàn |
| T10 | Forgot email tồn tại/không tồn tại/khóa/cooldown | UI thông báo chung, không rò trạng thái tài khoản |
| T11 | Nhận OTP từ mail worker, mã có số 0 đầu | Browser verify được với mã thật, không lấy OTP qua API giả |
| T12 | OTP sai/hết hạn/quá attempts/resend/verify hai lần | INVALID_RECOVERY xử lý được; mã/token cũ không tiếp tục flow |
| T13 | Reset token hết hạn/dùng lại/reload/đổi email | Xóa state cũ, hướng bắt đầu lại, không lưu token bền vững |
| T14 | Reset thành công | Password cũ thất bại, mới login được; refresh cũ bị từ chối; kiểm tra access cũ qua Identity |
| T15 | 429, thiếu/sai Retry-After, SMTP chậm/lỗi | Không spam retry, countdown hợp lý; 202 không hứa mail đã tới |
| T16 | Gateway down, timeout sau register/verify/reset, body lỗi không JSON | Lỗi hữu ích, không success giả; không replay mutation tự động |
| T17 | Network browser transport/preflight/proxy IP | Request đến Gateway thật; request ID/headers còn nguyên nghĩa; không âm thầm dùng mock |
| T18 | Keyboard/mobile/dark-light/submit kép/rời trang | Focus và thông báo đọc được; không gửi trùng/ghi state lỗi thời |

Lệnh sẵn có để dùng khi triển khai (chưa chạy trong lượt lập plan):

```powershell
npm --prefix frontend run typecheck
npm --prefix frontend run build
npm run contracts:check
```

Backend regression dùng runbook/test DB hiện có; ưu tiên auth/session/recovery tests tương ứng thay đổi. `npm run test:security` bao gồm thêm media và cần môi trường riêng; không tự xem test browser là thay thế provider regression. Test gửi thư thật dùng tài khoản/inbox kiểm soát, không gửi đại trà.

Hoàn thành khi: ba flow chạy trên browser qua Gateway thật; không còn mock trong đường auth/profile nghiệm thu; session/logout/redirect đạt các ca bắt buộc; recovery nhận OTP và reset thật; build/typecheck/check liên quan đạt; mọi giới hạn/chưa chạy được ghi rõ. Không đánh dấu PASS bằng việc đọc code hoặc trích báo cáo backend cũ.

## 8. Thông tin cần xác minh thêm và quyết định đã xác nhận

### 8.1. Xác nhận phạm vi trong phiên này

Nguồn: chỉ đạo trực tiếp của người dùng ngày **16/11/2026**:

> “phiên này chỉ tập trung luồng đăng nhập/ đăng ký và quên mật khẩu các giao diện đã có vẫn giữ lại và chưa tiến hành thay đổi, chỉ tập trung vào identity service và gateway không bổ sung thêm các service ngoài phạm vi phát triển các thông tin còn lại thì chấp nhận theo đề xuất đã đưa ra”

- **Đã chốt:** chỉ đăng nhập, đăng ký và quên mật khẩu. Refresh/logout/profile chỉ là phụ thuộc kỹ thuật để ba luồng hoạt động đúng, không mở rộng thành feature quản lý tài khoản.
- **Đã chốt:** giữ nguyên giao diện hiện có; chưa tiến hành thay đổi giao diện hoặc code trong phiên cập nhật tài liệu này. Không triển khai các trang Account, tổ chức, lời mời, Event, vé hoặc thanh toán trong đợt auth.
- **Đã chốt:** phạm vi backend là Identity service và Gateway; tái sử dụng DB/mail worker hiện có của Identity, không tạo thêm service nghiệp vụ hoặc yêu cầu phát triển service ngoài phạm vi.
- **Đã chấp nhận:** các đề xuất còn lại của plan, áp dụng dưới các giới hạn trên. Không hỏi lại để phê duyệt cùng một lựa chọn; thông số môi trường chưa có bằng chứng vẫn phải kiểm tra thực tế.
- Nếu nội dung rà soát hoặc đề xuất trước đó rộng hơn giới hạn này, mục 8.1 được ưu tiên. Việc chấp nhận plan không đồng nghĩa đã triển khai hoặc kiểm thử PASS.

### 8.2. Ghi nhận V01–V09 sau xác nhận

| ID | Quyết định áp dụng | Thông tin thực tế còn cần kiểm tra | Thời điểm |
|---|---|---|---|
| V01 | Chấp nhận same-origin proxy dành cho Identity qua Gateway; dùng cấu trúc hiện có, không thêm service | Origin/URL/port, proxy route và trusted CIDR của môi trường chạy | P0 |
| V02 | Giữ các giao diện/demo đã có; cô lập transport auth để không chuyển API business sang Gateway thật | Kiểm tra request ngoài auth không bị ảnh hưởng; không nối thêm service business | P0 |
| V03 | Giữ localStorage hiện có, bổ sung khóa refresh xuyên tab và đồng bộ session/logout; reset token chỉ trong memory. Chưa chuyển sang HttpOnly/BFF hoặc sessionStorage | Kiểm tra khả năng cơ chế khóa/đồng bộ trên browser mục tiêu và race tests | P1 |
| V04 | Chấp nhận default `/me` và safe redirect; hoãn tích hợp/thay đổi giao diện Account theo giới hạn mới | Ghi rõ nếu trang đích còn preview; chỉ response `/users/me` thật là bằng chứng auth/profile API | P2 |
| V05 | Recovery trong feature auth, mode thuộc `/auth`; người đang có phiên được chủ động vào recovery, không bị auto-redirect | Kiểm tra guard và vòng đời state; phần input còn thiếu chỉ triển khai trong luồng recovery khi thực hiện plan | P3 |
| V06 | Dùng mail worker Identity hiện có và inbox kiểm soát; countdown theo config thực tế | SMTP/worker readiness, inbox nhận thư, TTL/cooldown; không ghi secret vào báo cáo | P3–P4 |
| V07 | Chỉ nghiệm thu revocation ở Identity/Gateway; service ngoài phạm vi không là dependency của đợt này | Kiểm tra access/refresh cũ tại endpoint trong phạm vi; không cần khảo sát hoặc sửa service khác để đóng plan | P4 |
| V08 | Chấp nhận test tối thiểu cho session/browser; không tự gán người hoặc deadline | Browser/runner/CI hiện có và người nghiệm thu thực tế khi bàn giao; chọn chi tiết kỹ thuật phù hợp repo | P4 |
| V09 | Dữ liệu tổng hợp trong môi trường test riêng, tài khoản ACTIVE/LOCKED; không dùng mock làm bằng chứng thật | DB/seed và tài khoản test thực tế trước khi chạy | P4 |

Các mục kiểm tra thực tế là điều kiện chạy/ghi bằng chứng, không phải các đề xuất còn chờ người dùng phê duyệt lại. Có thể tiếp tục chuẩn bị phần không phụ thuộc môi trường thiếu; không tự ghi SMTP, browser hay dữ liệu test đã sẵn sàng khi chưa kiểm chứng.

Không đề xuất bắt buộc API trả OTP expiry/cooldown mới ở đợt này. Nếu sản phẩm yêu cầu countdown chính xác từ server, lập thay đổi contract riêng, đánh giá tính không tiết lộ tài khoản và cập nhật projection/generated types trước khi frontend sử dụng.

## 9. Mẫu bằng chứng bàn giao

Mỗi lượt chạy ghi: thời điểm/múi giờ, commit hoặc working tree, frontend/backend version, browser, transport/base URL không chứa secret, mode mock/real, DB/mail provider, test IDs, expected/actual và đường dẫn evidence đã che dữ liệu nhạy cảm. Trạng thái dùng `NOT_RUN`, `PASS`, `FAIL`, `BLOCKED` kèm lý do cụ thể.

Trạng thái của baseline lịch sử: NOT_RUN. Trạng thái triển khai hiện tại và evidence riêng nằm tại mục 10 và báo cáo triển khai; không kế thừa PASS từ phiên lập plan.

## 10. Theo dõi triển khai 16/11/2026

Canonical baseline v1.4.0 có thiếu `INVALID_RECOVERY` trong enum lỗi chung. Test contract RED, sửa canonical thành v1.4.1, sinh lại Gateway projection/types; check GREEN. Không thêm endpoint/service/migration nghiệp vụ.

P0–P4 hoàn tất và PASS trong môi trường local/test được cho phép: 22/22 unit core, 38/38 tests trên6 suite provider/browser/contract, build/typecheck/contract/audit/rollback PASS. Xem [báo cáo](REPORT_FRONTEND_AUTH_INTEGRATION_01.md) cho mapping F01–F07/T01–T18 và phạm vi evidence. Không coi Account preview là profile thật; SMTP ngoài/production/đa browser vẫn NOT_RUN, không phải tiêu chí local được đánh dấu PASS.

Mapping: F01→mode.test + rollback drill; F02→session.test + browser multi-tab/lock timeout; F03→frontend-auth-rollback.cjs; F04→real profile contract assertion + generation/cache regression; F05→test/test:coverage từ P1; F06→proxy unit + spoof IP/budget DB + Gateway-down browser transport; F07→env/README/mục quyết định hiện tại.

Chi tiết đã chọn: timeout proxy 8s, client 10s, chờ Web Lock 15s; refresh marker ghi trước request nên crash/lost response không replay proof. Focus/visibility đọc lại record để xử lý mất notification. Password/tên đếm Unicode code points theo DTO/OpenAPI, password giữ nguyên whitespace. Các writer đều giữ lock; đăng ký→login dùng generation chụp trước register. Reset thành công xóa phiên hiện hành của browser xuyên tab dù email reset khác tài khoản đang dùng; backend thu hồi phiên của tài khoản được reset. Không lưu reset token vào storage/URL/log.

Giới hạn: rate limit IP gộp tại Next trong topology local không trust XFF; Account ngoài scope; SMTP ngoài không chạy; chưa nghiệm thu production/đa trình duyệt. Rollback không hoàn tác password/rotation/revocation. Chi tiết PASS/NOT_RUN ở báo cáo, không suy ra readiness production từ local PASS.
