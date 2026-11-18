# M2/P5 — Organization và RBAC

Ngày: 14/11/2026 (Asia/Saigon). **P5 đã triển khai; kiểm chứng tự động PASS trong phạm vi bên dưới.** P6 invitation chưa triển khai, không báo hoàn tất toàn bộ M2. Không tự commit. Manual Swagger/DOC-01: **NOT RUN**.

Nguồn: [MASTER_PLAN.md/P5](../MASTER_PLAN.md), REVIEW_MASTER_PLAN01/F03–F07/F10/F11, [P0 M2](REPORT_M2_P0_CONTRACT_01.md), handoff D05/D06/D07-P5/D09-interface/D12. Người dùng xác nhận “Chốt toàn bộ A–E theo báo cáo P0” và báo đã bật Docker trước phần phụ thuộc. [ADR 0003](../../../docs/adr/0003-m2-p5-organization-rbac.md) ghi quyết định riêng P5; auth/session và các quyết định M1 giữ nguyên.

User journeys từ P5: user đã đăng nhập tạo org và trở thành OWNER; member đọc org, OWNER/ADMIN xem thành viên; OWNER thay role mà vẫn giữ OWNER hợp lệ cuối; service nội bộ hỏi quyền đúng tenant/resource và đọc public user; caller retry cùng key không lặp side effect và vẫn chịu quyền hiện tại. Mapping từng guarantee vào test ở dưới, không lập lại kế hoạch tổng thể.

## Thay đổi đã thực hiện

- Module NestJS organizations: controller mỏng, DTO validation/whitelist, authorization và transaction ở service; đọc org/members/public organization, tạo org/OWNER, thay toàn bộ assignments, internal check/public user profile.
- HTTP canonical Identity OpenAPI **v1.1.0**, generated consumer types và Gateway projection dùng cùng nguồn; projection loại `/internal/`. Gateway có route allowlist tường minh, JwtGuard M1, forward một Idempotency-Key hợp lệ; không wildcard/internal proxy. Swagger public dùng projection canonical.
- Schema migration `202611140001_p5`: membership_revision BIGINT/default 1/constraint safe integer; idempotency_records với FK, unique actor/operation/key, hash/target/result/TTL constraint/index. Không sửa migration M1 hoặc reset DB.
- DML migration riêng `202611140002_rbac_reference`: dữ liệu bốn role/mười permission cho DB mới, độc lập seed demo; giữ ID/mapping hiện có, dừng nếu scope/extra-grant drift, không user/org demo hoặc event. Cần bước này vì container không chạy demo seed trước API. Seed local vẫn riêng và lặp an toàn.
- OrganizationCreated/MembershipChanged JSON Schema v1 và fixtures máy kiểm được. Create org ghi hai event với membership revision 1; replacement khác tập assignment tăng revision và một snapshot event; no-op/replay/rollback không event/revision mới. ORG ID serialize từ NULL persistence thành org UUID.
- Mutation/result/idempotency/revision/outbox commit cùng transaction. Giao thức khóa key → org → users theo UUID → membership; kiểm ACTIVE/quyền hiện tại dưới khóa. Khóa org bảo vệ OWNER hợp lệ cuối cùng; TTL 24h, key lock timeout 2s, replay kiểm quyền trước trả cache. Record hết hạn được thay dưới cùng khóa, không cleanup worker.
- EVENT resolver chỉ test inject qua composition; normal runtime không env fixture và thiếu resolver trả EVENT_SCOPE_UNVERIFIED. Resolve trước transaction, kiểm quyền local lại sau resolve/chờ khóa. Success replay không resolve lại Event, vẫn kiểm quyền nhận kết quả.

Canonical artifacts: [HTTP](../../../shared/contracts/http/identity.openapi.json), [Gateway projection](../../../shared/contracts/http/gateway.openapi.json), [generated types](../../../shared/contracts/http/generated/identity.d.ts), [OrganizationCreated](../../../shared/contracts/events/organization-created.v1.schema.json), [MembershipChanged](../../../shared/contracts/events/membership-changed.v1.schema.json). Catalog/architecture/handoff/READMEs đồng bộ; không tạo type payload handwritten song song với generated HTTP types. Event producer test validate serialized outbox theo JSON Schema, bao gồm aggregate_id/payload identity.

## Lệnh thực sự chạy và expected/actual

