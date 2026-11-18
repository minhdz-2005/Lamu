# Kế hoạch avatar, ảnh bìa organization và khôi phục mật khẩu

Ngày cập nhật: 15/11/2026. Trạng thái: **P0–P5 backend hoàn tất và đã kiểm thử**. Recovery và media chạy qua Gateway; bằng chứng local, Compose, Cloudinary và SMTP được tách riêng trong [REPORT_MEDIA_RECOVERY_01.md](REPORT_MEDIA_RECOVERY_01.md). SMTP accepted chưa chứng minh email vào inbox. F1/N1 chưa triển khai.

Quyết định theo yêu cầu người dùng: hoàn thiện hai chức năng phía backend trước: (1) lưu avatar user và cover organization qua Cloudinary; (2) quên mật khẩu qua OTP email trong Identity. Giai đoạn hiện tại bao gồm Identity, Gateway, database, worker, cấu hình, contracts và kiểm thử API; frontend sẽ tích hợp sau, không phải điều kiện nghiệm thu backend. Sau khi hoàn thiện recovery trong Identity, chuyển phần gửi email sang Notification ở giai đoạn riêng. Identity tiếp tục sở hữu OTP, reset mật khẩu và thu hồi phiên. Phương án phân giai đoạn này đã được chọn; các chính sách bên dưới đã được hiện thực; các quyết định chi tiết và khác biệt với dự kiến ban đầu được ghi trong ADR 0006 và handoff.

## 0. Tiến độ và bằng chứng hiện tại

| Mốc | Trạng thái / bằng chứng |
|---|---|
| P0 | PASS — OpenAPI Identity v1.4.0, Gateway projection, generated types; contracts:check và migration/schema diff không drift |
| P1 | PASS — Gateway routes, trusted IP, no-store/Retry-After, DB session validation, user-before-session locking; auth/RBAC regression |
| P2 | PASS — OTP HMAC/DB quotas/token single-use, AES-GCM mail jobs; SMTP adapter/worker lease/retry/expiry/retention |
| P3 | PASS — PostgreSQL/Mailpit qua Gateway và Compose thật; restart mail worker/API, password/session cũ bị từ chối; không RabbitMQ/Notification |
| P4 | PASS — media intent/commit/delete, metadata/CAS, RBAC migration, durable cleanup/tombstone; Cloudinary thật cả PNG và WebP động tổng hợp |
| P5 | PASS — 145 automated tests, 28 suites; coverage 89.56% statements / 85.84% branches / 88.75% functions / 90.64% lines; provider smoke riêng, docs/request mẫu |
| Cloudinary thật | Signed upload → metadata → commit → replace/replay → cover → delete/cleanup PASS; WebP 2 frame bị backend từ chối; asset test đã dọn |
| Gmail thật | TLS/auth PASS; đúng một email test tới SMTP_USER được SMTP accepted, không rejected; chưa xác minh inbox |
| Cấu hình hiện có | Preflight 0 lỗi/0 cảnh báo; không đổi .env, credentials, MAIL_FROM hoặc rotate key; các biến mới có default trong .env.example |
| Dependency/security | Production audit 0 vulnerabilities; 21 cảnh báo dev từ phiên bản Jest/esbuild hiện hữu, không do 2 package mới; scan giá trị secret local trong source/docs 0 match |
| F1/N1 | Chưa triển khai theo phạm vi đã chốt; không phải blocker backend |

Lệnh chạy, API, cấu hình từng process, rollback và giới hạn: [handoff](../../../docs/integration/media-password-recovery.md). Báo cáo kiểm thử: [REPORT_MEDIA_RECOVERY_01.md](REPORT_MEDIA_RECOVERY_01.md). Test Cloudinary chủ động được tách khỏi test tự động (một test opt-in bị skip ở suite thường và đã PASS khi chạy riêng). Không hạ coverage threshold hoặc bỏ test thất bại. Assertion access-token sau logout được đổi từ hành vi M1 cũ sang 401 theo yêu cầu revoke tức thời; fixture nội bộ dùng session thật.

Không deploy production, không chạy migration vào database hiện tại, không commit/push. Chỉ tạo/dọn PostgreSQL, Mailpit và Compose project test riêng. Schema đã apply bằng Prisma migrate deploy trên DB test mới; upgrade có dữ liệu cũ và kiểm tra FK/permission IDs; Prisma migrate diff không có khác biệt.

## 1. Snapshot trước triển khai và khoảng trống đã xử lý

Bảng này giữ snapshot **trước triển khai** để truy vết phạm vi; implementation hiện tại và bằng chứng nằm tại §0/handoff.

