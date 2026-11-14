# P8 — Chuẩn bị tích hợp và bàn giao Identity/Gateway

Ngày 14/11/2026, Asia/Saigon. **P8 COMPLETE trong phạm vi chuẩn bị bàn giao. M4 NOT_STARTED.** Không commit, không gửi thông tin cho thành viên khác, không đọc/in secret `.env`, không sửa frontend hoặc triển khai Event provider/HTTP adapter/business consumer.

P8 tiếp tục MASTER_PLAN hiện có; áp dụng contract-first, living-docs-governance, verification-loop và security-review. Không tìm thấy AGENTS.md ở repo root/các thư mục cha hoặc backend liên quan; đã đọc `frontend/AGENTS.md` để review frontend, không viết code Next.js. Không sửa production NestJS nên không có production fix/TDD RED–GREEN trong P8; không nhận RED/GREEN lịch sử M1–M3 là lượt mới.

## Phạm vi và nguồn đối chiếu

Đã đọc MASTER_PLAN/P8 và các giới hạn M4; báo cáo tổng M1, P5, P6/contract/acceptance và M3/P0/P7; ADR0002–0005; handoff, catalog, messaging, architecture; README Identity/Gateway; canonical Identity HTTP1.2.0, Gateway projection/generated types; ba schema/fixture Identity v1; controllers/DTO/auth/org/invitation/authorization/context/JWT/proxy; resolver interface/composition và tests; mock store/Next catch-all route, apiClient/auth/useSession/types/AuthPage; Compose/test override, Dockerfiles, Prisma/migrations và harness.

Vai trò tài liệu: architecture là map, MASTER_PLAN là scope/status, handoff là owner/dependency/integration status, ADR là lịch sử quyết định, OpenAPI/JSON Schema là payload authority, README là runbook, báo cáo này là evidence P8. Không thêm tài liệu root hoặc hệ thống kế hoạch song song. Bảng API/event chi tiết ở [handoff §7](../../../docs/integration/identity-handoff.md); frontend ở §8, D09 ở §9, runbook/checklist M4 ở §10.

Working tree ban đầu có sẵn M3/P7 source/tests/migrations/Compose/package/docs dirty và untracked; giữ nguyên. [Baseline status](P8_RUN_1794666829708/baseline-status.txt) lưu inventory trước P8. Thay đổi P8 chỉ docs, draft OpenAPI/generated types, checker draft và evidence mới. Không thay accepted Identity OpenAPI/projection/event schema, production source, migration hoặc lockfile trong lượt này. [Manifest cuối](P8_RUN_1794666829708/final-manifest.json) lưu HEAD, hash source/contracts/migrations/artifacts và status thực tế; không dùng HEAD để giả có commit cho working tree.

## Kết quả chạy mới

Runtime host Node **24.19.0**, npm **11.17.0**, Docker Engine **29.9.3**. Dependency dùng lockfile hiện có: NestJS11.2.10, Prisma/client/adapter7.10.1, TypeScript5.9.3, Jest30.5.2, openapi-typescript7.10.1. PostgreSQL **16.15**, RabbitMQ **4.4.0**. Harness dùng credentials synthetic ngẫu nhiên trong RAM, `.env.example` và project/ports/volumes riêng; không dùng/reset DB demo/shared hoặc purge backlog của người dùng.

