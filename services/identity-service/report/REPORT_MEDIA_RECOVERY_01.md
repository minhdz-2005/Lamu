# Báo cáo nghiệm thu backend recovery và media — P0–P5

Ngày: 15/11/2026, Asia/Saigon. Kết quả: **P0–P5 PASS trong phạm vi backend local đã cho phép**. Không deploy production, commit/push hoặc migration database hiện tại. F1 frontend và N1 Notification chưa triển khai.

## Implementation

| Phần | File chính |
|---|---|
| Contracts | `shared/contracts/http/identity.openapi.json` v1.4.0; Gateway projection và generated types |
| Recovery | `src/security/recovery.service.ts`, `recovery.controller.ts`, `crypto.ts`, `config.ts` |
| Email delivery | `src/security/mail.worker.ts`, `mail.main.ts`; Nodemailer 10.5.0, @types/nodemailer 7.0.11 pin trong lockfile |
| Auth/session | `src/common/context.guard.ts`, `transaction.ts`, `src/modules/auth/auth.service.ts` |
| Media | `src/media/media.service.ts`, `media.controller.ts`, `cloudinary.ts`, `cleanup.worker.ts`, `cleanup.main.ts` |
| Persistence | `prisma/schema.prisma`; migrations `202611150001_recovery`, `202611150002_media`, `202611150003_media_permission` |
| Gateway/config | `gateway/src/routes/media.controller.ts`, `auth.controller.ts`, `proxy.service.ts`, shared runtime, Compose và `.env.example` |
| Runbook | [Hướng dẫn chạy/API/worker](../../../docs/integration/media-password-recovery.md), [request mẫu](../requests/media-recovery.http), [catalog](../../../docs/api/catalog.md), [ADR 0006](../../../docs/adr/0006-media-password-recovery.md) |

Recovery dùng crypto.randomInt, HMAC secret riêng, 10 phút/5 lần sai, DB cooldown/quota; verify một lần cấp random token 32 byte sống 5 phút và chỉ lưu digest. Reset/password hash/session revoke/challenge consume/confirmation job nguyên tử. Login recheck hash/status dưới khóa user; refresh khóa user trước session; deadlock retry chỉ khi DB xác nhận transaction abort, tối đa 3 lượt. Protected Identity routes kiểm session/status trong DB; logout giữ ngoại lệ idempotent có refresh proof đúng phiên.

Mail jobs AES-256-GCM có nonce/AAD/key ID; SMTP tách khỏi API, DB polling/skip-locked/lease 60 giây, timeout gửi tổng 15 giây, retry tối đa 5 lần, terminal clear ciphertext, audit retention 7 ngày. Cleanup media có process riêng, retry/backoff và tombstone ba giờ, tránh xóa asset đang tham chiếu hoặc tranh chấp commit. Các worker có queue/backlog metrics không chứa recipient/body/token.

Media dùng signed upload, server public ID, overwrite=false; commit không nhận URL/metadata client. Xác minh metadata provider format/bytes/pixel/frame, quyền đúng organization và CAS revision. Replay trả kết quả cũ mà không gắn lại ảnh đã thay thế. GET trả URL nullable và revision string, avatar 512×512, cover 1500×500; kiểm thử restart Identity/Gateway với connection DB mới vẫn đọc đúng avatar và cover. Permission org.profile.update được migrate cho system OWNER/ADMIN hiện hữu và dùng khi tạo organization mới; seed IDs 1–10 giữ nguyên, permission mới ID 11.

## Kết quả kiểm tra local

