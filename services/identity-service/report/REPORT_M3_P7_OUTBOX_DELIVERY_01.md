# M3/P7 — Outbox delivery

Ngày 14/11/2026 (Asia/Saigon). **M3/P7 COMPLETE trong phạm vi local đã duyệt: implementation và các gate bắt buộc PASS theo evidence bên dưới.** Không commit. Người dùng xác nhận riêng toàn bộ A–E trong [P0](REPORT_M3_P0_MESSAGING_CONTRACT_01.md); [messaging v1](../../../docs/api/messaging.md)/[ADR0005](../../../docs/adr/0005-m3-outbox-delivery.md) được chốt trước implementation phụ thuộc. Không suy phê duyệt M3 từ M2 acceptance hoặc tự gán manual/service-consumer acceptance mới.

## Thay đổi và phạm vi

- NestJS application context/process worker riêng; API M1/M2 không import/kết nối broker. `MessagingModule` cung cấp repository/confirm publisher/worker và đóng Pool sau drain. Config URL validate lúc boot; lỗi/log chỉ code và event/attempt IDs, không raw error/credentials/payload.
- Migration mới `202611140004_m3_outbox`: claim token/lease, count/schedule/timestamps/error code, PENDING/PROCESSING/SENT/PARKED constraints, due/reclaim indexes, bảng audit attempts/replay. Không sửa bốn migration cũ hoặc reset/db push. Legacy SENT có thể sent_at=NULL để không bịa thời điểm. Upgrade giữ user/session/hash/org/member/roles/revision/invitation/idempotency và toàn bộ envelope/backlog.
- Claim SKIP LOCKED, token mới mỗi attempt, DB clock, max10/batch/concurrency, poll1s, lease60s; transaction ngắn commit trước broker I/O. Conditional finish kiểm event/status/token/lease; affected0 là ownership lost. Không giữ DB lock lúc chờ confirm.
- amqplib2.3.1 bundled typings, callback confirm từng publish, map attempt header/messageId/channel generation. Return đồng bộ trước callback ACK; return+ACK không SENT. Unknown return/channel fault fail closed; publish boolean là backpressure. Timeout10s là thất bại, không timer suy thành công. Persistent/mandatory/messageId/event/version theo messaging v1.
- Snapshot lấy từ outbox, không query DB nghiệp vụ để dựng payload mới; occurred_at UTC giữ PostgreSQL microseconds, revision/payload/aggregate/ID gốc. Schema whitelist Ajv runtime theo ba canonical v1 + quan hệ aggregate/payload và ORG scope. Invalid schema park ngay, không publish/log body.
- Retry exponential1–300s/jitter0.5–1.0, max20/cycle rồi PARKED; reconnect1–30s/jitter. Replay CLI mặc định dry-run, explicit --apply chỉ PARKED→PENDING, reason/UUID validate, giữ envelope và audit; không auto replay SENT hoặc sửa payload. Crash sau confirm/DB finalize failure có thể duplicate cùng event ID, không mutation nghiệp vụ lại.
- SIGTERM/SIGINT ngừng claim, hook drain idempotent15s, process hard deadline18s, Compose grace20s. Attempt chưa chắc kết quả giữ khả năng reclaim. Pin RabbitMQ4.4.0 tag/digest, named volume/node identity, management loopback, AMQP nội bộ. Không thay dữ liệu demo/shared.

ORG/Identity/Gateway/PostgreSQL là provider thật. EVENT resolver vẫn fixture inject riêng; cấu hình thường thiếu resolver fail closed. Không Event resolver thật/frontend/Notification/email/invitation event/consumer nghiệp vụ. Manual Swagger/DOC-01 M2 giữ **USER-CONFIRMED**, Codex không chạy manual mới. Chưa tự nghiệm thu service consumer M4.

## Lệnh thực sự chạy và RED/GREEN

Các log đầu/target nằm ở [M3_P7_RUN_20261114_01](M3_P7_RUN_20261114_01/schema-red.txt). Cùng target được rerun; lỗi compiler/setup không được tính RED hành vi.