| Lệnh thực sự chạy | Expected | Actual / artifact |
|---|---|---|
| `git status --short`; kiểm AGENTS tại các ancestor và `rg --files ...` | Biết scope/instructions/dirty tree trước sửa | Đã giữ thay đổi cũ; baseline-status.txt |
| `docker version --format '{{.Server.Version}}'`; `node --version`; `npm --version` | Môi trường sẵn sàng | Engine29.9.3/Node24.19.0/npm11.17.0; Docker thật chạy được |
| `npm run typecheck` | Build runtime/Identity/Gateway và test typecheck | Exit0, [typecheck.txt](P8_RUN_1794666829708/typecheck.txt) |
| `npm run contracts:check` | Local refs/OpenAPI/Gateway projection đồng nhất | Exit0, [contracts.txt](P8_RUN_1794666829708/contracts.txt); final rerun contracts-final.txt |
| `npm run format:check`; `git diff --check` baseline | Format/whitespace sạch | Exit0, format.txt/diff-check.txt; final rerun riêng |
| `npm run test:m3` | Full regression/coverage + real DB/broker + lifecycle + Compose trong một invocation | **Exit0**, [full-m3.txt](P8_RUN_1794666829708/full-m3.txt), project `lamu-m3-test-1794666859128` |
| Full Jest trong invocation trên | Tất cả spec và broker integration, global coverage >=80% | **24 suites/127 tests PASS**, không skipped, **54.259s**; [regression.txt](M3_P7_RUN_lamu-m3-test-1794666859128/regression.txt) |
| `node scripts/compose-smoke.cjs --p6 --evidence-run=03` | Target Compose auth/P5/P6/persistence/readiness/runtime | **Exit0**, project `lamu-m1-smoke-1794667059022`; [log](P8_RUN_1794666829708/compose-p6.txt), [evidence03](M2_P6_COMPOSE_EVIDENCE_03.json). Đây là **target riêng**, không full regression/broker/lifecycle |
| `npm run generate:contracts` | Consumer Identity types sinh từ canonical | Exit0, [generate-identity.txt](P8_RUN_1794666829708/generate-identity.txt); generated Identity không drift |
| `node node_modules/openapi-typescript/bin/cli.js shared/contracts/http/event-context.draft.openapi.json -o shared/contracts/http/generated/event-context.draft.d.ts` | Pinned generator cho draft, chỉ target generated được chỉ định | Exit0, [generate-draft.txt](P8_RUN_1794666829708/generate-draft.txt) |
| `node scripts/check-event-context-draft.cjs` | Draft OpenAPI, allowlisted refs, valid/invalid fixtures, canonical errors, parity generated types Identity/draft | Exit0, [draft-contract.txt](P8_RUN_1794666829708/draft-contract.txt); final rerun draft-contract-final.txt. Không Event runtime test |
| `node node_modules/prettier/bin/prettier.cjs --write scripts/check-event-context-draft.cjs shared/contracts/http/event-context.draft.openapi.json` | Format đúng hai artifact mới | Exit0; không format source/migrations hoặc tài liệu lịch sử hàng loạt |
| `npm audit --omit=dev --audit-level=moderate` | Audit production dependency hiện tại | Exit0, **0 vulnerabilities**, [audit.txt](P8_RUN_1794666829708/audit.txt). Không phải full dev/OS image scan |
| Final typecheck/contracts/draft/format/diff + local links/hash/status/security scan | Không drift sau docs/tooling mới, không lộ credential trong evidence mới | **PASS**, exit0; *-final.txt/final-review.json/final-manifest.json trong P8_RUN: **213 local links hợp lệ**, 13 models, không diff frontend/accepted contracts; selected evidence secret-pattern scan clear. Không quét `.env`/Git history |

**Coverage mới** từ full127: statements **94.37%**, branches **89.94%**, functions **89.91%**, lines **95.15%**; global threshold80% PASS. Messaging riêng S84.86/B84.97/F68.18/L87.33%; không claim mọi module/function>=80%. Jest instrument source theo config hiện có, main/generated loại trừ; bootstrap/runtime được kiểm thêm bằng container. [Coverage JSON](P8_RUN_1794666829708/coverage-final.json) và [lcov](P8_RUN_1794666829708/lcov.info) được lưu riêng cho P8. Số127 trùng lịch sử P7 nhưng đây là invocation mới có run ID/log riêng, không chép kết quả cũ.

### Phân biệt provider thật, fixture và giới hạn fault injection