| Lệnh / kiểm tra | Kết quả thực tế |
|---|---|
| `npm run typecheck` | PASS: runtime/Identity/Gateway build và tests typecheck |
| `npm run contracts:check` | PASS: OpenAPI hợp lệ, local references, Gateway projection khớp |
| `npm run generate:contracts` | PASS: types từ Identity, không có bản DTO công khai tự chép |
| `npm run format:check` | PASS; repository không có script lint riêng, không tự bỏ qua gate |
| `npm run test:m1` | PASS: **145 tests, 28 suites**; không failures. Một test Cloudinary opt-in bị skip ở suite thường và đã chạy PASS riêng |
| Coverage gate giữ nguyên >=80% | Statements **89.56%**, branches **85.84%**, functions **88.75%**, lines **90.64%** |
| `npm run test:security` | PASS: **23 tests, 4 suites**, bao gồm recovery/media/upgrade/adapters |
| Fresh migrations | PASS: Prisma migrate deploy toàn bộ 8 migrations vào PostgreSQL test riêng; seed chạy hai lần |
| Upgrade | PASS: áp dụng migration mới lên DB test schema cũ có user/hash/session/org/membership; giữ dữ liệu và permission IDs, cấp quyền mới; CHECK/FK được thử |
| Prisma migrate diff | PASS: database test sau deploy so với schema Prisma: **No difference detected**; đã thêm gate `--schema-check` vào scripts test |
| `npm run test:security:compose` | PASS: Gateway + Identity + mail worker + cleanup worker + Mailpit thật; mail worker restart gửi job pending, API restart giữ password mới, phiên cũ 401 |
| RabbitMQ/Notification absent | PASS: Compose acceptance kiểm danh sách container running không có hai thành phần này |
| Runtime config/preflight | PASS: `npm run check:media-recovery-env` 0 errors/0 warnings; `docker compose --profile m1 config --quiet` hợp lệ |
| `npm audit --omit=dev` | PASS: 0 vulnerabilities production |
| `npm audit` toàn bộ | 21 advisory dev (5 low, 16 moderate), không high/critical. Thuộc cây Jest/esbuild hiện hữu. So lockfile HEAD: chỉ thêm nodemailer/@types-nodemailer, không đổi version dependency cũ; không audit fix hàng loạt |
| Secret/diff review | PASS: scan chính các giá trị secret trong `.env` trên source/docs versioned/untracked không bị ignore: 0 match; git diff --check PASS |

Các container PostgreSQL/Mailpit dùng tên `lamu-m1-test-*`, tmpfs, port host ngẫu nhiên và tự dọn trong finally. Compose dùng project `lamu-security-test-*`, volume riêng và `down -v` chỉ project vừa tạo. Bản code cuối đã kiểm lại bằng run `lamu-m1-test-1794761263931`; Compose acceptance cuối ở project `lamu-security-test-1794760601568`. Không đụng volume demo hiện hữu.

## Các trường hợp đã được chứng minh

- Recovery thành công qua Gateway/Mailpit; normalize email; email không có/cooldown cùng 202; validation field/code/password; IP giả mạo không được forward; DB budget dùng chung. OTP sai đủ lần và OTP expiry, verify song song một token, token expiry/reuse, resend vô hiệu token cũ, reset song song một winner.
- Reset/login/refresh race không để lại phiên active với mật khẩu cũ; access/refresh cũ bị từ chối. Trigger fault tại bước insert confirmation job cuối transaction chứng minh rollback hash/token/session/job, rồi retry đúng token thành công.
- Mail timeout/failure retry, worker restart/expired lease, expired/replaced/failed terminal clear ciphertext; AES-GCM AAD sai bị từ chối. SMTP accepted nhưng DB completion lỗi được mô phỏng: sau lease hết hạn job gửi lại cùng OTP, phù hợp at-least-once. SMTP server local cố ý treo chứng minh timeout trong ngân sách lease; không dùng Gmail trong test.
- Media avatar/cover commit/replace/delete, nullable GET, 1:1/3:1, current permissions và organization boundary, ownership của intent, mất membership giữa signing/commit, revision conflict, song song hai upload chỉ một winner.
- Fake metadata bytes/format/pixel/pages/frames/public ID/resource type không hợp lệ đều bị từ chối. Quota pending persist trong DB, provider timeout, DB fault tại bước consume intent cuối transaction chứng minh rollback asset/reference/revision, delete provider fail/retry, active-reference protection, expired intent, tombstone bắt upload muộn sau not-found.
- Commit/cleanup chạy song song giữ ảnh đang tham chiếu. Gateway response timeout khi Identity vẫn commit: state DB COMMITTED, retry cùng intent trả kết quả cũ an toàn. Fake provider này chỉ dùng trong test. Sau đó đóng Identity/Gateway, mở lại với Prisma connection mới và xác nhận cả avatar/cover còn đúng (media suite: 8/8 PASS, run `lamu-m1-test-1794761520761`).
- Các suites auth/session/RBAC/invitations/contracts và M3 unit có trong regression đầy đủ. Không đổi event/messaging runtime; real-broker M3 riêng không chạy lại. Fixture nội bộ cũ đã được cấp session test thật; assertion access sau logout đổi từ 200 sang 401 vì yêu cầu mới, không vô hiệu test.