| Thành phần | Quan sát từ source trước triển khai | Công việc đã bổ sung |
|---|---|---|
| Backend | NestJS/TypeScript; workspace thực thi gồm gateway, identity và runtime | Hai tính năng thuộc Identity; không cần service media riêng |
| Database | Prisma/PostgreSQL; User chưa có avatar, Organization chưa có cover | Migration metadata ảnh, upload intent, reset challenge và mail job |
| Auth | Argon2id, JWT 15 phút, refresh session 7 ngày; register/login/refresh/logout | Request OTP, verify OTP, reset password, thu hồi phiên |
| Session | Gateway JwtGuard xác thực JWT; ContextGuard chỉ nhận identity headers, không kiểm tra session trong DB | Kiểm tra sid còn hoạt động ở mọi endpoint Identity được bảo vệ |
| RBAC | Permission matrix ORG chưa có quyền cập nhật ảnh bìa | Thêm `org.profile.update`, cấp OWNER/ADMIN ở scope ORG |
| Frontend | Next.js/React; `/api/[...path]` là mock; apiClient mặc định gọi `/api` | Tích hợp API ở giai đoạn F1 sau nghiệm thu backend |
| UI | Avatar tài khoản là initials; nút quên mật khẩu chỉ bật notice | Xử lý giao diện và luồng tương tác ở F1 |
| Gateway | ProxyService JSON-only, timeout mặc định 3 giây | API ký upload và commit JSON; không chuyển file lớn qua proxy |
| Email | `.env.example` có SMTP_HOST/PORT nhưng Compose chưa có Mailpit, chưa inject SMTP vào runtime | Mailpit local, transport SMTP, mail worker và cấu hình |
| Notification | Chỉ là scaffold README, chưa có package/runtime/consumer thực thi | Không giả định đã có dịch vụ gửi mail |
| Messaging | Có outbox worker; validator/router hiện chỉ hỗ trợ 3 event nghiệp vụ | Không đưa OTP plaintext vào domain events hay dùng worker hiện tại như mail queue sẵn có |
| Tests | Có suites auth/session/security, RBAC, contract, migrations, outbox | Mở rộng backend regression và integration test qua Gateway; frontend kiểm thử ở F1 |

Nguồn chính: `services/identity-service/prisma/schema.prisma`, `src/modules/auth/auth.service.ts`, `src/common/context.guard.ts`, `src/modules/organizations/authorization.service.ts`, `gateway/src/auth/jwt.guard.ts`, `gateway/src/routes/proxy.service.ts`, `shared/libraries/runtime/src/index.ts`, `frontend/src/app/api/[...path]/route.ts`, `frontend/src/features/auth/AuthPage.tsx`, `docker-compose.yml`.

## 2. Thiết kế ảnh Cloudinary

### Luồng đã triển khai

1. API client/test script chuẩn bị access token và file ảnh test.
2. Client gọi endpoint tạo upload intent qua Gateway. Identity kiểm tra session, quyền, quota và sinh public_id ngẫu nhiên cố định cho intent.
3. Identity ký tập tham số upload do server xác định: preset, public_id, timestamp, overwrite=false. Không ký tùy ý tham số client gửi lên.
4. Client gửi multipart/form-data trực tiếp đến Cloudinary image/upload với tham số đã ký; không gửi Authorization của Lamu cho Cloudinary. Kiểm thử bằng script/curl/Postman, không cần giao diện upload.
5. Client gửi intent_id tới endpoint commit qua Gateway. Identity tra asset bằng expected_public_id đã lưu trong intent (asset_id chỉ có sau upload), xác minh đúng image, định dạng, kích thước và namespace; không tin URL/bytes/public_id do client tự khai báo. Sau xác minh lưu asset_id từ provider.
6. Trong transaction, kiểm tra lại session/quyền, intent chưa hết hạn/chưa dùng, cập nhật tham chiếu ảnh và đánh dấu intent đã dùng. Dùng revision/CAS để tránh hai lần upload ghi đè âm thầm.
7. Sau commit, job dọn ảnh cũ có retry; không xóa ảnh cũ trước khi DB thành công. Job định kỳ xóa asset từ intent bỏ dở, chỉ xóa asset không còn được tham chiếu.

Upload intent có thời hạn ứng dụng đề xuất 10 phút. Đây không phải cam kết chữ ký Cloudinary tự hết hiệu lực sau 10 phút; vẫn cần cleanup upload trễ và kiểm tra hạn ở commit.

### Thông tin cần chốt để hoàn thiện chức năng — đã chốt

Người dùng đồng ý các mặc định đã đề xuất và cập nhật yêu cầu avatar hiển thị hình tròn. Các chính sách sau là yêu cầu triển khai:

| Nội dung | Quyết định |
|---|---|
| Quyền xem ảnh | Avatar và cover công khai qua URL CDN |
| Quyền sửa avatar | Chính user đó, session còn hợp lệ |
| Quyền sửa cover | OWNER/ADMIN có permission org.profile.update ở đúng organization |
| Định dạng | JPEG, PNG, WebP |
| Dung lượng | Avatar tối đa 5 MiB; cover tối đa 10 MiB |
| Thay ảnh | Lưu tham chiếu ảnh mới thành công rồi dọn ảnh cũ |
| Xóa ảnh | Gỡ tham chiếu DB và đưa asset vào cleanup job |
| Avatar hiển thị | Hình tròn; ảnh nguồn cho hiển thị tỷ lệ 1:1, kích thước 256/512 px, áp dụng mặt nạ tròn ở frontend khi tích hợp F1 |
| Cover hiển thị | Tỷ lệ 3:1, responsive |

Yêu cầu hình dạng là hợp đồng bàn giao cho F1, không kéo công việc frontend vào P0–P5. File đầu vào không bắt buộc phải vuông hoặc đúng 3:1; bản hiển thị có thể được crop theo tỷ lệ đã chốt. Backend có thể lưu ảnh gốc và cung cấp bản avatar 1:1; frontend hiển thị hình tròn bằng mặt nạ/CSS, không bắt buộc lưu file có nền trong suốt hoặc cắt tròn ảnh gốc.

### Chi tiết kỹ thuật ảnh