| Lệnh | Expected | Actual/evidence |
|---|---|---|
| `node scripts/test-db.cjs --migrate --seed --runTestsByPath tests/m3-claim-schema.spec.ts` trước migration | RED thiếu metadata | 1 test thực sự chạy, PostgreSQL báo column claim_token không tồn tại; schema-red.txt |
| `node scripts/test-db.cjs --migrate --seed --runTestsByPath tests/m3-worker.spec.cjs` trước implementation | RED thiếu worker/repository/publisher trong source repo | 9 runtime tests fail khi require các module implementation chưa tồn tại; worker-red.txt; không phải thiếu package bên thứ ba |
| `npm install --save-exact -w @lamu/identity amqplib@2.3.1 ajv@8.20.0 ajv-formats@3.0.1` | Pin client/runtime validators/lockfile | Exit0; typings bundled; install.txt; không đổi schema/payload v1 |
| `npm run db:generate -w @lamu/identity` | Generate client theo additive schema | Exit0, Prisma7.10.1; generate.txt |
| `node scripts/test-db.cjs --migrate --seed --runTestsByPath tests/m3-claim-schema.spec.ts tests/m3-worker.spec.cjs` | Cùng targets GREEN | 2 suites/10 tests PASS, 2.122s; worker-green-01.txt |
| `npm run typecheck` đầu | Build/typecheck | Một lỗi TS: heartbeat đặt nhầm socket options; sửa vào AMQP URL theo client API. Không tính lỗi này là TDD RED; typecheck-initial.txt/02.txt |
| `node scripts/test-db.cjs --migrate --seed --runTestsByPath tests/m3-upgrade.spec.ts tests/m3-worker.spec.cjs tests/p2-auth.spec.ts tests/p5-organization.spec.ts tests/p6-transactions.spec.ts` | Upgrade/ownership và regression bị ảnh hưởng GREEN | 5 suites/45 tests PASS,18.408s; target-green-02.txt |
| `node scripts/test-db.cjs --migrate --seed --runTestsByPath tests/m3-worker.spec.cjs --testNamePattern 'drains shutdown only once'` trước sửa hook | RED shutdown lặp | Expected publisher.close1, actual2; 1 failed/11 deselected, shutdown-red.txt |
| `node scripts/test-db.cjs --migrate --seed --runTestsByPath tests/m3-worker.spec.cjs --testNamePattern 'shutdown|inflight drain'` sau sửa | Hook idempotent/deadline GREEN | 3 passed/10 deselected,1.725s; shutdown-green.txt. Deselected chỉ do filter, không skip trong full suite |
| `node scripts/test-m3.cjs` / `npm run test:m3` | Full M1/M2/M3 với PostgreSQL/RabbitMQ thật, lifecycle và Compose | Các run/failure tách riêng bên dưới. Run1794659339512: 24 suites/127 tests PASS,62.919s; lifecycle restart/recreate/down-up PASS. Flow cuối cần sửa host-port test harness; không claim toàn command run này exit0 |
| `node scripts/test-m3.cjs --compose-only` | Rerun riêng Compose sau sửa port mapping | **Exit0/PASS**, project1794659791710; [compose-flow.json](M3_P7_RUN_lamu-m3-test-1794659791710/compose-flow.json)/[shutdown.json](M3_P7_RUN_lamu-m3-test-1794659791710/shutdown.json); regression/lifecycle **không chạy lại** trong invocation này |
| `npm run typecheck` sau source cuối | Build runtime/Identity/Gateway + test types | Exit0, typecheck-05.txt |
| `npm audit --omit=dev --audit-level=moderate` | Audit production dependencies | Exit0, 0 vulnerabilities, audit-final.txt; không là dev/OS-image audit |
| `npm run contracts:check`; `npm run format:check`; `git diff --check` | Contract/projection/format/whitespace | Các lần cuối exit0; log final trong thư mục target, không sửa canonical event shape |
| `docker run --rm --network none --read-only --name lamu-m3-runtime-check-1794659791710 <worker-image-id> node -e ...` | Runtime non-root, không Jest/tsx, schemas load được | Exit0, Node24.19.0/UID1000, dev_runners_absent=true/schemas_load=true; runtime-check.txt; không start worker hoặc kết nối broker/DB |

