# M2/P6 — Invitation implementation evidence

Ngày: 14/11/2026 (Asia/Saigon). **P6 đã triển khai; M2 đã được người dùng nghiệm thu.** Gate tự động PASS theo run bên dưới; manual Swagger/DOC-01 **PASS — USER-CONFIRMED** qua xác nhận “tất cả kiểm thử đã pass và đạt kết quả mong muốn hoàn thiện m2”. Xem [nghiệm thu M2](REPORT_M2_ACCEPTANCE_01.md) để phân biệt nguồn bằng chứng. Không commit.

Nguồn: MASTER_PLAN/P6, HANDOFF_M2_P6_01, REVIEW_MASTER_PLAN01/F04–F07/F10/F11 và [contract P6 A–E](REPORT_M2_P6_CONTRACT_01.md). Người dùng trả lời “xác nhận toàn bộ” trước phần phụ thuộc; [ADR 0004](../../../docs/adr/0004-m2-p6-invitations.md) ghi quyết định riêng P6, không suy từ P5. Auth/session M1 và policy P5 giữ nguyên. Áp dụng NestJS/contract-first/database-migrations/TDD/security-review; không checkpoint commit vì yêu cầu người dùng ưu tiên.

## Thay đổi và hành vi

- Canonical HTTP **v1.2.0** bổ sung năm operation P6, DTO/status/error/lifecycle/pagination; Gateway projection/types sinh từ canonical, không sửa types bằng tay. Swagger public có routes P6 và không có internal. Create 201, list/accept/decline/revoke 200. Các POST cần key; actor lấy từ context đã verify của M1.
- NestJS controller mỏng, DTO whitelist và validator P5 tái dùng; business transaction ở InvitationsService trong feature organizations. OWNER ACTIVE đúng org tạo/revoke, recipient ACTIVE list/accept/decline. Email user tồn tại, snapshot normalized phía server; roles rỗng hợp lệ. Accept không nhận roles; existing membership ACTIVE/INACTIVE trả ALREADY_MEMBER, không overwrite/reactivate.
- Additive migration `202611140003_p6_invitations`: table/FK org/inviter/recipient/JSONB/status/timestamps, CHECK expiry7 ngày/lifecycle, partial unique PENDING, index inbox; thêm nullable idempotency target invitation và mở operation constraint. Không sửa migration cũ/reset/db push; không xóa backlog hoặc seed để tạo PASS. Rollback app giữ schema, production rollback bằng forward migration review riêng.
- Giao thức key → org sorted → users sorted → invitation sorted → memberships sorted; kiểm ACTIVE/quyền/recipient/URL org/expiry sau khóa. Membership-row barrier test phát hiện thiếu lock đã được sửa bằng RED/GREEN riêng. Tạo mới sau expiry chuyển lời mời cũ EXPIRED cùng transaction. GET chỉ tính effective EXPIRED; mutation chạm expiry có thể chỉ commit EXPIRED rồi trả409 ngoài transaction, không cache lỗi.
- Accept ghi membership ACTIVE/revision1/assignments từ snapshot/invitation ACCEPTED/MembershipChanged CREATED/result idempotency cùng transaction. Lỗi outbox hoặc success record rollback sạch. Các thao tác không đổi membership không event/revision mới.
- Key scope actor/operation, normalized hash method/path target/body; TTL24h/lock2s, success-only result. Replay kiểm quyền hiện tại, không đòi PENDING hoặc điều kiện mutation cũ; accept replay không đòi inviter còn OWNER/role hiện tại bằng snapshot, nhưng recipient và membership kết quả phải ACTIVE. TTL hết xử lý fresh state. Không cleanup worker hoặc exactly-once vô hạn.
- EVENT create/accept resolve ngoài khóa, mở lại transaction và kiểm local policy. Chỉ fixture resolver tiêm từ test; default runtime fail closed, success replay không resolve lại. Không Event HTTP thật, invitation event/email/consumer mới, worker RabbitMQ hoặc frontend.

## Lệnh thực sự chạy, expected và actual

Runtime Node24.19.0/npm11.17.0; versions dependency pin trong root lockfile giữ nguyên. PostgreSQL **16.15** qua image postgres:16-alpine, DB container riêng tmpfs/loopback; Compose project/volume test riêng. Credentials ngẫu nhiên chỉ trong RAM, không in token/secret vào report. ORG/Identity/Gateway/PostgreSQL là provider thật; EVENT mapping/error/timeout chỉ fixture synthetic.