## Provider thật — tách biệt integration local

**Cloudinary: PASS.** `npm run smoke:cloudinary` chạy chủ động với credentials hiện có, DB test riêng, namespace ngẫu nhiên `lamu/test-smoke/*`. Test ký bằng backend; chữ ký bị sửa bị provider từ chối và không tạo asset; multipart upload static PNG, resource metadata lookup, commit/replace/replay qua Gateway, cover 3:1, delete và cleanup worker. Hai WebP frame 1×1 màu tổng hợp được ghép thành animation: provider nhận upload, metadata xác nhận format webp và đúng hai frame, backend từ chối commit 400. Metadata sau cleanup trả not-found. finally chỉ destroy các public ID chính test đã được cấp; không enumerate/xóa asset cũ hoặc overwrite. Không giữ secret/public responses trong report.

Smoke mở rộng có các lần thất bại ban đầu và đã xử lý: timeout metadata 1.8 giây quá ngắn → ngân sách provider 4 giây/Gateway media 8 giây; fixture APNG bị provider coi sai loại nên không được dùng làm bằng chứng frame validation, thay bằng valid WebP hai frame upload thành công rồi backend reject. Lượt WebP cuối (run `lamu-m1-test-1794761362810`) PASS, không đổi assertion để chấp nhận ảnh động. Provider adapter kiểm cả thời gian đọc response body.

**Gmail: SMTP acceptance PASS, inbox NOT VERIFIED.** Đã gọi `node scripts/provider-smoke.cjs gmail` đúng một lần. TLS/authentication PASS; SMTP accepted một recipient, rejectedCount=0. Recipient chỉ SMTP_USER, subject/nội dung ghi rõ test, không chứa OTP/password. Không in recipient/credentials/SMTP exception; không thay MAIL_FROM hoặc key. Không có lần gửi Gmail thứ hai. Authentication/accepted không được diễn giải là email đã vào inbox.

Cloudinary/SMTP chỉ chứng minh môi trường credentials development hiện có. Production deployment/backup restore drill không thực hiện trong phạm vi này.

## Bàn giao và giới hạn

| Mốc | Trạng thái |
|---|---|
| P0 | DONE — contracts, schema, indexes/constraints, projection/types |
| P1 | DONE — routes/config/trusted IP/session validation/auth locking |
| P2 | DONE — recovery/crypto/limiter/jobs/SMTP worker |
| P3 | DONE — Mailpit/Gateway + Compose/restart/fresh/upgrade/auth regression |
| P4 | DONE — media/permission/metadata/CAS/cleanup và Cloudinary smoke |
| P5 | DONE — tổng hợp verification, security/diff review, catalog/runbook/request/report |
| F1 / N1 | DEFERRED theo quyết định người dùng |

Không còn biến bắt buộc thiếu trong `.env` hiện có (preflight PASS). Các biến mới về timeout/quota/key ID/trusted proxy có defaults hoặc optional trong `.env.example`, không cần regenerate secret. Cấu hình SMTP chỉ ở mail worker. Không thay database/credentials hiện tại; operator tự chạy migrate/start theo runbook khi muốn dùng backend trên dữ liệu hiện hữu.

Giới hạn có chủ đích: Identity chỉ tin network nội bộ, CDN công khai, file-limit kiểm sau direct upload, signature provider có cửa sổ khác intent, SMTP có thể duplicate và inbox chưa được xác nhận. Tombstone/cleanup retry không cam kết xóa ngay khi provider outage; audit intent/result được giữ cho replay. Chưa nghiệm thu UI, Notification hoặc production. 21 cảnh báo dependency dev đã ghi rõ; hai dependency mới không tạo advisory production. Không đánh dấu những phạm vi này là đã triển khai.