- Avatar: JPEG/PNG/WebP, tối đa 5 MiB, bản ảnh 1:1 kích thước 256/512 px để hiển thị hình tròn ở F1.
- Cover: JPEG/PNG/WebP, tối đa 10 MiB; khung hiển thị ban đầu 3:1, responsive.
- Kiểm tra thêm giới hạn số pixel; chưa hỗ trợ SVG, GIF động hoặc video.
- Enforce allowed formats bằng preset và kiểm tra lại trên server. Backend kiểm tra bytes/pixel của asset trước commit; không chỉ tin giá trị client gửi. Với upload trực tiếp, kiểm tra sau upload không chặn file tới Cloudinary: asset quá giới hạn phải bị từ chối commit và đưa vào cleanup. Chỉ coi preset có giới hạn dung lượng trước upload khi đã xác minh cấu hình và test thực tế; các biến MAX_BYTES của ứng dụng không tự tạo giới hạn trên Cloudinary.
- Public_id không chứa email/tên người; phân tách môi trường và loại ảnh.
- Avatar và cover được coi là ảnh công khai qua CDN. Nếu cần ảnh riêng tư, phải đổi sang cơ chế authenticated delivery trước triển khai.
- URL HTTPS có version; lưu `asset_id`, `public_id`, `version`, `secure_url`, format, bytes, width/height để xác minh và xóa đúng asset. Có thể gom vào bảng MediaAsset; User/Organization lưu FK nullable.
- Thêm MediaUploadIntent gồm owner, target, purpose, expected_public_id, expires_at, consumed_at, expected_revision. FK/constraint phải bảo đảm đúng target cho từng purpose.
- Khi xóa ảnh: bỏ tham chiếu trong DB và trở về initials/default cover; xóa Cloudinary qua cleanup job. Không cho client yêu cầu xóa public_id bất kỳ.

### API đã triển khai, qua Gateway

| Method | Path | Mục đích |
|---|---|---|
| POST | `/api/users/me/avatar/upload-intents` | Cấp chữ ký cho avatar của chính mình |
| PUT | `/api/users/me/avatar` | Commit intent đã upload |
| DELETE | `/api/users/me/avatar` | Gỡ avatar |
| POST | `/api/organizations/:id/cover/upload-intents` | Cấp chữ ký, yêu cầu org.profile.update |
| PUT | `/api/organizations/:id/cover` | Commit, kiểm tra lại quyền |
| DELETE | `/api/organizations/:id/cover` | Gỡ cover |

Response GET profile, organization detail/list/public cần bổ sung URL ảnh nullable theo nhu cầu hiển thị. Không expose metadata quản trị Cloudinary ra public response. Commit hỗ trợ idempotency; không tái sử dụng IdempotencyRecord hiện tại nguyên trạng vì bảng này bắt buộc target_organization_id.

## 3. Quên mật khẩu qua OTP email

### API và luồng kiểm thử backend

| Method | Path | Input / kết quả |
|---|---|---|
| POST | `/api/auth/forgot-password` | email; trả 202 và thông báo chung, bất kể email có tồn tại |
| POST | `/api/auth/verify-reset-code` | email + code; trả reset_token ngắn hạn khi hợp lệ |
| POST | `/api/auth/reset-password` | reset_token + new_password; đổi mật khẩu và hủy phiên |

Luồng kiểm thử: gọi forgot-password → lấy mã từ Mailpit/hộp thư test → gọi verify-reset-code → dùng reset_token gọi reset-password → kiểm tra đăng nhập bằng mật khẩu mới và từ chối mật khẩu/phiên cũ. Reset token truyền trong JSON body, chỉ giữ trong bộ nhớ test, không đưa vào URL hoặc log. Gửi lại dùng endpoint forgot-password và cooldown do server quyết định. Thiết kế màn hình và luồng tương tác frontend thực hiện ở F1.

### Quy tắc đã triển khai

- OTP 6 chữ số, sinh bằng crypto.randomInt, giữ cả số 0 đầu; hiệu lực 10 phút.
- Tối đa 5 lần nhập sai/challenge; cooldown gửi lại 60 giây; quota ban đầu 5 lần/giờ/email và 20 lần/giờ/IP, điều chỉnh bằng cấu hình.
- Rate limit theo email đã normalize và IP đáng tin cậy, dùng storage dùng chung/DB để không mất khi restart hoặc nhân replica. Limiter memory hiện tại chỉ là lớp bổ sung. Không tin X-Forwarded-For từ client; định nghĩa trusted proxy và propagation rõ ràng.
- Không khóa tài khoản đăng nhập vì người khác spam recovery. Email không tồn tại/bị khóa vẫn nhận response chung với thời gian phản hồi tương đương.
- Lưu HMAC của challenge_id + code với secret riêng; không chỉ SHA256 mã 6 số. Không log OTP/token/password/email body.
- PasswordResetChallenge lưu user_id, code_digest, expires_at, failed_attempts, verified_at, consumed_at, generation. Gửi lại hủy challenge/token trước đó; giới hạn thử phải không bị reset vô hạn nhờ resend.
- Verify đúng: consume quyền dùng OTP và cấp token ngẫu nhiên 32 byte, lưu digest SHA256, hiệu lực 5 phút, purpose chỉ reset password. Verify lặp không được phát nhiều token.
- Reset: hash password bằng cấu hình Argon2id hiện tại; trong một transaction khóa user/challenge, kiểm tra token/expiry/status, cập nhật password, consume token, vô hiệu các challenge khác và revoke tất cả refresh sessions.
- Login/refresh/reset cần quy ước khóa nhất quán để tránh login đang chạy tạo phiên bằng mật khẩu cũ sau khi reset đã revoke. Retry deadlock có giới hạn; kiểm thử concurrency bắt buộc.
- Bổ sung kiểm tra session sid, user_id, revoked_at, expires_at và user status trên mọi endpoint Identity cần đăng nhập. Nhờ đó access token cũ cũng bị từ chối ngay sau reset; chỉ revoke refresh token là chưa đủ với code hiện tại. Các service tương lai phải tuân thủ cùng hợp đồng session validation.
- Không tự đăng nhập sau reset; gửi thông báo mật khẩu đã thay đổi, không chứa mật khẩu.