## Mapping guarantee → provider/test → evidence

Nguồn full regression/delivery/storage mới nhất: [run1794659339512](M3_P7_RUN_lamu-m3-test-1794659339512/versions.json). PostgreSQL/RabbitMQ thật, credentials synthetic trong RAM, Compose project/volumes riêng. Broker version4.4.0, node rabbit@rabbitmq, Node24.19.0. Engine image IDs quan sát: RabbitMQ `sha256:598b474e2511f37a7408f3fa580f002684638f4ad6401395102b51e3209a9a51`, PostgreSQL `sha256:aa6cb33cf4c19c765cefcf48d96176258800870a9a1e930ad126200f9d825139`; app images/Node thật nằm ở Compose flow. Không dùng manifest lookup P0 làm runtime evidence.

| Guarantee/gate | Test/provider thực tế | Actual/artifact |
|---|---|---|
| Backlog M1/M2 trước migration và event mới | m3-broker.integration.cjs: apply4 migration cũ, lưu UserRegistered/org/member(revision7, timestamp microseconds), apply M3 rồi run worker; fresh event sau upgrade | 4 envelope đến đúng queue/schema/ID/payload, microseconds/revision gốc; broker-cases.json/backlog-and-new |
| Không mutation/revision/outbox mới vì retry | M1/P5/P6 regression + same-ID retry/duplicate/crash; worker chỉ truy cập outbox/audit | 99 tests cũ giữ semantics; duplicate là transport event ID cũ, không gọi API mutation lại |
| Unroutable + ACK | Unbind đúng key sau setup, real basic.return rồi confirm callback; restore/retry cùng ID | PENDING/outcome RETURNED, không SENT; sau binding SENT + dequeue; real broker |
| Queue khác nhận nhưng target thiếu binding | Queueother durable nhận cùng route; canonical queue unbound | SENT **được phép theo contract B**, target empty được phát hiện, other nhận; restore + fresh event target nhận. Không gọi missing-target delivery PASS |
| Concurrent attempts | Repo claim2 workers realDB; publisher return/success concurrent real broker, mock bổ sung cùng event/different token | Claim mỗi row một owner; return không nhiễm sang success attempt |
| NACK | m3-worker.spec.cjs fake channel callback error | PASS **client-injected only**; chưa có evidence broker thật phát basic.nack, không tuyên bố có |
| Timeout/disconnect/channel error | TCP proxy chặn broker→client/drop socket với DB/broker thật; missing exchange khiến broker channel.close | Không SENT, retry cùng ID; timeout test rút10s xuống200ms. Không gọi proxy fault là broker NACK |
| Crash sau claim / sau broker confirm trước DB SENT | Fork process compiled worker components, real DB/broker, parent SIGKILL tại IPC boundary | PROCESSING giữ row, lease test deadline advanced, reclaim; confirm case nhận duplicate cùng ID. Không chờ đủ60s wall-clock; lease policy kiểm bằng DB clock |
| Stale owner và không lock qua broker I/O | Real outstanding confirm bị trì hoãn qua proxy; connection khác SELECT FOR UPDATE NOWAIT thành công, expire/reclaim/token mới SENT | Old ACK không ghi đè; duplicate ID giữ nguyên, attempt_count2; broker-cases.json/old-inflight-owner |
| DB finalize failure sau publish | Real PostgreSQL trigger từ chối SENT sau real confirm | PROCESSING giữ row; gỡ trigger/reclaim nhận duplicate, rồi SENT; không giả báo DB đã ghi |
| Invalid schema/relationship/unknown version/parked/exhaustion/replay | Ajv+semantic guards, realDB repository/replayCli; no publish invalid; fake failure20th delivery | Giữ payload, PARKED, audit; dry-run không mutation, apply reset budget/audit; invalid replay park lại, exhaustion không SENT |
| Upgrade giữ toàn bộ dữ liệu cũ và legacy SENT | m3-upgrade.spec.ts trên DB M2 có user/session/org/member/revision7/invitation/idempotency/PENDING+SENT; compare snapshots | PASS, không reset/rewrite envelope; legacy sent_atNULL; malformed metadata bị CHECK chặn |
| Restart broker | Dedicated durable classic lifecycle queue, persistent confirmed message, real Compose restart | PASS, cùng container/volume/node/message ID; lifecycle.json entryrestart |
| Recreate và down/up giữ storage | Real --force-recreate rồi real down/up không-v | PASS riêng từng ca, container IDs đổi, volume/node/body/message ID giữ; lifecycle.json entriesrecreate/down-up |
| API commit khi broker down / reconnect / Linux shutdown | Compose thật, compiled production runtime images; test riêng project1794659791710 | PASS: register/create org commit3 outbox records khi broker stop, bật lại nhận đủ3 IDs, worker SIGTERM exit0/565ms. Run06 host-port timeout vẫn FAIL invocation, không sửa lịch sử |
| Shutdown inflight budget | Unit fake-clock15s + repeat hook, realDB fencing/lease; Linux idleSIGTERM riêng Compose | Unconfirmed không SENT; hook chỉ drain một lần. Không dùng fakeclock để claim đã đo15s OS wall-clock |