| Guarantee | Actual mới / artifact | Giới hạn |
|---|---|---|
| Auth/JWT/context/current session/tenant/permission, idempotency/last OWNER/invitation expiry/race/atomic outbox/revision | M1/P5/P6 HTTP app + Gateway + PostgreSQL thật trong full127; canonical schema assertion cho serialized responses | EVENT ownership/error/deadline fixture qua explicit `pair({resolver:{resolve},now})`; normal runtime default null/fail closed. Không Event provider thật |
| Backlog trước migration và event mới | [broker-cases.json](M3_P7_RUN_lamu-m3-test-1794666859128/broker-cases.json): backlog-and-new giữ ID/snapshot/revision/timestamp, đúng queue | Synthetic DB upgrade riêng; không publish backlog demo |
| Mandatory return/ACK, simultaneous attempts, missing target có queue khác, retry/park/replay | Cùng broker-cases + m3-worker suite; return thắng confirm, wrong target được phát hiện dù SENT hợp lệ theo delivery contract | SENT chỉ broker handoff ít nhất một route. NACK **client-injected**, chưa broker-generated NACK |
| Crash claim/confirm, DB finalize failure, stale inflight owner, lock không qua broker I/O | Real processes/DB/broker; trigger và TCP proxy, event ID giữ khi duplicate/reclaim | Lease test advance DB deadline, không chờ60s wall-clock; timeout transport rút ngắn trong test; không giả thành broker NACK |
| Storage restart/recreate/down-up | [lifecycle.json](M3_P7_RUN_lamu-m3-test-1794666859128/lifecycle.json): cả3 PASS, giữ node/volume/message/body, recreate đổi container | Không mất host/volume/backup-restore/HA proof |
| API khi broker offline, worker reconnect, đúng queue | [compose-flow.json](M3_P7_RUN_lamu-m3-test-1794666859128/compose-flow.json): commit3 outbox records offline, nhận đủ3 IDs sau reconnect; topology/images ghi trong artifact | Không consumer nghiệp vụ; không suy mọi subscriber nhận |
| Linux SIGTERM worker | [shutdown.json](M3_P7_RUN_lamu-m3-test-1794666859128/shutdown.json): exit0, **642ms** | Idle Compose shutdown; inflight15s budget kiểm bằng unit/fake clock riêng, không giả đo15s OS wall-clock |
| Target Compose P6 | Create/list/accept/replay/new-key conflict/decline/revoke/profile, exactly1 MembershipChanged/revision1; auth/logout mismatch/retry/rotation, state giữ restart/redeploy, seed2 lần, DB outage/recovery, ports nội bộ không publish, Jest/tsx vắng runtime | Không broker/Event/browser, không manual Swagger. Test dùng project riêng, không volume demo |
| Argon2 baseline mới | [baseline03](M2_P6_ARGON2_BASELINE_03.txt): 2CPU/256MiB, 19456KiB/2/1; n20 mỗi ca, concurrency1 p50/p95 **45.35/69.79ms**, concurrency4 **110.65/152.23ms**, 0 lỗi | Synthetic hash+verify, không SLA/end-to-end load; visible host resources khác quota |

[M3 versions](M3_P7_RUN_lamu-m3-test-1794666859128/versions.json) và Compose artifacts ghi image IDs/Node/broker/node identity. Harness full đã down đúng project **không-v**, giữ named volumes điều tra. P6 target dọn đúng project test riêng. Không có fault/cleanup/migration lên demo/shared. Không chạy `--compose-only` trong P8; không dùng invocation Compose-only lịch sử thay lượt full mới.

## Độ lệch và cách giải quyết

| Phát hiện | Xử lý P8 / trạng thái |
|---|---|
| Handoff còn nói Event chưa có artifact/messaging chưa tạo; bảng manual P6 còn NOT RUN sau acceptance | Cập nhật trạng thái hiện tại và link evidence; giữ các record theo thời điểm là lịch sử. Manual M2 **PASS — USER-CONFIRMED**, không ghi Codex trực tiếp chạy |
| MASTER_PLAN revision2/architecture/events có câu hiện tại trông như M2/M3 chưa triển khai/F10 draft, bảng schema chỉ nền M1 | Chú thích baseline rõ ngày; cập nhật M3 current status, 13 bảng/additive metadata, nguồn authoritative; không viết lại báo cáo FAIL/NOT RUN cũ |
| Catalog chung còn “draft toàn bộ”, chỉ M1 dùng verified sid, public-profile nói avatar, hai mục permission/messaging “chưa duyệt” | Chỉ rõ accepted Identity1.2.0/ba schema v1/delivery v1, context tiếp tục M2/M3; bỏ avatar không có trong response; phần service khác vẫn draft |
| Identity–Event F05 chỉ có prose/interface, thiếu HTTP machine-checkable draft | Thêm OpenAPI0.1.0-draft + generated types + checker. Prose F05 dẫn tới artifact duy nhất, Error dùng `$ref` canonical Identity. Chưa ACCEPTED/không code adapter/provider |
| Frontend mock và client khác backend | Mapping handoff §8: BASE/prefix, auth/session/logout, create-org200→201, members/scoped roles/pagination, keys, errors/UUID request ID; invitation/backend-vs-UI và business APIs còn thiếu. Không sửa frontend/M4 |
| README nói test:m1 chỉ M1/P5/P6, lệnh Compose dùng suffix cố định dễ ghi đè | Làm rõ test:m1 không broker integration; full bằng test:m3; P6 chọn suffix chưa có cả2 files, P5/default không chạy đè evidence. Đã chọn03 sau kiểm tra file chưa tồn tại |

