# M1 Auth/Gateway — Tổng hợp tiến độ nghiệm thu

Ngày: 13/11/2026 (Asia/Saigon). **P0–P4 đã triển khai; kiểm chứng tự động M1 PASS theo phạm vi dưới đây.** Nghiệm thu thủ công bởi người nhận/DOC-01: **NOT RUN**. Không tuyên bố hoàn tất toàn bộ Identity hoặc M2–M4. Không tự commit.

Cập nhật compiler sau cảnh báo IDE: [REPORT_M1_TYPESCRIPT_CONFIG_01.md](REPORT_M1_TYPESCRIPT_CONFIG_01.md). Node16 module resolution, typecheck và 42 tests PASS; coverage nhánh hiện tại **91.71%** (các số 95.30% bên dưới là bằng chứng lần chạy M1 trước isolated transpilation). Image/Compose chưa rebuild ở follow-up cấu hình này, không coi image IDs cũ là bản build mới.

| Bước | Báo cáo | Trạng thái | Kiểm chứng runtime |
|---|---|---|---|
| P0 | [Contract](REPORT_M1_P0_CONTRACT_01.md) | ACCEPTED M1, spec 1.0.0 / schema v1 | PASS OpenAPI/projection/schema/type generation; provider HTTP kiểm ở P2–P4 |
| P1 | [Infra/database](REPORT_M1_P1_INFRA_DATABASE_01.md) | IMPLEMENTED working tree | PASS PostgreSQL thật, migration/seed/health/Compose/network |
| P2 | [Register/login](REPORT_M1_P2_REGISTER_LOGIN_01.md) | IMPLEMENTED working tree | PASS register/login/validation/race/transaction outbox |
| P3 | [JWT/profile](REPORT_M1_P3_JWT_PROFILE_01.md) | IMPLEMENTED working tree | PASS JWT/header trust/profile/Swagger JSON |
| P4 | [Session](REPORT_M1_P4_SESSION_01.md) | IMPLEMENTED working tree | PASS rotation/logout/race/clock/security/restart/container baseline |

Nguồn triển khai: [MASTER_PLAN](../MASTER_PLAN.md), review F01–F14, handoff D00–D13, catalog, architecture và event README. D00/D04 được giữ nguyên. Người dùng chốt đề xuất P0 M1 bằng câu “chốt các đề xuất đã được đưa ra tiếp tục công việc”; [ADR 0002](../../../docs/adr/0002-m1-auth-gateway.md) ghi D01/D02/D03/D07-M1/D13 và chi tiết DTO/UserRegistered. Không tự đóng quyết định M2–M4. HEAD tham chiếu `cf58fa39aeef45be0e6085c51d23cc9fc8b4ee37`, implementation hiện ở working tree vì người dùng yêu cầu không commit. Giữ thay đổi tài liệu có sẵn trước phiên, không sửa frontend.

## Kết quả kiểm chứng và cách chạy lại

| Lệnh / gate thực sự chạy | Kết quả | Phạm vi bằng chứng |
|---|---|---|
| `npm run typecheck` | PASS, exit 0 | Build runtime/Identity/Gateway và typecheck test |
| `npm run contracts:check` / `npm run generate:contracts` | PASS | OpenAPI hợp lệ, local refs, Gateway projection, generated consumer types |
| `npm run format:check` / `git diff --check` | PASS, exit 0 | Source/test/script mới; không format lại scaffold docs |
| `npm run test:m1` | PASS: 12 suites, **42 tests**, 19.651s | Jest/Supertest, ứng dụng NestJS thật, PostgreSQL container riêng; seed hai lần, transaction/race/clock và contract response |
| Coverage trong test:m1 | PASS: statements **98.84%**, branches **95.30%**, functions **100%**, lines **99.02%** | Source ứng dụng/runtime; loại generated Prisma/main; bootstrap negative config kiểm subprocess, positive startup kiểm container |
| `npm run test:compose` | PASS, exit 0 | Project `lamu-m1-smoke-1794545235520`, app images thật, migration one-shot, auth flow, persistence, DB outage/recovery, seed và baseline |
| `npm audit --omit=dev --audit-level=moderate` | PASS: **0 vulnerabilities** | Dependency production theo lockfile; không phải OS image vulnerability scan |
| `npm audit --audit-level=moderate` | FAIL: **21 dev/tooling advisories** (5 low/16 moderate) | Jest/deepmerge/glob/minimatch và tooling esbuild; không đánh audit toàn bộ là sạch. Không dùng force downgrade Jest làm hỏng test |

Node host/container 24.19.0, npm 11.17.0, NestJS 11.2.10, Prisma/client/adapter-pg 7.10.1, Argon2 0.45.2, TypeScript 5.9.3, Jest 30.5.2. Container PostgreSQL **16.15**; [M1_COMPOSE_EVIDENCE_01.json](M1_COMPOSE_EVIDENCE_01.json) lưu image IDs. Test scripts tạo credentials ngẫu nhiên trong RAM, không ghi token/password vào report; chỉ dùng dữ liệu tổng hợp. Không reset volume demo.

Version của contract/generated types/lockfile trong working tree được ghi bằng SHA256 tại [M1_ARTIFACT_VERSIONS_01.json](M1_ARTIFACT_VERSIONS_01.json), không giả commit/PR chưa tạo.

RED/GREEN theo từng bước được ghi trong năm báo cáo: P0 thiếu artifact → schema hợp lệ; P1 thiếu module/DDL/seed → health/constraint/seed; P2/P3/P4 route 404 → handler/guard/session GREEN. Các lỗi test setup được tách khỏi RED hợp lệ. Không tạo checkpoint commit; evidence thay thế theo yêu cầu người dùng. Có phát hiện harness cổng ngẫu nhiên sau restart và prune workspace không loại dev runner; đã sửa và chạy lại gate, không tính các lần thất bại thành PASS.