## Coverage và các lượt lỗi được giữ

Full cuối run1794659339512: **24 suites/127 tests PASS, không skipped**,62.919s; statements94.37%, branches89.94%, functions89.91%, lines95.15%, global thresholds80% PASS. [Regression log](M3_P7_RUN_lamu-m3-test-1794659339512/regression.txt). Messaging riêng S84.86/B84.97/F68.18/L87.33%; module bootstrap/pool hooks/CLI process entry không được Jest instrument đủ, có runtime Compose riêng; không claim per-file/functions M3>=80%. Main/generated exclusions giữ Jest config hiện có. Coverage không thay SQL/interleaving proofs.

| Run/artifact | Actual lỗi và xử lý |
|---|---|
| 1794658159845 | Broker cases PASS nhưng full4 tests fail: test M1/P5/P6 spread Prisma row vào closed envelope nên metadata mới bị validate như event fields. Sửa test chọn8 field envelope tường minh, không nới schema hay sửa payload production |
| 1794658404691 | Full124 PASS; lifecycle timeout vì recreate cấp host-port mới, harness dùng URL cũ. Sửa refreshPorts sau recreate/down-up; không tính timeout là storage PASS |
| 1794658639807 | 125PASS/1fail: DROP DATABASE FORCE ở teardown upgrade ngắt pg client đang đóng. Sửa M3 tests đợi pg_stat_activity hết connection rồi drop bình thường |
| 1794658874666 | Cùng race teardown xuất hiện ở P6 upgrade cũ. Sửa cả P5/P6 teardown theo cùng nguyên tắc, không skip/sửa assertion nghiệp vụ |
| 1794659094088 | Full127 PASS; lifecycle đọc message test tồn thay vì ID mới vì queue không được isolate và ACK có thể chưa flush trước connection close. Thêm channel RPC barrier sau ACK và queue lifecycle durable riêng, không purge/delete backlog để tạo PASS |
| 1794659339512 | Full127 và cả3 lifecycle PASS; API/worker đã gửi nhưng host Compose test timeout vì stop/start broker đổi cổng động lần nữa. Refresh ports sau start, rerun **riêng** Compose theo phạm vi failure |

Giữ mọi run/evidence riêng, không ghi đè M1/M2 hoặc biến lỗi thành PASS. Bốn trường cancellation key PostgreSQL synthetic trong diagnostic cũ được redact để không lưu key; kết quả failure/expected-actual giữ nguyên. Test tmpfs containers được dọn đúng tên; Compose test stacks down không-v, named volumes giữ để điều tra. Chưa start/migrate/publish vào volume demo `lumasoa_identity-data`; proof backlog dùng dữ liệu tổng hợp trong môi trường riêng.

## Security review thực hiện