### Gửi email và ranh giới service

Giai đoạn 1 — hoàn thiện trong Identity: Identity sở hữu challenge, reset token, mail adapter/worker, template email và durable mail jobs riêng trong identity_db. Worker dùng SMTP để gửi OTP và thông báo đổi mật khẩu. Tính năng phải chạy được khi Notification và RabbitMQ không hoạt động; mail jobs giai đoạn này được worker đọc trực tiếp từ identity_db. Ghi ADR xác nhận ranh giới tạm thời và kế hoạch tách delivery.

Tách module recovery khỏi module email delivery ngay trong Identity. Recovery ghi yêu cầu gửi qua abstraction có thể tham gia cùng transaction DB; worker gọi interface transport như `SecurityMailSender`. Implementation ban đầu là SMTP adapter. Không gọi SMTP trực tiếp trong auth controller/service hoặc chờ SMTP hoàn thành trước khi trả response 202.

Tạo challenge và mail job trong cùng transaction; worker gửi ngoài transaction, có lease, timeout, retry giới hạn, trạng thái failed và bỏ qua job hết hạn/đã bị thay thế. Dữ liệu cần gửi chứa OTP phải được mã hóa authenticated encryption bằng key riêng; xóa ciphertext khi gửi xong/hết hạn. Mailbox local là nơi xem OTP, không in mã ra log.

SMTP có thể gửi lặp khi worker crash sau khi nhà cung cấp nhận mail: cùng job dùng cùng mã, dedupe phía provider nếu hỗ trợ; không tuyên bố exactly-once. Worker không gửi lại mã đã hết hạn. Email đến trễ vẫn có thể xảy ra, vì vậy template email cần nói rõ chỉ mã mới nhất có hiệu lực.

Giai đoạn 2 — chuyển delivery sang Notification, chỉ thực hiện sau khi giai đoạn 1 được nghiệm thu:

| Trách nhiệm | Vị trí sau chuyển đổi |
|---|---|
| Sinh OTP, digest, TTL, số lần thử, resend/rate limit | Identity |
| Xác minh OTP, cấp/consume reset token, đổi mật khẩu, thu hồi phiên | Identity |
| Ghi yêu cầu gửi bền vững cùng transaction tạo challenge | Outbox riêng cho yêu cầu email tại Identity |
| Template, SMTP/provider adapter, retry delivery, trạng thái gửi | Notification và notification_db |

1. Bổ sung runtime, package, DB/migration, Dockerfile và worker/consumer cho Notification. Chốt private command contract có version, `message_id`, `challenge_id`, generation, expiry, template và payload nhạy cảm được mã hóa; thiết lập quyền truy cập và quản lý key. Không publish OTP vào exchange domain events chung.
2. Thay đường delivery SMTP tại Identity bằng dispatcher chuyển yêu cầu bền vững sang Notification; giữ cơ chế transaction outbox và retry khi broker/Notification gián đoạn. Notification dedupe theo message_id và gửi cùng mã khi retry.
3. Giữ tương thích ba API recovery để client không phụ thuộc vị trí gửi email. Notification không đọc trực tiếp identity_db; không nhận password_hash, reset token hoặc key HMAC dùng xác minh OTP.
4. Bổ sung cơ chế thông báo hủy/thay thế challenge cho delivery, kiểm tra expiry trước gửi và xử lý message đến sai thứ tự. Identity luôn từ chối mã cũ dù email đã gửi/đến trễ; không coi việc hủy email là bảo đảm tuyệt đối sau khi provider đã nhận.
5. Chuyển SMTP credentials/template sang Notification. Với mail jobs tồn đọng, drain worker cũ hoặc chuyển có kiểm soát theo message_id; mỗi job chỉ có một đường delivery chủ động. Có kế hoạch rollback, không bật đồng thời hai đường gửi cho cùng job.
6. Chạy lại recovery E2E và kiểm thử broker outage, duplicate, expiry, restart, resend trước khi gỡ SMTP adapter/worker khỏi Identity. Xóa ciphertext/key cũ sau khi hết dữ liệu phụ thuộc theo chính sách retention.

## 4. Setup cần chuẩn bị

### Cloudinary

1. Tạo account/product environment cho development; tách production khi deploy.
2. Lấy cloud name, API key và API secret từ Console; chỉ secret ở backend.
3. Tạo hai signed upload presets cho avatar/cover, giới hạn format theo chính sách trên; khóa tham số trong code ký. Dung lượng/pixel được kiểm tra ở backend trước commit; xác minh riêng khả năng giới hạn trước upload của Cloudinary, không giả định Console có trường cấu hình này.
4. Chuẩn bị namespace theo môi trường, quyền upload/read metadata/destroy cho backend và theo dõi quota.
5. Cho phép network backend và API test client → Cloudinary; xác minh upload, đọc metadata, delivery URL và cleanup. Cấu hình trình duyệt sẽ xử lý ở F1.

### Đối chiếu cấu hình Cloudinary từ ảnh người dùng

Bằng chứng lịch sử: ảnh danh sách presets ngày 15/11/2026. Bảng dưới ghi nhận trạng thái trong ảnh; lần kiểm tra API sau đó đã xác nhận overwrite=false ở cả hai presets (xem §0). Chưa upload thử.