| Lệnh/gate | Expected | Actual |
|---|---|---|
| `git status --short` trước sửa | Bảo toàn working tree cũ | M1/P5 dirty có sẵn, giữ nguyên; không commit |
| `npm run typecheck`; `npm run contracts:check` baseline | Build/typecheck/contracts M1/P5 | Exit0 PASS |
| `node scripts/test-db.cjs --migrate --seed --coverage` baseline | Chạy mới M1/P5 | 16 suites/68 tests PASS, 26.317s; statements98.19/branches90.90/functions100/lines98.32% |
| `npm test -- --runTestsByPath tests/p6-contract.spec.cjs` trước contract | RED thiếu P6 | Exit1, 2 tests fail: route undefined và thiếu InvitationAction — RED hợp lệ |
| `node scripts/contract-projection.cjs`; `npm run generate:contracts`; `npm run contracts:check` | Contract/projection/generated types hợp lệ | Generator pinned7.10.1; lần đầu checker phát hiện OpenAPI3.0 không cho required:[]; bỏ keyword rỗng, generate lại; checker exit0 |
| `npm test -- --runTestsByPath tests/p6-contract.spec.cjs tests/p5-contract.spec.cjs tests/p0-contract.spec.cjs` | Contract GREEN, giữ M1/P5 | 3 suites/8 tests PASS, 0.846s |
| `node scripts/test-db.cjs --migrate --seed --runTestsByPath tests/p6-invitation.spec.ts` trước production P6 | API/constraint suite RED | 8 tests fail vì route404 — target biên dịch và thực sự chạy, RED hợp lệ |
| Cùng lệnh sau implementation | API GREEN | Lần đầu5 pass/3 fail: Error canonical thiếu enum lỗi invitation; bổ sung canonical rồi generate; run sau8/8 PASS, 4.066s |
| `npm run db:generate -w @lamu/identity` | Client theo schema P6 | Exit0 Prisma7.10.1 |
| `node scripts/test-db.cjs --migrate --seed --runTestsByPath tests/p6-transactions.spec.ts tests/p6-invitation.spec.ts` | API/race/replay/fixture/rollback | 2 suites/24 tests PASS, 13.157s, trước tests bổ sung cuối |
| `node scripts/test-db.cjs --migrate --seed --runTestsByPath tests/p6-transactions.spec.ts --testNamePattern membership-row` trước khóa membership | RED thiếu barrier membership | 1 failed/16 deselected: không quan sát lock wait, accept đi qua khi inviter membership đang bị khóa — RED hợp lệ |
| Cùng command sau thêm membership locks | GREEN cùng reproducer | 1 pass/16 deselected, 1.983s. Deselected do filter, không phải suite cuối bị skip |
| `node scripts/test-db.cjs --migrate --seed --coverage` các run tăng dần | Full regression >=80% | 95/95 PASS (45.573s), rồi98/98 PASS (47.366s); giữ kết quả trước khi thêm coverage cases, không dùng thay run cuối |
| Cùng command full cuối | M1/P5/P6 + upgrade/constraint/race/coverage | **20 suites/99 tests PASS, không skipped**, 45.302s, container `lamu-m1-test-1794652512153`, exit0 |
| `node scripts/compose-smoke.cjs --p6` | Images + auth/P5/P6/network/persistence | Exit0 PASS project `lamu-m1-smoke-1794652173069`; artifact01 trước membership-lock refinement |
| `node scripts/compose-smoke.cjs --p6 --evidence-run=02` | Rebuild source sau sửa membership lock, không ghi đè artifact01 | Exit0 PASS project `lamu-m1-smoke-1794652405564`, artifact02 là bằng chứng container sau sửa khóa |
| `npm run typecheck` cuối | Build runtime/Identity/Gateway và tests | Exit0 PASS |
| `npm run contracts:check`; `npm run format:check`; `git diff --check` cuối | Contract/projection/format/whitespace | Exit0 PASS |
| `npm audit --omit=dev --audit-level=moderate` | Audit production dependencies | Exit0, **0 vulnerabilities**; không phải audit OS image hoặc dev/tooling |