## Ma trận nghiệm thu M1

| ID từ kế hoạch/review | Kết quả | Bằng chứng / giới hạn |
|---|---|---|
| INF-01/02/03/04, F11-INF-02/03 | PASS tự động | Compose sạch/migration/job exit 0, restart/redeploy giữ state, seed hai lần/outside-local rejected; invalid config process exit 1, DB down readyz 503/healthz 200 rồi hồi phục |
| AUTH-01/02/03/04, F11-AUTH-01/02 | PASS | Argon2id, register race/case, credential/LOCKED/DTO/malformed JSON đúng envelope; không cấp token/profile cho LOCKED |
| JWT-01/02/03, AC-001 | PASS | JWT thật và claims fail closed, raw duplicate Authorization, spoofed context, profile đúng user/memberships seed; user/session chỉ từ Gateway verify |
| GW-01/02, F11-GW-01/02 | PASS | Không route internal/outside allowlist; lỗi kết nối 502/timeout 504 hữu hạn, không retry mutation; upstream capture/slow fixture là stub có ghi rõ |
| SES-01–06, F11-SES-01–03 | PASS | Rotation/replay/race, tuyệt đối 7 ngày bằng clock, cặp lệch không revoke nạn nhân, retry giữ revoked_at, access còn hạn vẫn dùng được sau logout |
| EVT-01 phần register M1, AC-002 phần M1, AC-007 phần M1 | PASS | User/outbox cùng transaction, synthetic trigger failure rollback; pending backlog giữ ID/payload qua redeploy/restart, no seed events; CITEXT/FK/CHECK/nullable unique được kiểm trên PostgreSQL |
| F11-API-01 / AC-011 | PASS | Bốn auth POST success 200, response/error kiểm canonical schema, readyz/LOCKED/upstream đúng contract |
| DOC-01 / thao tác Swagger bởi người nhận | NOT RUN | Runbook/HTTP collection và Swagger JSON đã có; chưa có người nhận tái hiện độc lập hoặc browser Try it out thủ công |

Upgrade M1→M2/M3 thật không được thay bằng test migrate deploy lại cùng version. AC-002 delivery backlog M3 và các phần M2 của AC-007 vẫn NOT RUN. Không suy readiness/constraint test nhỏ chứng minh migration trên dữ liệu production-sized.

## Security review auth/session/JWT/context

- **Đạt trong M1 đã kiểm:** whitelist DTO/forbid field thừa; password không trim; Argon2id/hash-only refresh; SQL parameterized/ORM, register transaction-outbox; session rotation/revoke có khóa và kiểm owner/sid, không lộ raw token ở persistence; JWT HS256 cố định, issuer/audience/expiry/claim shape; Gateway allowlist header, raw duplicate Authorization và route isolation; Identity đọc trạng thái user hiện tại; generic 500/error envelope, log không body/header/token; startup secret validation, internal ports và non-root runtime; rate limiting auth/general.
- **Thay đổi dependency:** express-rate-limit advisory được khắc phục bằng 8.7.4 và Ajv 8.20.0. Hai image app runtime đã được kiểm không có Jest/tsx; image tools riêng cho migration/seed/benchmark vẫn có dev/tooling advisories nêu trên, dùng local/test. Không kết luận full audit hoặc OS scan PASS.
- **Giới hạn đã chốt:** access có thể sống tối đa tới exp sau logout, không access denylist/logout-all/token-family reuse revocation; giữ row/hash session, chưa cleanup; API client nhận bearer/refresh JSON theo contract M1, chưa cookie/browser CSRF/storage policy M4; trusted network chỉ local, chưa service-to-service authentication ngoài local; limiter IP/in-memory, Identity nhìn IP Gateway tổng hợp, chưa distributed/user limiter.
- Secret thực không được hardcode/commit. `.env.example` bỏ JWT placeholder yếu; generator tạo `.env` với random JWT/database password và không ghi đè file có sẵn. Không quét toàn bộ lịch sử Git hoặc OS image CVE trong lần này: NOT RUN.

## Baseline, runbook và phần chưa chạy

[Baseline Argon2 container](M1_ARGON2_BASELINE_01.txt): quota 2 CPU/256 MiB, 19456 KiB/2/1, một warmup, 20 hash+verify mỗi ca. Concurrency 1 p50/p95 **35.66/53.08ms**; concurrency 4 **98.80/110.64ms**; 0 lỗi. Đây là baseline synthetic, không SLA/end-to-end load test. OS visible CPU/memory khác quota đã được ghi rõ trong P4.

[Identity runbook](../README.md), [Gateway README](../../../gateway/README.md), [HTTP collection](../requests/m1.http), [handoff](../../../docs/integration/identity-handoff.md), [canonical HTTP contract](../../../shared/contracts/http/identity.openapi.json) và [UserRegistered schema](../../../shared/contracts/events/user-registered.v1.schema.json) đã đồng bộ. Chạy local: `node scripts/init-local-env.cjs` (chỉ khi chưa có .env), rồi `docker compose --profile m1 up --build -d --wait gateway`; Swagger `http://localhost:8080/docs`.

**NOT RUN:** manual người nhận/DOC-01, production-sized migration/backup restore, upgrade M1→M2/M3, RabbitMQ worker/delivery M3, frontend/Event/service nghiệp vụ thật M4, OS image scan. Các chức năng organization/authorization/invitation M2 chưa được triển khai; seed/fixtures không phải API M2 hoặc Event integration. Không tự commit; các thay đổi sẵn có của người dùng được giữ.