| Cấu hình trong ảnh | Đánh giá và hành động |
|---|---|
| lamu_avatar_signed / lamu_org_cover_signed | Đúng tên biến preset trong plan |
| Mode: Signed ở cả hai | Đúng thiết kế ký upload tại backend |
| Allowed formats: jpg, jpeg, png, webp | Đúng chính sách đã chốt |
| Type: upload | Phù hợp delivery công khai; còn cần xác minh không có access_control hạn chế và URL thực tế đọc được |
| Overwrite: true | Chưa khớp chính sách tránh ghi đè. Đổi preset thành false nếu cấu hình được; backend bắt buộc truyền và ký overwrite=false trong mọi upload |
| Use filename: false | Phù hợp; backend sinh public_id riêng cho mỗi intent |
| Unique filename: false | Có thể giữ; tham số này chỉ liên quan khi use_filename=true, không thay thế trách nhiệm sinh ID duy nhất của backend |
| Use filename as display name: true | Có thể giữ; display name trong Console tách biệt public_id/URL. Backend có thể truyền display_name từ ID do server sinh để không phụ thuộc tên file đầu vào |
| Use asset folder as public id prefix: false | Có thể giữ; backend quản lý public_id đầy đủ và asset_folder riêng khi dùng dynamic folders |
| Default preset để trống | Phù hợp; mỗi request chỉ định upload_preset tương ứng |