Các lỗi TypeScript lúc triển khai không tính RED: implements full CreateInvitation bị union scope không tương thích với DTO trước validation (đổi implements Pick email, domain normalize đảm bảo role scope); InputJsonObject readonly (tạo object response mới); test helper unknown body không hợp Supertest type (đổi annotation object). Không skip/sửa policy để che lỗi. Initial Error enum thiếu được canonical response tests phát hiện, đã ghi lại thay vì coi handler success là đủ bằng chứng contract.

## Mapping guarantee → test → bằng chứng

| Guarantee theo kế hoạch/người dùng | Test target | Loại/provider | Evidence |
|---|---|---|---|
| Routes/auth/key/status, action body không roles, empty inbox/closed schema | p6-contract.spec.cjs + p6-invitation.spec.ts | OpenAPI/Ajv/HTTP thật | Contract2 RED →8 contract tests GREEN; response/error serialized validate canonical |
| OWNER tạo → recipient login/list/accept → users/me thấy scoped role | p6-invitation: creates/lists/accepts through Gateway | Gateway/Identity/DB/JWT thật | GREEN, success DTO/replay/Swagger/internal exclusion |
| Wrong recipient/org/role, token/key thiếu, email unknown, bad query, tenant privacy | p6-invitation: validates actor... | Identity HTTP + Gateway thiếu token | GREEN 400/401/403/404; inbox người khác rỗng, không email/contact |
| LOCKED user/inviter, INACTIVE membership, OWNER mất quyền; decline vẫn được | p6-invitation: blocks LOCKED...; p6-transactions: demote/lock/inactive wait | DB thật, injected clock | GREEN; không membership/event/result accept |
| PENDING duplicate, expired-before-create race, effective read-only expiry, revoke bởi OWNER khác | p6-invitation: expires...; expires old PENDING...; p6-transactions create races | Constraint/transactions PostgreSQL thật | GREEN; một PENDING, terminal old EXPIRED, list order/pagination; không membership mới |
| Không ghi đè ACTIVE/INACTIVE membership, snapshot không lấy từ client | p6-invitation: rejects duplicate... + extra body roles | PostgreSQL/API thật | GREEN ALREADY_MEMBER; không reactivate/roles/event |
| Accept race accept/decline/revoke, cùng key chỉ một commit/event | p6-transactions: accepts once...; accept racing each | PostgreSQL thật | GREEN, một terminal winner; membership/event count đúng state |
| Expiry/quyền sau chờ org/invitation/membership locks | p6-transactions rechecks/waits tests | Hai connection + pg_stat_activity barrier | Membership barrier RED → GREEN; org/invitation expiry không dùng transaction-start time |
| Replay sau role change/inviter demotion/expiry, deny sau membership INACTIVE | p6-transactions: accepts once... + scopes keys... | P5 API thật/DB + clock | GREEN; replay không resolve/mutate/revision/outbox; key mới terminal409 |
| Idempotency actor/operation/target/body conflict, TTL không kéo dài, expired target mới, timeouts | p6-transactions scopes/reuses/conflicts/times out tests | DB advisory/row locks thật | GREEN; key2s IDEMPOTENCY_IN_PROGRESS, org lock CONFLICT; không success giả/cache trái quyền |
| Atomic rollback khi outbox hoặc result write fail | p6-transactions rolls back... | PostgreSQL trigger fault injection | GREEN snapshot before/after invitation/members/roles/revision/outbox/result bằng nhau; retry sau gỡ trigger thành công |
| EVENT đúng/sai org/unknown/malformed/offline/timeout; create/accept recheck sau resolve | p6-transactions EVENT tests | Fixture resolver inject riêng; Identity/DB thật | GREEN; lỗi không partial membership; default normal pair thiếu resolver fail closed cả create/accept; replay không resolve lại |
| Upgrade giữ users/session/org/roles/revision7/idempotency/PENDING outbox | p6-upgrade.spec.ts | DB riêng chạy SQL M1+P5 rồi P6 | GREEN snapshot giữ toàn bộ, chỉ thêm nullable target metadata; không production-sized restore |
| Auth/session M1 và policy P5 | Các suites M1/P5 trong full99 + Compose | Provider thật theo giới hạn tests gốc | GREEN; không đổi auth/session hoặc rule P5 |
| Container/network/persistence/seed/refdata/bootstrap | compose-smoke --p6 --evidence-run=02 | Compose images/PostgreSQL thật | PASS, P5+P6 flow, migration redeploy/restart giữ invitation/idempotency/revision/backlog; Identity/DB không host port |

