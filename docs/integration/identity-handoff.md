# Theo dõi bàn giao Identity và Gateway cho các service

Ngày khởi tạo: 13/11/2026 (Asia/Saigon). Nguồn: [kế hoạch Identity/Gateway](../../services/identity-service/MASTER_PLAN.md), [review F13](../../services/identity-service/report/REVIEW_MASTER_PLAN01.md).

Đây là nơi cập nhật **tiến độ bàn giao liên service**, người phụ trách, người nhận/review, phiên bản artifact và bằng chứng. Không lưu token, password hoặc thông tin cá nhân thật trong bảng/bằng chứng. Không coi việc tạo tài liệu này là đã freeze contract hoặc đã hoàn thành backend.

## 1. Cập nhật ở đâu?

| Thông tin cần cập nhật | Vị trí chính | Cách cập nhật |
|---|---|---|
| Trạng thái bàn giao, phụ thuộc, lịch hẹn, người nhận | §2 và nhật ký §5 của file này | Cập nhật từng H01–H05; dẫn tới commit/PR/artifact và bước tiếp theo |
| Quyết định P0 và bằng chứng theo quyết định | [§6 của file này](#p0-decisions) | Cập nhật D00–D13, nguồn chốt, liên kết H, trạng thái implementation/evidence; không đánh đồng ACCEPTED với PASS |
| Phạm vi M1–M4 và trình tự P0–P8 | [MASTER_PLAN.md](../../services/identity-service/MASTER_PLAN.md) | Ghi thay đổi scope/decision khi đã thống nhất; không đánh hoàn thành chỉ vì contract đã review |
| API, auth headers, DTO/status/error và idempotency | [API catalog](../api/catalog.md) | Là nguồn danh mục API bản nháp hiện tại; đồng bộ spec khi freeze |
| OpenAPI máy đọc | M1: [Identity canonical](../../shared/contracts/http/identity.openapi.json), [Gateway projection](../../shared/contracts/http/gateway.openapi.json); Event vẫn là đầu ra M4 chưa có | Consumer types generate từ canonical; Gateway projection được check; không tạo hai payload authority. Đường dẫn docs/api trước đây là dự kiến, chưa tạo bản sao |
| Permission/role và quyết định kiến trúc | [docs/architecture.md](../architecture.md), [ADR](../adr/README.md) | Giữ 10 permission/four roles thống nhất; ghi quyết định thay đổi ảnh hưởng dài hạn |
| Event payload, schema version và trigger | [Event contracts](../../shared/contracts/events/README.md) và JSON Schema versioned tại cùng thư mục khi tạo | F05 có resolver handoff; F10 có MembershipChanged draft. Markdown chưa thay JSON Schema thực thi |
| Exchange/routing/queue, policy delivery/retry | `docs/api/messaging.md` | File cần tạo khi freeze topology; chưa coi routing dự kiến là cấu hình đã chạy |
| Hướng dẫn chạy và dữ liệu demo/test | [Identity README](../../services/identity-service/README.md), [Gateway README](../../gateway/README.md) | Lệnh/config migration/seed/test phải theo mốc đã triển khai; không commit secret |
| Kết quả kiểm thử và nghiệm thu | Báo cáo từng mốc tại `services/identity-service/report/` | Ghi môi trường, version, bước chạy, expected/actual và bằng chứng đã che nhạy cảm; bảng này chỉ dẫn link |

Khi contract được freeze, PR phải đồng bộ catalog/spec/schema và có bên nhận review theo quy tắc catalog. Không copy nguyên payload vào tracker hoặc duy trì nhiều bản khác shape cùng nhận là contract chính thức. Các bản đề xuất trong báo cáo chưa tự thay đổi catalog đã được duyệt.

## 2. Bảng tiến độ bàn giao

Bảng đã cập nhật bằng chứng triển khai M1 ngày 13/11/2026. Người dùng xác nhận đề xuất P0 M1; Codex thực hiện trong working tree, không commit theo yêu cầu. Các phần M2–M4/người nhận chưa được phân công giữ trạng thái riêng, không suy từ PASS tự động M1.

| ID / đầu ra | Vai trò chuẩn bị → bên nhận | Người phụ trách / reviewer thực tế | Mốc / hạn hẹn | Contract | Implementation | Integration | Bằng chứng hiện có / bước tiếp theo |
|---|---|---|---|---|---|---|---|
| H01 — Auth/JWT/context header | Identity + Gateway → Gateway, frontend và service nhận context | Codex / người dùng xác nhận P0 M1 | M1; ngày xác nhận 13/11/2026 | FROZEN phần contract M1 v1.0.0 | IMPLEMENTED M1 working tree | PASS tự động M1; manual/M4 NOT RUN | [báo cáo M1](../../services/identity-service/report/REPORT_M1_AUTH_GATEWAY_01.md); không có commit theo yêu cầu người dùng |
| H02 — Authorization check, permission/scope | Identity → Event; Registration/Payment theo API cần quyền | Chưa chốt / chưa chốt | Trước handler M2; ngày chưa chốt | DRAFT | NOT_STARTED | NOT_RUN | [Catalog Identity](../api/catalog.md), [role seed](../architecture.md); review F03 và freeze bảng scope/result, không chờ worker M3 |
| H03 — Event/org resolver | Event + Identity → hai bên tích hợp | Chưa chốt / chưa chốt | Trước tích hợp M4; ngày chưa chốt | DRAFT | NOT_STARTED | NOT_RUN | [F05 handoff](../../shared/contracts/events/README.md#identity-event-f05); chốt API nội bộ và test response/error; fixture M2 chưa phải Event E2E |
| H04 — Event Identity/schema/topology | Identity + vai trò broker → consumer tương lai có nhu cầu đã được giao | Codex / người dùng xác nhận P0 M1 | M1; ngày xác nhận 13/11/2026 | FROZEN UserRegistered v1 M1; event M2/M3 DRAFT | IMPLEMENTED outbox M1; worker M3 NOT_STARTED | PASS tự động M1; manual/M4 NOT RUN | [báo cáo M1](../../services/identity-service/report/REPORT_M1_AUTH_GATEWAY_01.md); không có commit theo yêu cầu người dùng |
| H05 — API thật/hướng dẫn/bằng chứng | Identity + Gateway → thành viên tích hợp service liên quan | Codex / người dùng xác nhận P0 M1 | M1; ngày xác nhận 13/11/2026 | FROZEN phần contract M1 v1.0.0 | IMPLEMENTED M1 working tree | PASS tự động M1; manual/M4 NOT RUN | [báo cáo M1](../../services/identity-service/report/REPORT_M1_AUTH_GATEWAY_01.md); không có commit theo yêu cầu người dùng |

Mỗi lần cập nhật phải kiểm tra thực tế thay vì giữ trạng thái khởi tạo nếu repo đã thay đổi. Chỉ ghi FAIL/BLOCKED khi có kết quả/dependency cụ thể; hiện thiếu implementation là NOT_STARTED/NOT_RUN, không phải test đã FAIL. M1–M4 không mặc định tương ứng tuần 1–4; lịch chung do nhóm thống nhất.

## 3. Quy tắc trạng thái và bằng chứng

| Trục | Giá trị | Điều kiện chuyển trạng thái |
|---|---|---|
| Contract | DRAFT → IN_REVIEW → FROZEN | IN_REVIEW có artifact/PR và reviewer; FROZEN có version/commit, bên nhận xác nhận và catalog/spec/schema liên quan đã đồng bộ |
| Implementation | NOT_STARTED → IN_PROGRESS → IMPLEMENTED | Có code/config và validation tương ứng; IMPLEMENTED cần link commit và kết quả kiểm tra, chưa có nghĩa integration PASS |
| Integration | NOT_RUN / PASS / FAIL / BLOCKED | PASS chỉ trong phạm vi test có bằng chứng; ghi provider thật hay stub, môi trường và version hai bên. FAIL có tái hiện; BLOCKED ghi dependency/hành động cần thiết |

Không dùng một ô “DONE” để thay cả ba trục. Stub/fixture có thể giúp bên nhận phát triển độc lập, nhưng không chuyển integration với provider thật thành PASS. Nếu chỉ có kết quả stub thì để integration thật NOT_RUN và ghi bằng chứng stub ở cột ghi chú.

## 4. Phụ thuộc và bộ bàn giao tối thiểu

- **H01:** gửi contract auth sớm cho Gateway/frontend; frontend chuẩn bị client theo spec được, còn chuyển sang API thật và sửa logout thuộc M4. Chốt nguồn sid theo F01 trước handler logout.
- **H02:** Event có thể viết authorization client/contract test ngay khi giao diện đã freeze, độc lập outbox M3. Khi Identity chạy thật thì chạy lại với provider thật và ghi kết quả. Không dùng stub allow-all làm cơ chế chạy bình thường.
- **H03:** Event sở hữu quan hệ event/org, Identity sở hữu permission. Resolver nội bộ không gọi ngược Identity check tạo vòng; test fixture M2 tách adapter M4. Kéo scope M4 lên sớm phải cập nhật kế hoạch đã thống nhất.
- **H04:** contract/ghi outbox phải theo mốc F02, không đợi worker M3 mới suy lại lịch sử. Event/Registration/Payment/Notification chỉ thêm consumer khi nhu cầu được giao, không mặc định phải subscribe MembershipChanged.
- **H05:** bàn giao tăng dần từng API/mốc đủ bằng chứng, không bắt service khác chờ Identity hoàn tất tất cả mốc.

Mỗi đầu ra cần: link contract version/PR, người chuẩn bị và người nhận thực tế, scope được hỗ trợ/hoãn, fixture hoặc runbook test, điều kiện lỗi/timeout, kết quả đã chạy và giới hạn. Nếu artifact chưa được tạo thì ghi đường dẫn dự kiến và trạng thái chưa có; không tạo liên kết giả hoặc đánh dấu FROZEN.

Mẫu ghi dependency khi vướng:

```text
ID: Hxx
Phần việc đang chờ:
Artifact / commit / PR:
Bên cần hành động:
Việc có thể tiếp tục độc lập:
Hạn hẹn đã thống nhất hoặc chưa chốt:
Bằng chứng / phạm vi stub hoặc provider thật:
```

## 5. Nhật ký cập nhật

| Ngày | ID | Thay đổi | Contract / commit / PR / bằng chứng | Hành động tiếp theo |
|---|---|---|---|---|
| 13/11/2026 | H01–H05 | Khởi tạo bảng theo dõi từ review F13; chưa gán cá nhân/deadline, chưa nâng trạng thái triển khai/nghiệm thu | Review và tài liệu đề xuất được liên kết tại §2; không có bằng chứng E2E | Nhóm điền người phụ trách/người nhận, lịch hẹn; review và freeze từng contract theo dependency |
| 13/11/2026 | D00–D13 / F14 | Bổ sung sổ quyết định P0 và evidence; giữ trạng thái theo nguồn hiện có, không nâng implementation/test | [Review F14](../../services/identity-service/report/REVIEW_MASTER_PLAN01.md#f14), bảng §6 | Đồng bộ quyết định được ghi nhận sang artifact liên quan, chốt đề xuất trước mốc phụ thuộc và cập nhật evidence khi thực thi |

<a id="p0-decisions"></a>

## 6. Quyết định P0 và bằng chứng

P0 áp dụng trước mốc đang triển khai. Không cần đóng mọi quyết định M4 ngay trước M1; mỗi dòng có mốc cần chốt và đầu ra H liên quan. Bảng này tóm tắt lựa chọn và trỏ tới artifact, không thay catalog/OpenAPI/JSON Schema hoặc tự tạo phê duyệt. Nguồn: [MASTER_PLAN §2.1/§2.2/P0](../../services/identity-service/MASTER_PLAN.md) và [review F14](../../services/identity-service/report/REVIEW_MASTER_PLAN01.md#f14).

### 6.1 Sổ quyết định

| ID / vấn đề | Lựa chọn hoặc việc cần chốt | Mốc cần chốt / bàn giao | Trạng thái quyết định / nguồn | Artifact cần cập nhật | Test / bằng chứng dự kiến |
|---|---|---|---|---|---|
| D00 — Nền tảng đã chốt | TypeScript/NestJS, DB riêng, HS256 Identity ký/Gateway verify, access 15 phút, refresh 7 ngày, logout phiên hiện tại, nhiều OWNER, lời mời user tồn tại | P0/M1–M2; H01/H02/H05 | ACCEPTED_SOURCE — MASTER_PLAN §2.1; không hỏi lại các lựa chọn này | Catalog, kiến trúc/ADR, spec và config khi tạo; không suy đã đồng bộ chỉ vì được ghi ở kế hoạch | AUTH/SES/OWN/INV, AC-001/003/011; bằng chứng runtime NOT_RUN |
| D01 — Phiên bản công cụ/dependency | Node 24.19.0, NestJS 11.2.10, Prisma/client/adapter 7.10.1, Argon2 0.45.2, npm/Jest, root lockfile | Trước scaffold/migration M1; H01/H05 | ACCEPTED M1 — người dùng xác nhận 13/11/2026; ADR 0002, versions/lockfile đã pin | ADR hoặc quyết định kỹ thuật có version; package/lockfile, Dockerfile và README khi triển khai | Build/typecheck/test và Argon2 chạy trong container; không coi package frontend là lock backend |
| D02 — Verified session context | Gateway tạo X-User-Id/X-Session-Id từ sub/sid đã verify, chuẩn hóa request ID và chặn header client; giới hạn trust local | Trước contract logout M1; H01 | ACCEPTED M1 — người dùng xác nhận 13/11/2026; ADR 0002 | Catalog §0/§1, Identity/Gateway OpenAPI, ADR khi cần | AC-001, SES-05, JWT-03 và các ca header giả/trùng |
| D03 — Auth/error/health contract | Success auth POST 200; chốt LOCKED, logout retry, 502/504, đề xuất readyz và startup validation | Trước endpoint/gate M1; H01/H05 | ACCEPTED M1 — người dùng xác nhận 13/11/2026; ADR 0002, retention tới expires_at + 15 phút, chưa cleanup | Catalog/OpenAPI, cấu hình healthcheck và README; readyz/UPSTREAM_TIMEOUT chưa là artifact đã triển khai | Các ID F11-AUTH/SES/INF/GW/API, AC-011 |
| D04 — Thời điểm bảo đảm outbox | Ghi outbox cùng mutation từ M1; M2 bổ sung event, worker M3; seed không phát ngoài test chỉ định | Trước mutation đầu tiên M1; H04/H05 | ACCEPTED_SOURCE — yêu cầu triển khai hiện tại + MASTER_PLAN §2.1; đã đồng bộ catalog/migration | MASTER_PLAN §6/P1/P2, catalog, migration/outbox design; không giả đã có SQL chạy | AC-002, EVT-01; upgrade dữ liệu và rollback |
| D05 — Authorization input/result | Chốt field ORG/EVENT, permission-resource matrix, validation/deny/reason và account status | Trước handler M2; H02 | PROPOSED — F03 | Catalog, role seed/architecture và Identity OpenAPI | AC-003, RBAC-01–04; provider thật tách fixture |
| D06 — Idempotency | Unique actor/operation/key; hash method/target/body; đề xuất TTL 24 giờ; replay authorization, timeout và cleanup | Trước mutation M2; H02/H05 | PROPOSED — F04; 24 giờ chưa phải TTL đã duyệt | Catalog, schema/migration và API contract | IDEM-01, AC-004; race, target khác, crash và TTL bằng clock |
| D07 — Persistence constraints và khóa | Đề xuất CITEXT, ORG assignment NULL, unique nullable, shape invitation, FK nội bộ; khóa org/kiểm lại quyền theo F06 | Schema nền M1, phần invitation/idempotency M2; H02/H05 | ACCEPTED phần schema M1 — người dùng xác nhận 13/11/2026; phần khóa/invitation M2 vẫn PROPOSED | DDL/Prisma design, SQL migration có review và mapping DTO/DB; không dùng db push thay lịch sử | AC-006/007, OWN-01/02; seed hai lần và upgrade không reset |
| D08 — Invitation policy chi tiết | Đề xuất hết hạn 7 ngày; freeze status/error, role snapshot server-side, retry accept với cùng/key khác | Trước invitation M2; H02/H05 | PROPOSED — MASTER_PLAN §2.2 và F11; nghiệp vụ mời user tồn tại đã chốt tại D00 | Catalog/OpenAPI, invitation schema và README | INV-01–06, F11-INV-01/02 |
| D09 — Event/org resolver | EVENT scope M2 fixture; M4 API nội bộ authorization-context, trust/error/timeout và giới hạn lifecycle | Chuẩn bị interface M2; freeze trước integration M4; H03 | PROPOSED — F05; không tự kéo M4 lên M2 | Ghi chú [F05](../../shared/contracts/events/README.md#identity-event-f05), catalog và Event OpenAPI khi tạo | AC-005; DRAFT, wrong org, timeout, không vòng gọi; integration Event thật NOT_RUN |
| D10 — Điều kiện publish thành công | Durable topology/persistent/mandatory/confirm + return; tương quan từng attempt, retry giữ ID, mark SENT có điều kiện | Trước worker M3; H04 | PROPOSED — F08 | `docs/api/messaging.md` khi tạo, worker config/README và outbox fields | AC-008, EVT-02/03; unroutable, crash và song song |
| D11 — Broker storage/lifecycle | Named volume, node identity ổn định, image kiểm thử, chuyển storage cũ và phạm vi backup/replay | Trước gate broker M3; H04/H05 | PROPOSED — F09 | Compose, messaging/runbook và hướng dẫn phục hồi; chưa đổi config vì bảng này | AC-009; restart/recreate/down-up giữ storage trên project test riêng |
| D12 — MembershipChanged | Snapshot assignment có scope, trigger, schema version 1 và membership_revision độc lập; không tự thêm consumer MUST | Trước ghi MembershipChanged M2 theo D04; freeze delivery M3; H04 | PROPOSED — F10 và [event contract draft](../../shared/contracts/events/README.md#membership-changed-f10) | JSON Schema versioned khi tạo, migration revision, messaging contract; Markdown chưa là schema validator | AC-010; trigger/no-op/rollback/retry, revision 6 trước 5, conflict và duplicate |
| D13 — Tham số Argon2/baseline | Đề xuất memory 19456 KiB, iterations 2, parallelism 1; đo container trước khi chốt tham số chạy; không có SLA performance được cung cấp | Trước chốt runtime/bàn giao M1; H01/H05 | ACCEPTED cấu hình/baseline M1 — người dùng xác nhận 13/11/2026; đo container, không có SLA | ADR/config và báo cáo baseline khi có; chỉ ghi số đo thực tế | AUTH-01, benchmark có môi trường/concurrency/p50/p95/error rate; hiện NOT_RUN |

Các đường dẫn spec/messaging/JSON Schema ghi “khi tạo” là đầu ra dự kiến, không phải file đã được kiểm chứng tồn tại. Chốt event schema trước lúc ghi payload vào outbox không đồng nghĩa worker phải publish ngay; M3 gửi payload gốc đã lưu. Quyết định chưa đóng phải được giải quyết trước phần việc phụ thuộc, không đợi phát hiện khi nghiệm thu.

### 6.2 Trạng thái, người phụ trách và triển khai

- **PROPOSED:** lựa chọn/giá trị đang đề xuất, chưa có nguồn xác nhận chốt. **IN_REVIEW:** có artifact cụ thể và reviewer thực tế đang xem xét.
- **ACCEPTED_SOURCE:** đã có quyết định trong tài liệu nguồn được chỉ rõ; không xin xác nhận lại. **RECORDED_REVIEW:** lựa chọn đã được ghi vào review nhưng chưa được đồng bộ đầy đủ sang artifact triển khai/contract.
- **ACCEPTED:** đề xuất đã được chốt với nguồn quyết định/reviewer, artifact và version/commit/PR được ghi nhận. Không tự chuyển ACCEPTED bằng việc tạo dòng trong tracker. Contract FROZEN vẫn theo §3 và có yêu cầu đồng bộ/review bên nhận.
- Khi thay lựa chọn, ghi quyết định thay thế và lý do trong nhật ký, giữ nguồn lịch sử; contract đã freeze cần review bên bị ảnh hưởng. Chi tiết kỹ thuật thường lệ được xử lý trong phạm vi được giao; thay đổi nghiệp vụ/phạm vi/rủi ro đáng kể phải xác minh riêng theo workflow.

| Phạm vi decision | Người phụ trách thực tế | Reviewer / nguồn chốt bổ sung | Implementation | Verification | Evidence |
|---|---|---|---|---|---|
| D00 | Codex triển khai M1 | MASTER_PLAN §2.1 / người dùng | IMPLEMENTED M1 working tree | PASS tự động M1 | [Báo cáo M1](../../services/identity-service/report/REPORT_M1_AUTH_GATEWAY_01.md); M2–M4 NOT RUN |
| D04 | Codex triển khai M1 | Yêu cầu hiện tại / ADR 0002 | IMPLEMENTED outbox M1 | PASS transaction/schema M1 | [báo cáo M1](../../services/identity-service/report/REPORT_M1_AUTH_GATEWAY_01.md); delivery M3 NOT RUN |
| D01–D03, D07-M1, D13 | Codex triển khai M1 | Người dùng xác nhận đề xuất P0 ngày 13/11/2026, ADR 0002 | IMPLEMENTED M1 working tree | PASS tự động theo phạm vi | [báo cáo M1](../../services/identity-service/report/REPORT_M1_AUTH_GATEWAY_01.md); manual handoff NOT RUN |
| D05/D06/D08–D12 và phần M2 của D07 | Chưa gán | Giữ PROPOSED theo mốc phụ thuộc | NOT_STARTED | NOT RUN | Không tự kéo scope M2–M4 vào M1 |

Bảng này được nhóm tách thành từng dòng decision khi phân công hoặc trạng thái khác nhau. Không giả định một người xử lý mọi decision hoặc tự đặt ngày hẹn. Khi code/config đã có, cập nhật implementation độc lập verification; kế thừa trạng thái H ở §2 không thay bằng chứng theo decision. NOT_RUN không phải FAIL và không được tính PASS.

### 6.3 Nhật ký bằng chứng theo decision

Mỗi kết quả thực thi phải có một dòng evidence (E-ID) và liên kết tới báo cáo/artifact thật. Không tạo đường dẫn giả cho kết quả chưa có, không lưu credentials. Mẫu trống bên dưới không phải một lần test đã chạy.

| Evidence ID | Decision / H | Test ID / phạm vi | Commit/version và môi trường | Expected / actual | Kết quả | Artifact / request ID đã che nhạy cảm |
|---|---|---|---|---|---|---|
| E-M1-P0 | D01–D04 / H01/H04 | Contract OpenAPI/schema/projection | Working tree, spec 1.0.0, Node 24.19 | RED thiếu artifact → GREEN 2 test; consumer types sinh được | PASS | [P0](../../services/identity-service/report/REPORT_M1_P0_CONTRACT_01.md) |
| E-M1-P1 | D01/D03/D07-M1 / H05 | Migration, seed, health/constraints | PostgreSQL 16 container test riêng | DDL/seed RED → GREEN; Compose healthy, port isolation | PASS | [P1](../../services/identity-service/report/REPORT_M1_P1_INFRA_DATABASE_01.md) |
| E-M1-P2 | D04/D13 / H01/H04 | Register/login/outbox | Identity/Gateway thật + DB test | RED 404 → GREEN; race và rollback nguyên tử | PASS | [P2](../../services/identity-service/report/REPORT_M1_P2_REGISTER_LOGIN_01.md) |
| E-M1-P3 | D02/D03 / H01 | JWT/profile/Swagger/header | HTTP app thật, upstream stub chỉ cho capture | RED 404 → GREEN; JWT và context fail closed | PASS | [P3](../../services/identity-service/report/REPORT_M1_P3_JWT_PROFILE_01.md) |
| E-M1-P4 | D01–D04/D07-M1/D13 / H01/H05 | Session/clock/race/security/container | 42 tests; Compose project test, baseline 2 CPU/256 MiB | GREEN toàn suite, restart/redeploy giữ state | PASS tự động | [P4](../../services/identity-service/report/REPORT_M1_P4_SESSION_01.md) |

**Bộ thông tin tối thiểu cho evidence:**

1. Decision ID, H liên quan, test ID và giới hạn fixture/stub/provider thật; ghi commit hoặc working-tree version của các thành phần.
2. Công cụ/runtime/image versions, môi trường/project test, bước/lệnh đã chạy và expected/actual. PASS có artifact; FAIL có tái hiện; BLOCKED có dependency/hành động tiếp theo.
3. Với migration: schema version trước/sau, dữ liệu tổng hợp và invariant giữ được; không reset volume demo để tạo PASS.
4. Với D13: CPU/RAM container, cấu hình máy, phiên bản Argon2/runtime/image, tham số hash, số request tuần tự/đồng thời, thời gian đo, p50/p95, error/timeout rate. Chưa có SLA thì ghi baseline, không tự gắn nhãn production-ready.
5. Chỉ ghi request ID, log/response đã che token/password và đường dẫn artifact an toàn. Không thực thi load test, migration hoặc fault injection trên demo/shared chỉ để điền tracker.

### 6.4 Cách cập nhật khi chốt hoặc kiểm chứng

```text
Decision ID / H:
Lựa chọn cuối và nguồn quyết định:
Người phụ trách / reviewer thực tế:
Catalog / spec / schema / ADR và version/commit/PR:
Implementation status / commit:
Test ID / môi trường / evidence ID:
Verification status và giới hạn:
Dependency / bước tiếp theo / hạn hẹn đã thống nhất hoặc chưa chốt:
```

Cập nhật §6.1/§6.2 khi chốt lựa chọn, §6.3 khi có bằng chứng thực thi và §5 khi đổi quyết định/tiến độ. Sau đó cập nhật H tương ứng tại §2 để người nhận biết có thể tích hợp tới mức nào. Bản ghi đã ACCEPTED nhưng chưa kiểm chứng vẫn không được chuyển integration sang PASS.


### Cập nhật triển khai M1 — 13/11/2026

Người dùng đã xác nhận các đề xuất P0 M1 trong REPORT_M1_P0_CONTRACT_01; ADR 0002 ghi nguồn chốt. Artifact thực tế ở shared/contracts/http và UserRegistered schema v1 trong shared/contracts/events, không phải các đường dẫn spec dự kiến cũ. Không commit theo yêu cầu; bằng chứng gắn working tree/spec version/image IDs trong báo cáo. Contract FROZEN chỉ cho phạm vi M1 đã xác nhận; không giả định reviewer hoặc tích hợp M2–M4. Manual Swagger bởi người nhận và DOC-01 độc lập NOT RUN.