Kết luận sau kiểm tra API: hai presets đúng tên, Signed, allowed formats và overwrite=false. Ảnh cũ hiển thị true đã được thay thế bằng bằng chứng API; request có chữ ký phải ép false ngay cả khi preset còn true. Signed request có tham số ưu tiên hơn preset theo [Cloudinary upload preset precedence](https://cloudinary.com/documentation/upload_presets); cần test upload trùng public_id để xác nhận không thay nội dung asset cũ.

Ảnh chưa chứng minh cloud name/credentials hợp lệ, dung lượng/pixel limits, đường dẫn asset folder, transformation hoặc quyền truy cập URL. Các mục này cần kiểm tra khi tích hợp. Tùy chọn asset_folder gợi ý dynamic folder mode nhưng vẫn xác minh environment trước khi chọn tham số SDK. Không coi việc có preset là đã hoàn thiện tích hợp backend.

Nguồn giải thích naming/overwrite: [Cloudinary Upload API](https://cloudinary.com/documentation/image_upload_api_reference). Chưa thay đổi cấu hình trên Cloudinary Console trong lần cập nhật plan này.

### Email local

1. Thêm Mailpit service vào Compose, cùng network với worker; pin version/image khi triển khai.
2. Worker trong Docker dùng SMTP_HOST=mailpit, SMTP_PORT=1025; không auth/TLS cho môi trường local này.
3. Publish web UI Mailpit lên 127.0.0.1:8025. Chỉ publish SMTP 127.0.0.1:1025 nếu chạy backend ngoài Docker; khi đó SMTP_HOST=localhost.
4. Mailpit chỉ giữ email để test, không gửi vào hộp thư Gmail thật.

Giai đoạn 1 thêm process/container `identity-mail-worker` dùng code Identity và identity_db; cấu hình SMTP đặt tại worker này. API Identity cần key mã hóa mail job và key HMAC OTP; worker chỉ nhận key cần giải mã mail job cùng SMTP credentials. Notification chưa cần được khởi chạy. Giai đoạn 2 chuyển cấu hình SMTP và phần delivery sang Notification theo lộ trình ở §3.

### Email thật

Phương án đã chọn: Gmail SMTP, không yêu cầu mua domain. Account gửi cần bật xác minh hai bước và tạo App Password; dùng SMTP_HOST=smtp.gmail.com, SMTP_PORT=465, SMTP_SECURE=true. SMTP_USER là Gmail đầy đủ, SMTP_PASSWORD là App Password, MAIL_FROM dùng tên hiển thị Lamu và cùng địa chỉ Gmail (hoặc alias đã được xác minh).

Đã xác thực SMTP thành công, chưa kiểm thử delivery vào inbox/spam. Không gửi email thật trong test tự động. Khi test delivery cần chỉ định hộp thư nhận và gửi có chủ đích; không coi AUTH thành công là chứng minh MAIL_FROM được chấp nhận. Notification chưa tham gia luồng này.

### Biến môi trường dự kiến

Các tên mới dưới đây là thiết kế, chưa được ứng dụng đọc:

```dotenv
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
CLOUDINARY_AVATAR_UPLOAD_PRESET=lamu_avatar_signed
CLOUDINARY_ORG_COVER_UPLOAD_PRESET=lamu_org_cover_signed
CLOUDINARY_ASSET_PREFIX=lamu/development
MEDIA_UPLOAD_INTENT_TTL_SECONDS=600
AVATAR_MAX_BYTES=5242880
ORG_COVER_MAX_BYTES=10485760

SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=
SMTP_PASSWORD=
MAIL_FROM="Lamu <same-address-as-SMTP_USER@gmail.com>"
PASSWORD_RESET_OTP_HMAC_KEY=
MAIL_JOB_ENCRYPTION_KEY=
PASSWORD_RESET_OTP_TTL_SECONDS=600
PASSWORD_RESET_TOKEN_TTL_SECONDS=300
PASSWORD_RESET_MAX_ATTEMPTS=5
PASSWORD_RESET_RESEND_COOLDOWN_SECONDS=60
PASSWORD_RESET_EMAIL_HOURLY_LIMIT=5
PASSWORD_RESET_IP_HOURLY_LIMIT=20
```

Sinh hai key độc lập bằng CSPRNG, tối thiểu 32 byte; định nghĩa encoding và key rotation trong config validator. Không dùng JWT_SECRET thay thế. Chỉ backend/worker cần secret; không tạo biến NEXT_PUBLIC cho secret hoặc SMTP credentials.

Root `.env` không tự được đưa vào container: environment đã khai báo cho từng process trong Compose, với runtime validation và defaults trong `.env.example`. `scripts/init-local-env.cjs` hiện không ghi đè `.env` đã có; khi bổ sung biến vào môi trường hiện có phải giữ credentials; script hiện đã sinh hai key recovery cho file mới.

Giai đoạn hiện tại nghiệm thu qua Gateway bằng API client/test script. Bàn giao OpenAPI/generated types, request mẫu, auth headers, error codes, cooldown và hướng dẫn upload có chữ ký để frontend tích hợp sau. Routing/proxy backend và truyền header bảo mật thuộc P0–P5; cấu hình tích hợp trình duyệt, CORS theo origin frontend và hành vi UI thuộc F1.

Dependencies thực tế: Nodemailer 10.5.0 và @types/nodemailer 7.0.11 được pin/lock; Cloudinary dùng REST HTTPS + crypto Node, không cần thêm SDK. Cả build Node 24 và production audit đã PASS.

## 5. Thứ tự triển khai và nghiệm thu

| Mốc | Công việc | Điều kiện hoàn thành |
|---|---|---|
| P0 | Chốt recovery contracts/schema và ADR Identity gửi email trước, Notification tiếp nhận delivery sau | OpenAPI Identity/Gateway đồng bộ, generated types/check scripts cập nhật |
| P1 | Gateway routes, Mailpit/config; session validation và khóa login/refresh/reset | Auth/RBAC cũ hoạt động qua API Gateway, revoked sid bị từ chối |
| P2 | Challenge/token/mail jobs trong identity_db, SMTP adapter và identity-mail-worker, recovery API | OTP hết hạn/sai/replay/resend/concurrency và mail failure đều được kiểm thử |
| P3 | Regression auth/session, migration upgrade và Compose integration test qua Gateway/Mailpit | Nghiệm thu backend recovery khi Notification/RabbitMQ không chạy; mật khẩu cũ và phiên cũ bị từ chối, mật khẩu mới đăng nhập được |
| P4 | Media contracts/routes, migration media/intent/revision, permission migration, Cloudinary adapter và cleanup | API upload/replace/delete đúng quyền; GET trả ảnh đã lưu sau restart; lỗi provider/DB được xử lý |
| P5 | Regression hai chức năng backend, cập nhật handoff/docs, request mẫu và bằng chứng | Cả media và recovery được nghiệm thu bằng API/integration test, không phụ thuộc frontend |
| F1 — giai đoạn sau | Tích hợp API backend đã nghiệm thu vào frontend, thiết kế luồng/giao diện và kiểm thử UI | Hoàn thiện trải nghiệm avatar/cover và recovery trên giao diện |
| N1 — giai đoạn sau | Tách email delivery sang Notification theo §3; triển khai và kiểm thử chuyển đổi | Recovery API giữ tương thích; delivery chịu được retry/duplicate/outage; SMTP được gỡ khỏi Identity sau chuyển đổi thành công |

P0–P5 là phạm vi backend hiện tại: hoàn thiện recovery trước tại P3, tiếp tục media tại P4 và nghiệm thu cả hai tại P5. P0–P3 không phụ thuộc Cloudinary; toàn bộ P0–P5 không phụ thuộc frontend hay Notification. Mailpit chứng minh recovery local; gửi vào hộp thư thật cần thêm smoke SMTP với cấu hình provider. F1 bắt đầu sau P5. N1 chỉ bắt đầu sau nghiệm thu recovery, được lên lịch ở giai đoạn sau và không chặn nghiệm thu backend hoặc tích hợp frontend.

Migration quyền phải hoạt động trên DB đã triển khai, không chỉ demo seed. Seed hiện gán ID theo thứ tự permission: thêm cuối hoặc dùng ID ổn định, không chèn giữa gây drift. Không sửa migration cũ.

Test media: file quá lớn/sai loại, chữ ký sai, intent hết hạn/dùng lại, asset của người khác, member mất quyền giữa ký và commit, upload song song, Cloudinary timeout, DB commit lỗi, xóa asset thất bại, cleanup không xóa asset đang dùng.

Test recovery: email không tồn tại trả cùng response, normalize email, rate limits nhiều replica, sai đủ lần, resend vô hiệu mã cũ, token hết hạn/reuse, reset đồng thời chỉ một lần thành công, session cũ bị từ chối, login/refresh race, mail retry/crash/expiry. Test không gửi mail thật mặc định.

Chạy contract checks, backend typecheck/tests cần DB theo script hiện có; regression M3 nếu thay messaging dùng chung. Integration test qua Gateway dùng Mailpit để lấy OTP và hoàn thành toàn bộ recovery bằng API. Smoke Cloudinary bằng API test client với tài khoản development và tự dọn asset test. Chạy production SMTP smoke có kiểm soát tới hộp thư test được chỉ định. Frontend typecheck/build và UI E2E thuộc F1.

## 6. Rà soát bằng ECC và checklist sẵn sàng triển khai

Phần rà soát ban đầu bên dưới là snapshot trước triển khai. Các checklist đã được thực hiện; bằng chứng nghiệm thu cập nhật tại §0 và REPORT_MEDIA_RECOVERY_01.md. Các skill đã áp dụng:

- `ecc:security-review`: OTP, secret, session, upload, input validation và quyền truy cập.
- `ecc:database-migrations`: migration Prisma/PostgreSQL, constraints, nâng cấp DB đang có và rollback.
- `ecc:contract-first`: Identity là nguồn OpenAPI chính; Gateway là projection, types sinh từ contract.

### Các khoảng trống cần giải quyết trong implementation

| Mức ưu tiên | Phát hiện từ source/plan | Hành động bắt buộc |
|---|---|---|
| P1 | ContextGuard chỉ kiểm tra hình thức identity headers; JwtGuard không tra session | Validate session và user status từ DB, fail closed khi DB lỗi. Identity chỉ nhận traffic nội bộ đáng tin cậy; Gateway loại header do client giả mạo |
| P1 | Login verify hash rồi tạo session ngoài transaction; refresh khóa session/user | Thống nhất thứ tự khóa user → session → challenge/job khi cần; login recheck hash/status sau khi lấy khóa user. Không giữ khóa DB khi chạy Argon2 hoặc gọi provider; nếu hash đã đổi phải xác minh lại hoặc từ chối |
| P1 | ProxyService chỉ chuyển một tập header cố định, chưa truyền IP tin cậy | Gateway lấy IP theo cấu hình trusted proxy tường minh, ghi đè header nội bộ cho IP; Identity dùng header đó chỉ từ Gateway. Không dùng IP container Gateway làm IP của tất cả client |
| P1 | ProxyService luôn upstream.json(), không chuyển Retry-After | Chốt response JSON cho reset/delete ở P0; nếu dùng 204 phải sửa proxy xử lý body rỗng. Allowlist Retry-After và Cache-Control, không forward tùy ý mọi upstream header |
| P1 | Giới hạn sai OTP mới mô tả theo challenge, resend có thể tạo challenge mới | Bổ sung bộ đếm verify theo email/IP dùng chung, cập nhật nguyên tử; không reset ngân sách thử theo cửa sổ khi resend. Áp dụng cả email không tồn tại để tránh dò tài khoản |
| P1 | Intent hết hạn ứng dụng trước chữ ký provider; asset có thể xuất hiện sau cleanup | Giữ tombstone và quét lại public_id cho tới khi hết cửa sổ chữ ký provider cộng thời gian đệm. Không đánh dấu cleanup hoàn tất vĩnh viễn chỉ vì lần tra đầu trả not-found |
| P2 | Cleanup mới mô tả nguyên tắc, chưa có trạng thái chống race với commit | Ghi cleanup job bền vững cùng transaction đổi/gỡ tham chiếu; claim bằng lease và chuyển asset sang trạng thái deleting nguyên tử. Commit không được gắn asset deleting; worker kiểm tra tham chiếu và đúng namespace trước destroy |
| P2 | Chưa có giới hạn pixel/quota upload cụ thể | Mặc định triển khai 40 triệu pixel/ảnh, tối đa 10 intent chưa hết hạn/user và 30 intent/giờ/user bằng DB; kiểm tra một frame để loại ảnh động. Có thể điều chỉnh qua cấu hình có validation |
| P2 | HTTP timeout Gateway mặc định 3 giây, metadata provider có thể lâu hơn | P4 đặt ngân sách request/provider rõ ràng, timeout adapter ngắn hơn upstream và giới hạn retry. Test commit bị timeout nhưng DB đã thành công và client retry |
| P2 | Config preflight chỉ đọc file local | Runtime validator tách theo process, không bắt mail worker có JWT/Cloudinary hoặc API có SMTP credentials. Mailpit cho phép không auth/TLS chỉ ở local/test; Gmail yêu cầu TLS có kiểm tra chứng chỉ |

Các khoảng trống trong bảng đã được xử lý ở P0–P5; đây không phải kết luận đã có khai thác thực tế.

### P0: contract và mô hình dữ liệu trước handler

- [x] Chỉnh `shared/contracts/http/identity.openapi.json` trước implementation; sinh Gateway bằng `node scripts/contract-projection.cjs`, sinh types bằng `npm run generate:contracts`. Catalog chỉ đánh dấu API hoạt động khi có handler và kiểm thử.
- [x] Recovery public endpoints có `x-gateway-auth=false`; media cần bearer/session. DTO dùng validator hiện có, từ chối field thừa, code là string đúng 6 chữ số, token có giới hạn độ dài, new_password dùng cùng chính sách register. Email normalize tương thích CITEXT/register, không tự xóa dấu chấm hoặc phần +alias Gmail.
- [x] Chốt status/body: forgot 202 chung, verify 200, reset 200 JSON status OK; delete media 200 JSON status OK để tương thích proxy. Dùng envelope lỗi hiện có, phân biệt 400 validation, 401 session, 403 permission, 409 revision/intent conflict, 429 throttle, 502/503 provider và 504 timeout. Mã OTP/token không hợp lệ, hết hạn, đã dùng trả thông báo chung, không tiết lộ user/challenge.
- [x] Forgot trả cùng 202 trong cooldown/quota theo email; throttle IP có thể trả 429/Retry-After độc lập sự tồn tại user. Verify/reset có limiter riêng, trả Cache-Control: no-store cho response chứa token/chữ ký; request body và SMTP/provider exceptions không được lọt vào log.
- [x] Upload response khai báo đúng upload URL, cloud name/API key công khai, tập params đã ký, intent_id, expires_at và expected_revision; không trả API secret. Commit nhận intent_id; replay intent đã thành công trả cùng kết quả cho đúng actor/target, không gắn lại ảnh đã bị thay thế.
- [x] GET user/org bổ sung URL nullable và revision dạng string nếu lưu BigInt; serializer và test response thật phải khớp contract, không cast để bỏ qua sai kiểu.
- [x] Chốt bảng challenge, token, mail job, rate-limit bucket, media asset, intent và cleanup job; unique digest/public_id/asset_id và idempotency, CHECK purpose/target, FK và index expiry/status/next_attempt_at. Password reset không dùng IdempotencyRecord chung để cache reset_token plaintext.

### P1–P4: chuẩn bị migration và worker

- [x] Tạo migration additive riêng cho recovery rồi media, User/Organization có FK ảnh nullable và revision có default; không sửa migrations cũ. Tách migration dữ liệu permission khỏi DDL; tạo quyền cho DB hiện hữu và role OWNER/ADMIN mới tạo sau đó.
- [x] Tạo migration ở database development riêng, dùng `prisma migrate deploy` khi triển khai; không chạy migrate reset/db push trên DB hiện tại. Test fresh DB và upgrade từ schema trước với user/session/membership đang có.
- [x] Rà lock_timeout/statement_timeout cho ALTER bảng hiện hữu; index lớn cần concurrent ngoài transaction và có phương án xử lý index invalid khi lỗi. Index của bảng mới có thể tạo bình thường.
- [x] Rollback ứng dụng giữ schema additive, dừng worker mới và giữ dữ liệu pending để phục hồi; sửa schema bằng forward migration. Đánh dấu reset password và email đã gửi là hành động không thể đảo ngược bằng rollback DB. Đã tài liệu hóa yêu cầu backup/restore trước deploy môi trường có dữ liệu quan trọng; **chưa chạy production backup/restore drill vì không deploy trong phiên này**.
- [x] Mail job mã hóa AES-256-GCM với nonce ngẫu nhiên riêng từng payload, auth tag và AAD gắn job/challenge/generation; lưu key_id để đọc key cũ khi rotation. OTP HMAC so sánh timing-safe sau khi kiểm tra độ dài. Không rotate key đang dùng mà bỏ key giải mã jobs pending.
- [x] Mail worker claim bằng lease/skip locked, gửi ngoài transaction, chỉ hoàn thành job nếu còn lease owner; backoff có jitter, timeout và số lần thử hữu hạn. Kiểm tra expiry/generation ngay trước gửi, chấp nhận race email đã được provider nhận; verify luôn từ chối mã cũ.
- [x] Clear ciphertext khi sent/cancelled/expired/failed terminal; retry cần nội dung chỉ trong TTL. Dọn token/challenge/jobs và limiter buckets theo retention xác định, giữ audit không chứa OTP/token/body. Theo dõi queue age, số retry/failed và cleanup backlog.
- [x] Thêm identity-mail-worker với config/entrypoint riêng, không dùng messaging/config.ts vì config đó bắt buộc RabbitMQ. Cleanup media cũng có process/lịch chạy được khai báo và kiểm thử restart; không dựa vào callback in-memory sau response.
- [x] Thêm Compose test override riêng cho Mailpit, chỉ bind UI local; không thay Gmail credentials trong .env của người dùng. Pin dependency/version và lockfile khi thêm SDK; kiểm tra dependency security sau khi cài, không tự chạy audit fix hàng loạt.

### Thứ tự chạy và bằng chứng cần lưu

1. Sau P0: `npm run contracts:check`, `npm run generate:contracts`, review diff contract/types và kiểm tra không drift Gateway projection.
2. Sau P1/P2: build/typecheck; test invalid config theo process, auth/session race, DB upgrade và worker failure/restart với provider giả lập/Mailpit.
3. P3: qua Gateway hoàn thành forgot → verify → reset → login mới; chứng minh phiên cũ bị từ chối và không cần RabbitMQ/Notification. Kiểm tra sai OTP/resend, token reuse, limiter nhiều replica và header IP giả mạo.
4. P4/P5: fake adapter test quyền/race/failure trước, sau đó smoke Cloudinary development upload → metadata → commit → replace/delete → cleanup. Dùng public_id ngẫu nhiên trong namespace test; ghi nhận và dọn cả khi test thất bại. Test upload trễ sau lần cleanup đầu và commit retry sau timeout.
5. Gmail smoke đã được người dùng cho phép và đã gửi đúng một email tới SMTP_USER; ghi thời gian/status, không ghi credentials/OTP/token. Cập nhật §0 bằng kết quả thực tế; chỉ đánh dấu mốc hoàn tất sau bằng chứng kiểm thử tương ứng.

Kết quả hiện tại: P0–P5 hoàn tất theo bằng chứng trong báo cáo. Checklist không thay thế contract machine-readable hoặc giới hạn bằng chứng provider đã ghi.

## 7. Tài liệu nhà cung cấp đã đối chiếu

- Cloudinary upload/signing: https://cloudinary.com/documentation/upload_images
- Cloudinary Upload API: https://cloudinary.com/documentation/image_upload_api_reference
- OWASP recovery: https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html
- Gmail App Password: https://support.google.com/accounts/answer/185833
- Gmail SMTP: https://developers.google.com/workspace/gmail/imap/imap-smtp

Implementation đã bổ sung code backend, contracts, migrations, workers và tests; giữ nguyên secret/.env và database hiện có. Database test và assets synthetic do phiên này tạo đã được dọn.


## 8. Checkpoint bàn giao P5

Recovery được nghiệm thu trước khi triển khai media. Không có blocker backend còn mở. Các giới hạn có chủ đích: public CDN; direct-upload giới hạn sau upload; SMTP at-least-once và chưa xác minh inbox; Identity chỉ nhận traffic nội bộ đáng tin; F1/N1 chưa triển khai. Password/email không rollback được; schema rollback bằng forward migration. Bằng chứng, coverage và các lần thử phát hiện lỗi đã sửa nằm trong report, không coi các lần thất bại ban đầu là PASS.