- API auth/session/context/RBAC/invitation/idempotency không thay business code; full regression cũ giữ pass. ORG thật, EVENT fixture injection/default fail closed giữ giới hạn M4. Không public replay endpoint hay consumer/quyền mới.
- Repository SQL parameterized; dynamic DB names chỉ test UUID synthetic, validation tên ở P5. Claim/finish/audit/replay atomic, token/lease/status recheck; no DB lock qua broker I/O; pg connect/query/transaction timeouts hữu hạn. Audit chứa IDs/count/code/reason, không snapshots/tokens/password.
- Payload validator chỉ load3 local canonical schema theo allowlist filename, không remote ref/executable contracts. Invalid scope/aggregate/version park, không dựng dữ liệu hiện tại để hợp thức hóa event cũ. CLI flags/UUID/reason validate, dry-run default, chỉ PARKED; operator reason phải không có secret.
- Return/confirm map theo attempt/generation, missing/mismatched return invalidate; transport error/unknown results retry hoặc lease reclaim, không promote SENT. Persistent/mandatory/durable và SENT semantic đúng contractB; duplicate và missing-target giới hạn được kiểm riêng.
- Config URL validate lúc boot; log generic code + opaque IDs, không amqp/DB URL hoặc raw broker/SQL errors/payload/email. Không đọc/in `.env`; Compose tests dùng `.env.example` + credentials random RAM, inventory không dump Config.Env. Dependency pin/lockfile, production audit0. Image runtime usernode và không host publish API Identity/DB/AMQP ở Compose thường; management loopback.
- Volume/node/image pin và lifecycle test riêng; không destroy/reconfigure demo/shared broker hoặc volumes. App rollback giữ additive schema/audit. Local DDL indexes không chứng minh production-sized lock/zero-downtime; backup/restore/HA/mất volume/host chưa được test.

**NOT RUN / ngoài phạm vi:** broker-generated NACK (chỉ client injection), Event provider/resolver HTTP thật, consumer nghiệp vụ/projection M4, frontend/email/Notification, manual Swagger M3 riêng, production-sized migration/backup restore, full dev/OS image audit, disaster recovery/replay SENT. Manual M2 chỉ USER-CONFIRMED. Không nâng các mục này thành PASS từ worker implementation hoặc coverage.

## Bàn giao cuối

M3 gate được chứng minh bởi **hai invocation có phạm vi rõ**: full regression/broker/lifecycle run1794659339512 và Compose-only run1794659791710 exit0 sau sửa harness host-port; không tuyên bố đã chạy lại toàn bộ127 trong invocation Compose-only. Production TypeScript không đổi giữa hai run. [Source/artifact hashes](M3_P7_RUN_20261114_01/final-manifest.json) ghi working tree và images/evidence; không có commit provenance vì không commit.

App image IDs của Compose cuối: worker `sha256:afbd4615deb1d379dc05605227503405aa443e58e8e268c4b229fa38ee181f28`, Identity `sha256:16c189066a8c7ee963cc271783385da34300122f959cb4d7b9cc5d0ac6b498eb`, Gateway `sha256:90a1d8602f48461896a8ad463cf4a4a0a5cfbf3bbeb4cde7919275e5cd58283c`; runtime Node24.19.0. Topology actual exchange/topic/durable, queue durable/non-auto-delete và ba binding ghi trong compose-flow.json. Chuỗi “Timeout:60.0 seconds...” trong output rabbitmqctl list_queues là cấu hình thời gian chờ CLI, lệnh trả exit0 và có kết quả queue; không gọi một CLI timeout thất bại là PASS.

MASTER_PLAN/handoff/catalog/architecture/events README/ADR/runbook đã đồng bộ. Có thể tái hiện từ root bằng `npm run test:m3`; `--compose-only` chỉ dùng kiểm lại Compose khi cần, không thay regression/lifecycle. Các project test đều down không-v, volumes giữ lại để điều tra; không tự activate worker trên demo/shared hoặc claim đã publish backlog người dùng ngoài môi trường test.

Final manifest đã kiểm hash **bốn migration cũ và ba JSON Schema Identity không đổi** so với baseline P0, lưu source/artifact hashes và kiểm21 local links. Final format/contracts/diff checks exit0; không có container test còn chạy. Không commit.