Không phát hiện bug production cần sửa trong phạm vi review/evidence này; đây không phải tuyên bố mọi đường đi đều được chứng minh. **RED/GREEN: N/A**, không production fix. Checker draft có negative fixtures (missing/null/invalid UUID/extra allowed field), valid fixture lấy từ spec và Error fixtures đối chiếu canonical; schema không chứng minh requested ID/org đã đáng tin, runtime semantic check vẫn là gate adapter M4.

## Security review P8

- Gateway JwtGuard verify HS256/issuer/audience/expiry/UUID claims/lifetime900, raw duplicate Authorization bị từ chối. Proxy chỉ forward allowlist, verified sub/sid; context tự khai không đi qua public auth/protected route. Request UUID chỉ correlation. Identity ContextGuard kiểm shape/uniqueness, **không tự verify JWT**; internal authorization/profile không có guard service identity, dựa network local đã chốt. Public Swagger projection bỏ internal/context; `/api/internal/...` bị404 trong tests/Compose.
- Current user/membership ACTIVE và quyền local được kiểm lại dưới khóa; tenant/resource/last OWNER/idempotency replay/TTL24h và invitation snapshot/expiry/terminal state theo accepted contracts. Caller business phải resolve trusted event/org trước internal check: endpoint check không tự chứng minh quan hệ đó. EVENT mutation thiếu resolver409, fixture tiêm ở test; không env fallback runtime. Replay success không resolve lại nhưng vẫn kiểm quyền nhận kết quả hiện tại.
- Session refresh SHA-256 hash-only, opaque random, rotation khóa session/user giữ sid/hạn7 ngày, logout khóa row và đối chiếu cả sub/sid với refresh hiện hành. Access JWT sau logout có thể còn tới exp; không hứa immediate access revoke/logout-all. Không thay browser localStorage/cookie policy trong P8; race nhiều tab/XSS/storage/CSRF/transport vẫn M4 decision.
- Response/log dùng contract serializer và generic error envelope; Gateway log request_id/method/status/duration, worker log opaque IDs/status/code, không body/token/password/email payload. `users/me` có email chủ thể và UserRegistered có email theo contract đã duyệt; public-profile/members/inbox không trả contact nhạy cảm. Không coi mọi email là phải xóa khỏi approved contract; evidence không lưu credentials/token hoặc email thật.
- DB raw queries parameterized; static health SELECT1 không nhận input. Claim SKIP LOCKED/lease/fencing, no lock qua AMQP I/O, conditional finish/audit/replay giữ owner; at-least-once không exactly-once. Retry same event ID/snapshot; invalid schema/exhaustion PARKED giữ dữ liệu, replay dry-run mặc định/chỉ PARKED có audit. Reason operator phải không secret; không gửi raw SQL/AMQP URL/error/payload vào log/report.
- Draft refs được whitelist trước Parser/generator: chỉ document refs và exact canonical Error file; HTTP resolution disabled. Pinned installed generator, không tải tool mới hoặc thực thi text trong description/example. Generated diff được review, application chưa import draft. Production audit mới0 vulnerabilities; không tự update dependency.
- Container runtime user node, Identity/DB/AMQP không publish host port ở Compose thường; management loopback. Test override chỉ loopback/dynamic/project riêng, không đại diện cấu hình production. Local network/HS256 shared secret/in-memory IP limiter không thay service auth/TLS/HA hoặc distributed limiter ngoài local. Không dựng hạ tầng mới để đóng P8.

## H01–H05 và quyết định M4

[Handoff §7](../../../docs/integration/identity-handoff.md) là bảng trạng thái duy nhất: provider/consumer, owner thực tế/chưa gán, authority/version, contract vs implementation vs integration, provider thật/fixture, điều kiện bên nhận và expected tests. **H01 auth/context và H02 authorization sẵn sàng bàn giao độc lập**, không đợi Event adapter hoặc consumer messaging. H04 có schema/topology/delivery evidence thật local; H05 có API/runbook/evidence. Consumer acceptance H01/H02/H04/H05 và H03 provider thật vẫn NOT RUN, không tự nhận cả nhóm đã nghiệm thu.