Môi trường: Node **24.19.0**, npm **11.17.0**, NestJS **11.2.10**, Prisma/client/adapter **7.10.1**, TypeScript **5.9.3**, Jest **30.5.2**, ts-jest **29.4.15**; PostgreSQL container **16.15**. Docker test tmpfs/loopback hoặc project/volume riêng, credentials ngẫu nhiên chỉ trong RAM. Không tác động volume demo. Chi tiết lần thử khi daemon chưa bật và baseline M1 ở báo cáo P0.

| Lệnh/gate đã chạy | Expected | Actual / kết luận |
|---|---|---|
| `npm run typecheck` | Build runtime/Identity/Gateway và typecheck tests | Exit 0 — PASS |
| `npm run db:generate -w @lamu/identity` | Client theo schema hiện tại | Prisma 7.10.1 generate exit 0 — PASS |
| `node scripts/contract-projection.cjs` | Public projection, không internal | Exit 0; contract test kiểm internal exclusion — PASS |
| `npm run generate:contracts` | Consumer types từ canonical | openapi-typescript 7.10.1 exit 0 — PASS |
| `npm run contracts:check` | Local refs, OpenAPI/projection đồng nhất | Exit 0 — PASS |
| `npm test -- --runTestsByPath tests/p5-contract.spec.cjs` trước canonical | RED vì P5 chưa có | 4 failed: thiếu routes/schema và projection lộ internal — RED hợp lệ |
| `npm test -- --runTestsByPath tests/p5-contract.spec.cjs tests/p0-contract.spec.cjs` sau canonical | Cùng target GREEN, giữ M1 | 2 suites/6 tests PASS, 0.86s |
| `node scripts/test-db.cjs --migrate --seed --runTestsByPath tests/p5-organization.spec.ts` trước implementation | RED vì thiếu P5 | Sau sửa setup login: 8 tests fail do thiếu membership_revision và route 404 — RED hợp lệ |
| Cùng lệnh sau implementation | GREEN API cơ bản | Lần đầu 7 pass/1 fail vì test dùng nhầm ID assignment thay event fixture; sửa test sang ID event seed, không sửa policy để chiều fixture |
| `node scripts/test-db.cjs --migrate --seed --runTestsByPath tests/p5-transactions.spec.ts tests/p5-organization.spec.ts` | Race/replay/TTL/fixture đúng | 19 pass/1 fail: expired key còn kiểm target cũ — RED hợp lệ bổ sung; sửa chỉ record còn TTL tham gia replay authorization |
| `node scripts/test-db.cjs --migrate --seed --coverage` | Full suite GREEN | Lần đầu 66 pass/1 fail vì test seed đếm mọi org; giới hạn đúng hai demo org và user seed, không xóa tenant test để đạt PASS |
| `npm run test:m1` sau sửa isolation test seed | Regression M1 + P5 | 16 suites/67 tests PASS, 23.133s (trước test clean bootstrap bổ sung) |
| `node scripts/compose-smoke.cjs --p5` lần đầu | DB mới không demo seed phải tạo org được | App/auth healthy, create org 500 thay 201 — FAIL hợp lệ, phát hiện thiếu reference RBAC |
| `node scripts/test-db.cjs --migrate --seed --runTestsByPath tests/p5-upgrade.spec.ts` trước reference migration | Tái hiện clean bootstrap | 1 pass/1 fail, create org 500 thay 201 — RED hợp lệ |
| Cùng lệnh sau reference migration | Upgrade + clean bootstrap GREEN | 2 tests PASS, 1.847s; create org 201/authorization allowed, không có demo user/org |
| `npm run test:m1` với cả ba migrations và matrix đầy đủ | Full regression/coverage >=80% | 16 suites/**68 tests PASS**, không skipped; xem coverage bên dưới |
| `node scripts/compose-smoke.cjs --p5` sau reference migration | Build + container auth/P5/persistence/network | Exit 0 — PASS; project `lamu-m1-smoke-1794649334503`, evidence riêng bên dưới |
| `npm audit --omit=dev --audit-level=moderate` | Production dependency audit | Exit 0, **0 vulnerabilities**; không phải full dev/tooling/OS image scan |
| `npm run format:check` / `git diff --check` | Format/whitespace hợp lệ | Exit 0 — PASS |

Các lỗi setup/compiler không được tính RED: login fixture ban đầu gửi thừa display_name và nhận 400; DTO implements indexed-access gây TS2500 đã sửa type alias; Prisma client generate sạch có `.js` specifier trong TypeScript khiến Jest không resolve source, đã bổ sung Jest relative `.js` mapper (Node runtime vẫn chạy compiled JS). Lần test env thiếu JWT_SECRET/Docker trước xác nhận ghi riêng ở P0. Không che lỗi setup bằng skip hoặc tính coverage của run thất bại là nghiệm thu.

## Mapping yêu cầu → test → RED/GREEN

| Guarantee theo P5 | Test target thực tế | Loại/provider | Bằng chứng |
|---|---|---|---|
| DTO/status/error, hai event schema, Gateway không có internal paths | `tests/p5-contract.spec.cjs` + contracts:check | Contract/Ajv/OpenAPI | RED 4 fail → GREEN; extra field/version/scope/revision sai bị từ chối |
| Create org/OWNER/idempotency race/two events, response canonical, read/public/members/empty page | `tests/p5-organization.spec.ts` | NestJS Identity + Gateway + PostgreSQL thật | Route/schema RED → GREEN; concurrent create cùng key cùng org, đúng hai event |
| RBAC đủ 10 permission × ORG/EVENT × OWNER/ADMIN/SPEAKER/ATTENDEE, input/resource sai | `p5-organization.spec.ts: implements the permission matrix...` | Provider authorization thật; EVENT ID là fixture | GREEN; invalid combo 400, ADMIN thiếu manage, SPEAKER chỉ E1/read, ATTENDEE deny |
| Org A/B, header giả, thiếu token/key, UUID/body/query sai, không leak email, LOCKED/INACTIVE | `tests/p5-organization.spec.ts` và regression M1 JWT/security | Gateway/Identity/DB thật | GREEN; org khác 403; subject check có reason đúng, internal public user LOCKED 404 |
| Replace/no-op/replay/canonical roles order, empty roles và last OWNER | `tests/p5-organization.spec.ts`, `tests/p5-transactions.spec.ts` | DB thật | GREEN; không đổi roles không tăng revision/event; remove last OWNER 409 |
| Hai OWNER cạnh tranh hạ quyền | `p5-transactions.spec.ts: serializes two OWNER self-demotions...` | Hai transaction PostgreSQL thật | GREEN; đúng một commit, một LAST_OWNER_REQUIRED, vẫn còn OWNER |
| Actor đổi quyền khi chờ khóa và sau resolve; thứ tự mutation trước demotion | `p5-transactions.spec.ts: rechecks actor permissions...`, `allows the mutation...`, resolver recheck | DB connections + pg_stat_activity lock barrier; Event fixture | GREEN; quyền cũ không được dùng sau lock/remote wait; commit trước demotion giữ state, replay sau mất quyền 403 |
| Key scope actor/operation, hash target/body, race/replay/conflict/TTL/timeout | `tests/p5-transactions.spec.ts` | PostgreSQL thật + injected clock | TTL RED → GREEN; 24h không gia hạn replay; expired key dùng target mới; advisory key lock chờ ~2s rồi IDEMPOTENCY_IN_PROGRESS, không result/event |
| EVENT mapping E1/E2, unknown/wrong org/invalid/offline/timeout và replay | `tests/p5-transactions.spec.ts` | Fixture resolver inject riêng, HTTP app/DB thật | GREEN; 404/403/502/504; timeout là lỗi synthetic từ fixture, chưa đo HTTP Event timeout thật |
| Default thiếu resolver fail closed | `p5-organization.spec.ts: replaces roles once...` | Normal app composition, không fixture | GREEN; 409 EVENT_SCOPE_UNVERIFIED, không assignment/membership một phần |
| Rollback mutation/revision/assignments/outbox/result | Outbox fault trigger trong hai suite P5 | PostgreSQL trigger/transaction thật | GREEN; create fail ở MembershipChanged sau OrganizationCreated vẫn rollback event đã insert; replace fail giữ roles/revision và không success record |
| Upgrade giữ dữ liệu M1, constraint/FK/unique và reference provisioning | `tests/p5-upgrade.spec.ts` | Database riêng trong PostgreSQL test | GREEN; SQL M1 với user/session/org/role/assignment/pending UserRegistered → schema P5 → reference data; snapshot trước/sau giữ invariants, OWNER ID cũ, lặp reference provisioning an toàn |
| Migration-ready DB mới không local demo seed | `p5-upgrade.spec.ts: creates an organization on a migrated empty DB...` | DB sạch + Identity HTTP thật | RED 500 → GREEN 201/allow; đúng một user/org nghiệp vụ được tạo bởi test |
| Build Node16/container app/network/restart/redeploy/state | `scripts/compose-smoke.cjs --p5` | Images/Compose/PostgreSQL thật | PASS; Gateway public duy nhất, Identity/DB không publish host port, Jest/tsx không có runtime app |
| Auth/session M1 giữ nguyên | 12 suites M1 trong full run; container auth flow | Provider thật; clock/stub chỉ ở test đã chỉ rõ M1 | PASS; logout A/B, rotation, mismatch/retry, TTL và request context giữ semantics M1 |

## Coverage, artifacts và giới hạn bằng chứng

Full run cuối: **16 suites/68 tests PASS, 27.155s**; statements **98.19%**, branches **90.90%**, functions **100%**, lines **98.32%**. Jest global threshold 80% PASS, source app/runtime không gồm generated Prisma/main. Bootstrap negative config vẫn có subprocess tests M1; positive startup kiểm image thật. Các nhánh chưa phủ gồm permission/storage drift, một số decorator/default/invalid slug/context paths và revision guard dư sau DB constraint; không tuyên bố 100% mọi nhánh. Coverage không đo SQL trong migration hoặc chứng minh mọi interleaving.

[M2_P5_COMPOSE_EVIDENCE_01.json](M2_P5_COMPOSE_EVIDENCE_01.json) ghi image IDs/PostgreSQL/project và các gate. [M2_P5_ARGON2_BASELINE_01.txt](M2_P5_ARGON2_BASELINE_01.txt) là baseline synthetic container, không SLA. [M1_COMPOSE_EVIDENCE_01.json](M1_COMPOSE_EVIDENCE_01.json) đã được chạy lại sau Node16 trước P5, project `lamu-m1-smoke-1794648203384`; không dùng image trước Node16 thay bằng chứng mới. [M2_P5_ARTIFACT_VERSIONS_01.json](M2_P5_ARTIFACT_VERSIONS_01.json) ghi SHA-256, working tree không có checkpoint commit theo yêu cầu người dùng. Model Prisma khai onUpdate NoAction cho ba FK idempotency để khớp DDL PostgreSQL mặc định; không thay SQL migration đã chạy.

ORG API/authorization provider và Gateway là ứng dụng thật. EVENT ownership/timeout/error resolver chỉ fixture/test injection; không Event service/network thật. Race/constraint/transaction/rollback dùng PostgreSQL thật, không SQLite/mock DB. Upgrade test chạy chính SQL migration trên DB tổng hợp từ M1; chưa phải restore/cutover database production-sized. Compose redeploy cùng version không được dùng thay upgrade test.

## Security review P5

Đã rà source và đối chiếu tests cho auth context, tenant isolation và privilege escalation:

- Actor mutation chỉ từ ContextGuard/Gateway JWT M1; không lấy actor/role từ header client tự khai hoặc body. Proxy whitelist key/context và encode path params; JWT/header spoof regression vẫn PASS. Internal check subject do caller nội bộ tin cậy truyền, không có Gateway route/Swagger operation.
- Permission scope kiểm trước lookup subject, ACTIVE đọc từ DB hiện tại; ADMIN không quản lý member, SPEAKER/ATTENDEE không được ORG hoặc EVENT khác. Org/target không dựa dữ liệu client làm bằng chứng ownership Event. Profile/members không trả email/hash/session.
- Key/org/user locks, đọc quyền lại và last active OWNER count ngăn stale actor/zero owner trong các mutation P5 được hỗ trợ. Event resolve không nằm dưới DB lock; sau resolve có transaction recheck. Replay không bypass quyền hoặc nhân event/revision; expired record không ép quyền trên target cũ.
- Queries runtime dùng Prisma/parameterized tagged SQL; không ghép SQL từ request. Test-only DDL dùng tên DB/UUID tổng hợp có kiểm soát, không nhận input người dùng. Key/hash/result không chứa credentials; log runtime M1 không ghi body/token. Error envelope/generic 500 giữ nguyên, HTTP validation/whitelist/rate limit M1 áp dụng P5.
- Production dependency audit PASS 0; không thay dependency/lockfile. Không triển khai cookie/browser storage/CSRF policy M4 hoặc service-to-service authentication ngoài local. Không đưa token/secret thật vào source/report.

**NOT RUN / ngoài phạm vi:** manual Swagger Try it out/DOC-01/người nhận tái hiện; production-sized migration/backup restore/OS image scan/full dev dependency audit mới; P6 invitation; worker/topology/confirm/retry/RabbitMQ M3; consumer projection revision ordering/dedupe; Event HTTP resolver/service E2E, frontend và service nghiệp vụ M4. Không cam kết lifecycle khóa user/vô hiệu membership/chuyển event org ngoài API P5 hiện có; API tương lai phải dùng giao thức quyền/khóa được review. Normal runtime không fallback fixture. Access/session trust/retention/limiter local giữ các giới hạn M1 đã chốt.