## Coverage, artifact và giới hạn

Run cuối: statements **98.05%**, branches **91.44%**, functions **98.76%**, lines **98.11%**; global thresholds80% PASS. Source app/runtime, không generated Prisma/main như config sẵn có. Invitation service statements97.38/branches95.52/functions100/lines97.29%. Các nhánh chưa phủ gồm permission/reference drift guard, invalid stored idempotency target và expiry sát ranh trong processing; hai Gateway decline/revoke wrappers không chạy trong Jest nhưng đã chạy bằng container Compose. Không coi coverage là proof mọi interleaving hoặc SQL coverage. Test TTL dùng injected clock; real PostgreSQL constraints/transaction/race không mock DB/SQLite.

[Compose artifact01](M2_P6_COMPOSE_EVIDENCE_01.json) và [artifact02](M2_P6_COMPOSE_EVIDENCE_02.json) giữ riêng cả hai run; corresponding Argon2 baselines01/02 không SLA. Không ghi đè artifact M1/P5. Artifact02 có source runtime sau membership-lock fix; thay title metadata Gateway projection thành P5/P6 sau khi build context đã đọc được kiểm bằng final contract checker, không dùng container run để chứng minh title mới. [Manifest](M2_P6_ARTIFACT_VERSIONS_01.json) ghi hash final source/contracts/tests và image IDs quan sát, không claim provenance từ commit vì không commit.

## Security review đã thực hiện

- Rà JWT/context guard/proxy allowlist và năm route; actor từ verified sub/sid, không body/client identity header. Internal không public/Swagger. Bốn POST nhận một key hợp lệ, không tự retry mutation. Lỗi generic/envelope/request ID giữ M1. Missing/invalid auth và tenant checks được regression/API/Compose chứng minh trong phạm vi đã ghi.
- OWNER policy explicit bên cạnh org.member.manage; current user/membership ACTIVE đọc lại sau org/users/invitation/membership locks. Recipient/URL org kiểm trước trả cache/conflict. Invitee email lookup chỉ trả kết quả sau OWNER authorization; inbox không contact/hash/token. Không cấp quyền từ email hoặc org/event client khai.
- Snapshot immutable qua API, roles scoped/unique/canonical; accept empty-body whitelist, không role override. Membership tồn tại kể cả INACTIVE bị từ chối. EVENT runtime không fixture fallback, resolve ngoài locks rồi transaction recheck. Race/rollback/replay tests kiểm privilege escalation và stale rights; accept hợp lệ trước demotion được giữ.
- Runtime SQL dùng Prisma/parameterized tagged SQL, không nối input thành SQL. DDL dynamic trong test chỉ tên/UUID synthetic từ randomUUID và DB name regex; không API người dùng. JSONB CHECK chỉ shape mức array; domain DTO/normalize/resolver kiểm role/scope, không tuyên bố DB CHECK một row chứng minh quan hệ Event.
- Key/hash/result không chứa token/password; không thêm log body hoặc credentials; không thêm dependency. Production audit0 vulnerabilities. Đã rà source/report mới, không ghi secret/token thật. Không mở cookie/frontend/CSRF flow hoặc service-to-service trust mới ngoài giới hạn network local M1.

Không phát hiện security blocker còn mở trong phạm vi P6 đã kiểm; không phải chứng nhận production. Manual Swagger/DOC-01 được người dùng xác nhận PASS sau implementation, xem báo cáo nghiệm thu M2; không ghi thành Codex trực tiếp chạy manual. **NOT RUN / ngoài phạm vi:** chạy riêng REST collection `requests/m2-p6.http` (không suy từ Swagger); migration trên production-sized backup/restore; audit dev/OS image; Event HTTP thật/lifecycle chuyển org; worker RabbitMQ M3/consumer projection/delivery; frontend/email M4. User LOCKED/membership INACTIVE do test fixture, không thêm API lifecycle mới hoặc cam kết mọi race của API tương lai.

Cập nhật nghiệm thu: M2 COMPLETE theo [REPORT_M2_ACCEPTANCE_01.md](REPORT_M2_ACCEPTANCE_01.md). Không chạy lại tests/coverage/Compose trong lượt chốt tài liệu; các số liệu tự động bên trên giữ nguyên nguồn/lượt chạy.