[D09-A–E ở handoff §9](../../../docs/integration/identity-handoff.md#d09-draft) là đề xuất cụ thể cần người dùng và owner/reviewer hai phía xác nhận **trước implementation phụ thuộc**:

1. Endpoint nội bộ/metadata tối thiểu trong [OpenAPI DRAFT](../../../shared/contracts/http/event-context.draft.openapi.json), resolve mọi existing DRAFT/PUBLISHED/CANCELLED; không trả allowed hoặc gọi vòng Identity.
2. Deadline1000ms/call, budget2000ms/command khi nhiều event IDs, không retry/cache; phối hợp Gateway3000ms và latency DB. Schema/pass chưa là deadline HTTP proof.
3. Mapping missing404, wrong-org403, invalid response/network/provider errors502, timeout504; giữ missing-adapter409 đã duyệt. Không fallback fixture/đọc chéo DB.
4. Local internal network trust; service auth ngoài local cần quyết định riêng, không expose Gateway/public Swagger.
5. Lifecycle xóa/tombstone/chuyển org, eligibility CANCELLED, assignment/invitation cũ, version/revalidation còn OPEN. Không cam kết remote resource bất biến giữa resolve và local transaction.

Browser M4 còn cần chốt same-origin/proxy hoặc CORS origin, storage/transport và nhiều tab. Đề xuất coordinator/logout/generation guard ở handoff §8, không tự implement. Owner/reviewer thực tế của Event/frontend/consumer, lịch hẹn và acceptance chưa biết; không gán tên hoặc thời hạn.

## Checklist công việc bên nhận M4

- [ ] Chỉ định owner/reviewer hai phía, review D09 draft/compatibility/timeout/trust/lifecycle và browser/nhiều tab; ghi nguồn xác nhận, không nâng ACCEPTED chỉ vì spec check PASS.
- [ ] Freeze/review/regenerate artifact trước code; Event provider đọc DB sở hữu và trả metadata kể cả DRAFT, không gọi Identity để bảo vệ resolver. Identity adapter semantic UUID/requested ID/org, deadline/budget/fail closed, không fixture fallback/cross DB.
- [ ] Chạy contract verification cả provider và consumer cùng artifact rồi E2E Event thật: wrong tenant/missing/malformed/unavailable/timeout/no partial mutations; replace/create invite/accept và replay đúng policy; trace không vòng gọi.
- [ ] Frontend derive types/contract-valid mocks, chuyển Gateway theo service đã có, cập nhật status/error/key/pagination/scoped roles. Không cho mock business endpoints che provider thật chưa có.
- [ ] Logout gửi access+refresh hiện hành cùng phiên, phối hợp refresh đang chạy/access expiry, không recursive auth refresh, stale-response generation guards; test local clear khác server revoke confirmed; nhiều tab theo policy đã chốt.
- [ ] Consumer messaging chỉ khi được giao nhu cầu: queue/binding riêng, validate schema/version, dedupe event_id/revision, test đúng queue và business processing, không coi SENT là acceptance.
- [ ] Người nhận tái hiện runbook trên test project riêng, ghi actual/expected/provider/versions/evidence và consumer acceptance tại H tương ứng.

**NOT RUN / chưa kiểm chứng:** Event HTTP provider/adapter thật và lifecycle/transfers/deletes; frontend/browser E2E, race nhiều tab/cookie/BFF/CORS/CSRF policy; service nghiệp vụ/consumer projection/Notification/email; broker-generated NACK; manual Swagger P8/M3 do Codex trực tiếp chạy; REST Client collection riêng; production-sized migration/backup restore/HA/disaster/mất host-volume; full Git history secret scan, dev/tooling/OS image CVE audit, môi trường ngoài local. Manual Swagger/DOC-01 M2 giữ nguyên **USER-CONFIRMED** theo acceptance cũ.

P8 hoàn tất chuẩn bị vì đã có mapping, DRAFT/checks, runbook, evidence mới và trạng thái/dependency rõ cho mọi gap; chưa có quyết định hoặc integration M4 nào được tự nâng thành hoàn tất. Không commit.

Verification cuối: build/types/contracts/format/tests/security review/diff **PASS trong phạm vi đã ghi**, sẵn gói bàn giao P8. Target local test containers **VERIFIED**; Event/browser/business consumer M4 và môi trường ngoài local **NOT PERFORMED**. Bước tiếp theo được phép là review/chốt các đề xuất cụ thể và phân công bên nhận, sau đó triển khai M4 khi được giao; không tự deploy/merge/publish hoặc gửi thông tin cho người khác.
