# Theo dõi bàn giao Identity và Gateway cho các service

Cập nhật 18/11/2026: HTTP Identity/Gateway 1.5.0 thêm `GET /organizations/{orgId}/members/invitations` (Gateway thêm `/api`). Chỉ OWNER ACTIVE trong org đọc tên/email hiện tại của người nhận; phân trang bằng `limit`, `offset`, trả `Cache-Control: no-store`. Session local dùng Next same-origin, localStorage theo namespace và Web Locks. Chi tiết triển khai xem [báo cáo Identity Pages](../../services/identity-service/report/REPORT_FRONTEND_IDENTITY_PAGES_INTEGRATION_02.md).

Cập nhật 15/11/2026: HTTP Identity/Gateway hiện tại1.3.0, CreateOrganization chỉ bắt buộc name, slug input tùy chọn; Identity tự sinh và xử lý collision, explicit slug vẫn tương thích1.2.0. Nguồn: ADR0006/canonical/[evidence](../../services/identity-service/report/REPORT_ORGANIZATION_AUTO_SLUG_01.md). Mapping P8 ghi1.2.0 bên dưới là baseline trước thay đổi này. Frontend có thể bỏ field slug khỏi request; không dùng generated slug làm input hash idempotency, giữ nguyên key/body khi retry.

Ngày khởi tạo: 13/11/2026 (Asia/Saigon). Nguồn: [kế hoạch Identity/Gateway](../../services/identity-service/MASTER_PLAN.md), [review F13](../../services/identity-service/report/REVIEW_MASTER_PLAN01.md).

Cập nhật P8 — 14/11/2026: gói chuẩn bị bàn giao và mapping hiện tại ở §7–§10; [báo cáo P8](../../services/identity-service/report/REPORT_P8_INTEGRATION_HANDOFF_01.md) là nguồn bằng chứng chạy mới. Các run P7/M2 bên dưới giữ nguyên là lịch sử. H01/H02 có thể bàn giao độc lập; H03 chỉ interface ACCEPTED và [HTTP DRAFT 0.1.0](../../shared/contracts/http/event-context.draft.openapi.json), chưa adapter/provider thật hoặc acceptance M4. Không gán reviewer bên nhận hay hạn hẹn khi chưa biết.

Cập nhật P7/M3 ngày 14/11/2026: người dùng xác nhận riêng toàn bộ [A–E M3/P0](../../services/identity-service/report/REPORT_M3_P0_MESSAGING_CONTRACT_01.md). D10/D11 và delivery D12 **ACCEPTED**, [messaging v1](../api/messaging.md)/[ADR0005](../adr/0005-m3-outbox-delivery.md) chốt trước implementation phụ thuộc. Worker/migration/storage đã triển khai; [gate P7](../../services/identity-service/report/REPORT_M3_P7_OUTBOX_DELIVERY_01.md) ghi regression/broker/lifecycle/Compose thực tế, không thay payload authority ba schema v1 hoặc nghiệm thu M2.

Kết quả cuối: **P7/M3 COMPLETE cho scope local**. Full127/127 tests và broker/lifecycle thật PASS ở run1794659339512; Compose-only offline commit3 events/reconnect/delivery/shutdown exit0 PASS ở run1794659791710. Coverage global S94.37/B89.94/F89.91/L95.15%. NACK chỉ client injection, Event/consumer M4 NOT RUN; không coi Compose-only là lượt chạy lại127 tests. Chi tiết failure trước sửa/evidence/images/hashes và giới hạn tại P7.

Đây là nơi cập nhật **tiến độ bàn giao liên service**, người phụ trách, người nhận/review, phiên bản artifact và bằng chứng. Không lưu token, password hoặc thông tin cá nhân thật trong bảng/bằng chứng. Không coi việc tạo tài liệu này là đã freeze contract hoặc đã hoàn thành backend.

## 1. Cập nhật ở đâu?

| Thông tin cần cập nhật | Vị trí chính | Cách cập nhật |
|---|---|---|
| Trạng thái bàn giao, phụ thuộc, lịch hẹn, người nhận | §2 và nhật ký §5 của file này | Cập nhật từng H01–H05; dẫn tới commit/PR/artifact và bước tiếp theo |
| Quyết định P0 và bằng chứng theo quyết định | [§6 của file này](#p0-decisions) | Cập nhật D00–D13, nguồn chốt, liên kết H, trạng thái implementation/evidence; không đánh đồng ACCEPTED với PASS |
| Phạm vi M1–M4 và trình tự P0–P8 | [MASTER_PLAN.md](../../services/identity-service/MASTER_PLAN.md) | Ghi thay đổi scope/decision khi đã thống nhất; không đánh hoàn thành chỉ vì contract đã review |
| API, auth headers, DTO/status/error và idempotency | [API catalog](../api/catalog.md) | Là nguồn danh mục API bản nháp hiện tại; đồng bộ spec khi freeze |
| OpenAPI máy đọc | [Identity canonical v1.2.0](../../shared/contracts/http/identity.openapi.json), [Gateway projection](../../shared/contracts/http/gateway.openapi.json); [Event resolver DRAFT](../../shared/contracts/http/event-context.draft.openapi.json) | Consumer types generate từ từng canonical; Gateway projection được check. Event DRAFT chưa freeze/implement; không tạo hai payload authority |
| Permission/role và quyết định kiến trúc | [docs/architecture.md](../architecture.md), [ADR](../adr/README.md) | Giữ 10 permission/four roles thống nhất; ghi quyết định thay đổi ảnh hưởng dài hạn |
| Event payload, schema version và trigger | [Event contracts](../../shared/contracts/events/README.md) và JSON Schema versioned tại cùng thư mục khi tạo | F05 có resolver handoff; F10 có MembershipChanged draft. Markdown chưa thay JSON Schema thực thi |
| Exchange/routing/queue, policy delivery/retry | [Messaging v1](../api/messaging.md) | ACCEPTED M3/ADR0005; evidence P7/P8 tách khỏi consumer nghiệp vụ M4 |
| Hướng dẫn chạy và dữ liệu demo/test | [Identity README](../../services/identity-service/README.md), [Gateway README](../../gateway/README.md) | Lệnh/config migration/seed/test phải theo mốc đã triển khai; không commit secret |
| Kết quả kiểm thử và nghiệm thu | Báo cáo từng mốc tại `services/identity-service/report/` | Ghi môi trường, version, bước chạy, expected/actual và bằng chứng đã che nhạy cảm; bảng này chỉ dẫn link |

Khi contract được freeze, PR phải đồng bộ catalog/spec/schema và có bên nhận review theo quy tắc catalog. Không copy nguyên payload vào tracker hoặc duy trì nhiều bản khác shape cùng nhận là contract chính thức. Các bản đề xuất trong báo cáo chưa tự thay đổi catalog đã được duyệt.

## 2. Bảng tiến độ bàn giao

Bảng lưu nguồn nghiệm thu M1/P5/P6/M3 theo từng mốc; cập nhật P8 14/11/2026 xem §7 cho kiểm chứng mới và điều kiện bên nhận. Codex thực hiện trong working tree, không commit. Người nhận/reviewer consumer M4 chưa được phân công; không suy acceptance từ provider PASS.

| ID / đầu ra | Vai trò chuẩn bị → bên nhận | Người phụ trách / reviewer thực tế | Mốc / hạn hẹn | Contract | Implementation | Integration | Bằng chứng hiện có / bước tiếp theo |
|---|---|---|---|---|---|---|---|
| H01 — Auth/JWT/context header | Identity + Gateway → Gateway, frontend và service nhận context | Codex / người dùng xác nhận P0 M1; reviewer frontend chưa gán | M1/P8, không hạn hẹn M4 | FROZEN auth M1, hiện canonical v1.2.0 | IMPLEMENTED, working tree | Provider tự động PASS P8; manual M2 USER-CONFIRMED; browser/M4 NOT RUN | [M1](../../services/identity-service/report/REPORT_M1_AUTH_GATEWAY_01.md), [P8](../../services/identity-service/report/REPORT_P8_INTEGRATION_HANDOFF_01.md), checklist §8 |
| H02 — Authorization check, permission/scope | Identity → Event; Registration/Payment theo API cần quyền | Codex / người dùng duyệt A–E P5; reviewer bên nhận chưa có | P5, 14/11/2026 | ACCEPTED P5 HTTP v1.1.0; chưa nghiệm thu consumer M4 | IMPLEMENTED P5 working tree | ORG provider thật/Event fixture theo báo cáo P5; Event thật NOT RUN | [P0](../../services/identity-service/report/REPORT_M2_P0_CONTRACT_01.md), [P5](../../services/identity-service/report/REPORT_M2_P5_ORGANIZATION_RBAC_01.md) |
| H03 — Event/org resolver | Event + Identity → hai bên tích hợp | Codex interface P5; reviewer Event M4 chưa gán | Interface P5; trước integration M4 | ACCEPTED interface P5; Event HTTP contract M4 DRAFT | IMPLEMENTED fixture injection/default fail closed P5; adapter thật NOT_STARTED | Fixture P5 theo báo cáo; Event E2E NOT RUN | [F05 handoff](../../shared/contracts/events/README.md#identity-event-f05), ADR 0003 |
| H04 — Event Identity/schema/topology | Identity → queue kiểm chứng local; consumer nghiệp vụ tương lai | Codex / người dùng duyệt riêng A–E M3 | M1/P5/P6/M3 | ACCEPTED producer v1 và delivery messaging v1/ADR0005 | IMPLEMENTED outbox + NestJS worker/claim/retry/PARKED/replay | PostgreSQL/RabbitMQ thật, backlog/new/return/crash/lifecycle theo P7; consumer nghiệp vụ M4 NOT RUN | [P7](../../services/identity-service/report/REPORT_M3_P7_OUTBOX_DELIVERY_01.md); không thêm consumer MUST |
| H05 — API thật/hướng dẫn/bằng chứng | Identity + Gateway → thành viên tích hợp service liên quan | Codex / người dùng duyệt M1, P5 và toàn bộ A–E P6; reviewer bên nhận chưa gán | M1/P5/P6; 14/11/2026 | ACCEPTED HTTP v1.2.0, ADR 0004 | IMPLEMENTED M1/P5/P6 working tree, không commit | ORG/Gateway/PostgreSQL thật; EVENT fixture; manual Swagger/DOC-01 PASS — USER-CONFIRMED; service integration M4 NOT RUN | [báo cáo P6](../../services/identity-service/report/REPORT_M2_P6_INVITATION_01.md); M2 ACCEPTED theo [nghiệm thu](../../services/identity-service/report/REPORT_M2_ACCEPTANCE_01.md) |

Bảng trên giữ nguồn nghiệm thu từng mốc. Cập nhật kiểm chứng P8 cho cả năm H ở §7, không thay lịch sử P5/P6/P7 hoặc tự suy consumer acceptance.

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
| 14/11/2026 | P8 / H01–H05 / D09 | Bổ sung mapping API/event/frontend, HTTP resolver DRAFT, runbook và evidence mới; giữ phạm vi M4 | [P8](../../services/identity-service/report/REPORT_P8_INTEGRATION_HANDOFF_01.md), §7–§10 | Người dùng chốt D09 và chính sách browser/nhiều tab trước implementation M4; bên nhận chạy integration thật |

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
| D05 — Authorization input/result | DTO/matrix/reason canonical v1.1.0 | P5; H02 | ACCEPTED P5 — người dùng chốt A–E ngày 14/11/2026, ADR 0003 | Identity OpenAPI/generated types/Gateway projection/catalog | Báo cáo M2 P0/P5; Event consumer thật NOT RUN |
| D06 — Idempotency | Actor/operation/key, target/body hash, TTL 24h, key lock 2s, replay authorization | P5; H02/H05 | ACCEPTED P5 — A–E/ADR 0003; P6 mở rộng riêng theo ADR 0004: bốn operation, target invitation, replay recipient/current OWNER, TTL24h/lock2s | Migration 202611140001_p5 và canonical v1.1.0 | PostgreSQL race/replay/conflict/TTL/rollback theo báo cáo P5 |
| D07 — Persistence constraints và khóa | Schema M1 giữ nguyên; P5 additive revision/idempotency, khóa key/org/users/member và kiểm lại quyền/OWNER | M1/P5; H02/H05 | ACCEPTED M1; ACCEPTED phần P5 theo A–E/ADR 0003; invitation P6 ACCEPTED theo ADR 0004, additive snapshot/FK/partial unique/khóa | Migration và schema P5; không reset dữ liệu | Upgrade SQL M1→P5/transaction/race, báo cáo P5; production-sized NOT RUN |
| D08 — Invitation policy chi tiết | Hạn7 ngày, DTO/status/error canonical v1.2.0, immutable server snapshot, replay/key mới | P6; H02/H05 | ACCEPTED P6 — người dùng “xác nhận toàn bộ” A–E, ADR 0004 | Canonical/projection/generated types, migration 202611140003_p6_invitations | INV-01–06, F11-INV-01/02 theo báo cáo P6 |
| D09 — Event/org resolver | P5 interface/test injection; default runtime fail closed; HTTP adapter/lifecycle M4 hoãn | Interface P5; integration M4/H03 | ACCEPTED interface P5/ADR0003; HTTP/timeout/lifecycle DRAFT0.1.0, chưa xác nhận | [OpenAPI DRAFT](../../shared/contracts/http/event-context.draft.openapi.json), quyết định §9 | P8 schema/fixtures/types PASS; Event provider/adapter thật NOT RUN |
| D10 — Điều kiện publish thành công | Mandatory/persistent/confirm, return correlation mỗi attempt; SENT chỉ broker handoff ít nhất một route, owner/lease conditional | M3; H04 | ACCEPTED riêng A–E M3, ADR0005 | Messaging v1, NestJS worker, migration202611140004/audit/replay | AC-008/EVT-02/03, broker thật + client-only NACK ghi riêng tại P7 |
| D11 — Broker storage/lifecycle | RabbitMQ4.4.0/digest, named volume, node rabbit@rabbitmq; inventory không broker cũ, không claim đã chuyển dữ liệu | M3; H04/H05 | ACCEPTED riêng A–E M3, ADR0005 | Compose/profile m3 và runbook | AC-009: restart/recreate/down-up test riêng có message ID/volume/node/container evidence tại P7 |
| D12 — MembershipChanged | Schema/revision/trigger giữ P5/P6, delivery từ snapshot gốc | P5/P6/M3; H04 | ACCEPTED producer P5/P6; delivery A–E M3/ADR0005 | JSON Schema v1 không đổi, worker không dựng lại snapshot | Producer/transaction regression và delivery broker thật tại P7; consumer projection M4 NOT RUN |
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
| D04 | Codex triển khai M1/M3 | Yêu cầu hiện tại / ADR0002 và ADR0005 | IMPLEMENTED outbox từ M1, worker M3 gửi snapshot đã lưu | PASS transaction/schema/regression; delivery/lifecycle thật ở P7 | [M1](../../services/identity-service/report/REPORT_M1_AUTH_GATEWAY_01.md), [M3/P7](../../services/identity-service/report/REPORT_M3_P7_OUTBOX_DELIVERY_01.md) |
| D01–D03, D07-M1, D13 | Codex triển khai M1 | Người dùng xác nhận đề xuất P0 ngày 13/11/2026, ADR 0002 | IMPLEMENTED M1 working tree | PASS tự động theo phạm vi | [báo cáo M1](../../services/identity-service/report/REPORT_M1_AUTH_GATEWAY_01.md); manual handoff NOT RUN |
| D05/D06/D07-P5/D09-interface/D12-P5 | Codex, working tree không commit | Người dùng chốt A–E ngày 14/11/2026, ADR 0003 | IMPLEMENTED P5; xem báo cáo P5 | Bằng chứng PostgreSQL/fixture/Compose ghi trong báo cáo P5 | [P0](../../services/identity-service/report/REPORT_M2_P0_CONTRACT_01.md), [P5](../../services/identity-service/report/REPORT_M2_P5_ORGANIZATION_RBAC_01.md) |
| D08/D07-invitation/D06-P6/D12-accept | Codex, không commit | Người dùng xác nhận toàn bộ A–E P6, ADR 0004 | IMPLEMENTED P6 working tree | PostgreSQL/ORG/Compose thật; EVENT fixture; cập nhật P8: manual M2 USER-CONFIRMED, không Codex trực tiếp chạy | [P6](../../services/identity-service/report/REPORT_M2_P6_INVITATION_01.md), [P8](../../services/identity-service/report/REPORT_P8_INTEGRATION_HANDOFF_01.md) |
| D10/D11/delivery-D12 | Codex, không commit | Người dùng xác nhận toàn bộ A–E M3; ADR0005 | IMPLEMENTED worker/migration/storage/replay | Evidence theo từng gate, PostgreSQL/RabbitMQ thật; NACK client-injected được ghi giới hạn | [P7](../../services/identity-service/report/REPORT_M3_P7_OUTBOX_DELIVERY_01.md) |
| D09-M4 | Codex chuẩn bị DRAFT; owner Event/Identity adapter/reviewer M4 chưa gán | HTTP/timeout/lifecycle DRAFT, cần xác nhận §9 | Provider/adapter NOT_STARTED | Schema/examples/types PASS P8; Event thật NOT RUN | [OpenAPI DRAFT](../../shared/contracts/http/event-context.draft.openapi.json); frontend/business consumer ngoài P8 |

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
| E-M2-P0 | D05/D06/D07-P5/D09-interface/D12 | Contract/schema/projection | Working tree, HTTP v1.1.0/schema v1, người dùng duyệt A–E | RED 4 contract tests → GREEN 6 tests cả M1/P5, generated types | PASS trong P5 | [P0](../../services/identity-service/report/REPORT_M2_P0_CONTRACT_01.md) |
| E-M2-P5 | H02–H05, P5 không P6 | Org/RBAC/idempotency/upgrade/race/outbox | PostgreSQL 16.15, ORG provider thật, EVENT fixture; Compose project riêng | 16 suites/68 tests GREEN; container P5/restart/redeploy PASS | PASS tự động P5; manual/Event thật NOT RUN | [P5](../../services/identity-service/report/REPORT_M2_P5_ORGANIZATION_RBAC_01.md) |
| E-P8-01 | H01–H05, D09 DRAFT | Full regression/broker/lifecycle/Compose + target P6; contract/type parity | Working tree, Node24.19.0/PostgreSQL16.15/RabbitMQ4.4.0; projects riêng | Full24 suites/127 PASS; lifecycle3 và Compose offline/reconnect/shutdown PASS; P6 target03 PASS; draft checks PASS | PASS chuẩn bị bàn giao; Event/browser/business consumer thật NOT RUN | [P8](../../services/identity-service/report/REPORT_P8_INTEGRATION_HANDOFF_01.md); manual M2 giữ USER-CONFIRMED |

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

Cập nhật 14/11/2026 — P6 được duyệt riêng và triển khai invitation; H04 producer accept CREATED/revision1 theo schema v1, không thêm event/consumer. [Báo cáo P6](../../services/identity-service/report/REPORT_M2_P6_INVITATION_01.md) là evidence hiện tại, thay vì suy từ 68 tests lịch sử P5. H02 policy P5 giữ nguyên, H03 EVENT thật vẫn NOT RUN. Sau đó người dùng xác nhận mọi kiểm thử đạt expected: manual Swagger/DOC-01 PASS — USER-CONFIRMED, M2 COMPLETE theo [nghiệm thu](../../services/identity-service/report/REPORT_M2_ACCEPTANCE_01.md). Không suy nghiệm thu bên nhận service M4.

### Chốt nghiệm thu M2 — 14/11/2026

Người dùng xác nhận: “tất cả kiểm thử đã pass và đạt kết quả mong muốn hoàn thiện m2”. M2 ACCEPTED/COMPLETE cho local API P5/P6, manual Swagger/DOC-01 PASS — USER-CONFIRMED. Nguồn: [REPORT_M2_ACCEPTANCE_01.md](../../services/identity-service/report/REPORT_M2_ACCEPTANCE_01.md). Gate tự động giữ kết quả99 tests/coverage/Compose02 từ lượt implementation; lượt chốt này chỉ cập nhật tài liệu, không claim chạy lại tests. Reviewer bên nhận service/M4 chưa gán; Event thật/broker/consumer vẫn NOT RUN. Tiếp theo P7/M3 khi được giao, không bắt đầu worker trong lượt này.

## 7. Gói bàn giao P8 — trạng thái hiện tại 14/11/2026

Người chuẩn bị thực tế: Codex trong working tree; người dùng đã duyệt contract M1/P5/P6/M3 theo ADR0002–0005. Cá nhân owner phía Event/frontend/service khác, reviewer consumer, thời hạn và consumer acceptance **chưa được chỉ định**. Đây là dependency bàn giao, không phải lý do tự đặt owner hoặc nâng trạng thái integration.

| Gói / provider → consumer | Contract authority / trạng thái | Implementation / bằng chứng | Điều kiện bên nhận và expected integration |
|---|---|---|---|
| H01 Identity + Gateway → frontend/API client/service nhận context | HTTP Identity **1.2.0 ACCEPTED**, projection/types derived; ADR0002 | Provider thật auth/session/Gateway/DB; regression P8 và target Compose P6 ở báo cáo P8. Manual M2 vẫn USER-CONFIRMED | Dùng JWT thật, base `/api`, không gửi context tự khai; logout đúng cặp access/refresh; kiểm expired/rotation/retry/mismatch. Expected 200 đúng cặp, 401 mismatch, phiên khác không bị revoke. Browser thật NOT RUN |
| H02 Identity → Event/Registration/Payment khi cần quyền | AuthorizationInput/Result cùng canonical 1.2.0; policy P5 ACCEPTED/ADR0003 | Internal HTTP/DB thật; ORG thật, EVENT mapping fixture. Không phụ thuộc worker | Resolve resource/org từ nguồn sở hữu đáng tin trước check; đủ năm field, permission đúng matrix; deny là 200 allowed=false và không mutation; infrastructure failure cũng không mutation. Integration consumer thật NOT RUN |
| H03 Event → Identity resolver; Event → Identity authorization | [Event HTTP 0.1.0 DRAFT](../../shared/contracts/http/event-context.draft.openapi.json); interface P5 ACCEPTED riêng | Interface `resolve(eventId): Promise<unknown>`; fixture tiêm `pair({resolver:{resolve}})` trong tests. Default runtime null; provider/HTTP adapter NOT_STARTED | Chốt §9 trước triển khai; Event thật phải resolve cả DRAFT, đúng ID/org, không gọi ngược Identity. Expected wrong-org403/missing404/bad-response502/timeout504/no partial write; đây là **đề xuất HTTP**, không evidence provider thật |
| H04 Identity worker → RabbitMQ queue local; consumer nghiệp vụ tương lai | Ba schema Identity **v1 ACCEPTED** và messaging **v1 ACCEPTED**; không consumer MUST mới | DB/broker/worker/container thật ở P8; NACK vẫn client-injected, không broker-generated proof | Consumer tự chốt nhu cầu, queue/binding, validate envelope/version, deduplicate event_id và xử lý revision cũ/trùng. Test nhận đúng queue/body/ID; SENT không chứng minh mọi subscriber hay consumer xử lý. Business consumer NOT RUN |
| H05 Identity + Gateway → người vận hành/tích hợp | API/projection/generated types, schema, ADR và runbook dưới §10 | Build/contracts/types/format/regression/Compose evidence P8; không commit | Người nhận tái hiện trên project riêng rồi ghi acceptance; không dùng volume demo/shared để fault injection. Hướng dẫn local không là production runbook/backup proof |

### Ma trận API/event → artifact → implementation → evidence → consumer/gap

Ký hiệu **HTTP** = `shared/contracts/http/identity.openapi.json` v1.2.0; **types** = `http/generated/identity.d.ts`; Gateway projection thêm `/api`, bỏ internal/context headers. Không có payload authority thứ hai trong bảng. Đường dẫn implementation dưới `services/identity-service/src/`; Gateway routes dưới `gateway/src/routes/`. Evidence mới dùng [P8](../../services/identity-service/report/REPORT_P8_INTEGRATION_HANDOFF_01.md), nơi phân biệt full suite với target Compose.

| API/event | Canonical artifact | Implementation | Test/evidence mới | Consumer / khoảng trống, bước sau |
|---|---|---|---|---|
| POST /auth/register — 200 | HTTP register/RegisterRequest/Registered | modules/auth controller/DTO/service, transaction user+outbox | p2-auth, p0-contract; full127 | Frontend: DTO chặt hơn mock, unknown field400; không key |
| POST /auth/login — 200 | HTTP login/Tokens | auth.service login/JWT/session | p2-auth, p4-session/security; full127 + Compose P6 | Frontend: mỗi login là phiên mới, credential đúng LOCKED403 |
| POST /auth/refresh — 200 | HTTP refresh/Tokens | auth.service refresh, khóa session/user | p4-session/clock; full127 + Compose P6 | Frontend: rotation, sid/hạn tuyệt đối giữ nguyên; refresh cũ401; cần coordinator M4 |
| POST /auth/logout — 200 | HTTP logout/RefreshRequest/LoggedOut | ContextGuard + auth.service logout; Gateway JwtGuard | p4-session/security; full127 + Compose P6 | Frontend logout anonymous lệch contract; checklist §8 |
| GET /users/me — 200 | HTTP getMe/Profile | users controller/service + ContextGuard | p3-jwt-profile, p6-invitation; full127 | Frontend roles[] chỉ hiển thị, không quyết định quyền EVENT; membership rỗng hợp lệ |
| GET /healthz, /readyz — 200/503 | HTTP Health/Error; không projection Identity health | app.ts + runtime config, Gateway app health | p1-infra, p4-env; full127 + Compose P6 DB outage | Operator; health không chứng minh broker/consumer ready |
| POST /organizations — 201 | HTTP CreateOrganization/OrganizationCreatedResult | organizations controller/DTO/service, key/transaction | p5-organization/transactions/upgrade; full127 + Compose P6 | Frontend mock200; thật201, key bắt buộc, slug validation |
| GET /organizations/{orgId} — 200 | HTTP Organization | organizations.service get/current membership | p5-organization; full127 + Compose P6 | Frontend; ACTIVE membership cần thiết, cross-tenant403 |
| GET /organizations/{orgId}/members — 200 | HTTP OrganizationMembers | pagination/controller, members RepeatableRead | p5-organization; full127 + Compose P6 | Frontend mock roles string[]/thiếu limit,offset; đổi sang scoped assignments |
| PUT /organizations/{orgId}/members/{userId}/roles — 200 | HTTP ReplaceMemberRoles/LoggedOut | normalize + replace, key/org/user/member locks | p5-transactions/organization; full127 + Compose P6 | OWNER; existing membership, bảo vệ last OWNER; EVENT thật phụ thuộc H03 |
| GET /public/organizations/{slug} — 200 | HTTP PublicOrganization | publicOrganization; Gateway public allowlist | p5-organization; full127 + Compose P6 | Public frontend/API composition tương lai; không email/profile riêng tư |
| POST /internal/authorization/check — 200 | HTTP AuthorizationInput/Result | authorization.service/check + internal controller | p5-organization matrix/input/deny; full127 | Service nội bộ; caller resolve org đáng tin. Identity không xác minh lại event/org ở endpoint check; không route public |
| GET /internal/users/{userId}/public-profile — 200/404 | HTTP PublicUser | publicUser, LOCKED404 | p5-organization; full127 | Composition tương lai; chỉ id/display_name, không avatar/email; không route public |
| POST /organizations/{orgId}/members/invitations — 201 | HTTP CreateInvitation/InvitationCreated | invitations controller/DTO/service command | p6-invitation/transactions; full127 + Compose P6 | OWNER; user đã tồn tại, snapshot, key; EVENT fixture/default fail closed |
| GET /users/me/invitations — 200 | HTTP Invitations/Invitation | list snapshot, effective expiry không ghi | p6-invitation; full127 + Compose P6 | UI inbox chưa có; all states, empty items, processed_at nullable |
| POST /users/me/invitations/{id}/accept — 200 | HTTP InvitationAction/InvitationAccepted | command accept; local recheck+atomic membership/event/result | p6-invitation/transactions/upgrade; full127 + Compose P6 | Recipient; roles không lấy từ client, inviter còn OWNER ở fresh accept; replay policy riêng |
| POST /users/me/invitations/{id}/decline — 200 | HTTP InvitationAction/InvitationDeclined | command decline | p6-invitation/transactions; full127 + Compose P6 | Recipient ACTIVE; không cần inviter còn OWNER, không MembershipChanged |
| POST /organizations/{orgId}/members/invitations/{id}/revoke — 200 | HTTP InvitationAction/InvitationRevoked | command revoke | p6-invitation/transactions; full127 + Compose P6 | OWNER ACTIVE đúng org; không MembershipChanged |
| UserRegistered v1 | events/user-registered.v1.schema.json + fixture | auth register/outbox; messaging validator/worker | p2-auth, m3-broker backlog/new; full127 | Queue local thật; consumer nghiệp vụ chưa có; email thuộc event được duyệt, không log |
| OrganizationCreated v1 | events/organization-created.v1.schema.json + fixture | organization create/outbox/worker | p5-organization, m3-broker; full127 | Queue local; seed không event, replay không event mới |
| MembershipChanged v1 | events/membership-changed.v1.schema.json + fixture | create org/replace roles/accept invitation + worker | p5/p6 transaction + m3-broker; full127 | revision1 CREATED, +1 ROLES_REPLACED; ORG NULL→org UUID; no-op/replay/rollback không tăng; business consumer M4 |
| GET Event authorization-context | event-context.draft.openapi.json 0.1.0 DRAFT | Interface/fixture P5; HTTP provider/adapter chưa có | check-event-context-draft: schema/errors/examples/types; **không runtime proof** | H03/M4 chờ §9, không thay accepted Identity API |

## 8. Mapping frontend và checklist chuyển đổi M4

Đã đọc mock store/Next catch-all route, `apiClient.ts`, `auth.ts`, `useSession.ts`, `types.ts` và AuthPage. P8 không chỉnh file frontend. Frontend default BASE=`/api` hiện gọi Next mock cùng origin; khi tích hợp phải chọn same-origin reverse proxy tới Gateway hoặc BASE đầy đủ `http://localhost:8080/api`. Không nối `/api` hai lần. Gateway chưa bật CORS; gọi khác origin cần chốt origin/transport trước M4, không tự bật wildcard. Chỉ đổi BASE sẽ làm phần Event/booking/payment/composition mock gặp404 ở Gateway hiện tại; cần chiến lược chuyển theo service, không tuyên bố toàn UI đã tích hợp.

| Điểm consumer | Mock/frontend hiện tại | API thật / việc M4 |
|---|---|---|
| Auth request/status | register/login/refresh dùng shape gần backend, kiểm tra lỏng hơn; token `at_...`, RAM | Generate/derive Identity types từ canonical; DTO lengths/trim/unknown-field theo schema; mọi auth POST200, email409, validation400, credential401/LOCKED403; không key |
| Form/seed đăng nhập | AuthPage giới hạn tên80 ký tự, chưa max password128; gợi ý tài khoản mock khác seed backend | Chốt UI validation phù hợp canonical (display_name100, password8–128, email254); seed demo chỉ local theo Identity README, không coi tài khoản mock tồn tại trong DB thật hoặc đưa credential thật vào UI/report |
| Session/refresh | Refresh map mock, chưa expiry tuyệt đối/verified sid; client single-flight trong một JS context | Access900s, refresh7 ngày từ login; xoay cả cặp, sid/hạn giữ; một winner khi race, token cũ401; không lưu token/profile qua generation đã logout |
| Profile | Handwritten MeProfile; roles code dùng cho UI | Derive Profile; ACTIVE memberships, roles không chứng minh quyền EVENT. Backend không trả toàn bộ authorization trong JWT/profile |
| Organization | Mock create200, validation lỏng; UI có create org | Thật201; name/slug constraint, key cho create; cùng key/body retry giữ201, target/body khác409 |
| Members/roles | Mock members role code string[], total không phân trang; chưa UI quản trị scoped roles | Derive OrganizationMembers/RoleAssignment; request limit/offset, response items/total/limit/offset; OWNER/ADMIN ORG, SPEAKER/ATTENDEE EVENT, không copy mock scope |
| Invitation | Không có API mock/inbox UI tương ứng | Backend đủ create/list/accept/decline/revoke/expiry; UI M4 chọn phạm vi riêng, chỉ existing account, không email/unregistered invite; action body rỗng; processed_at có thể null |
| Idempotency | Mock chỉ kiểm key ở một số business routes; không có cache semantics Identity | Key ASCII `[A-Za-z0-9._:-]`, 1–128 ký tự; create org/replace roles/bốn invitation POST bắt buộc. Giữ cùng key cho cùng thao tác/retry, không tạo lại key khi timeout; TTL24h, replay kiểm quyền hiện tại; 409 IN_PROGRESS có thể retry cùng key |
| Error/request ID | ErrorCode handwritten thiếu mã M2/429/504; request ID `req-*` | Derive enum canonical, map thông báo và safe fallback; UUID correlation do Gateway giữ/sinh lại. Xử lý LAST_OWNER_REQUIRED, ALREADY_MEMBER, INVITATION_ALREADY_PENDING/EXPIRED/NOT_PENDING, EVENT_SCOPE_UNVERIFIED, IDEMPOTENCY_IN_PROGRESS, UPSTREAM_TIMEOUT, RATE_LIMITED |
| Chức năng ngoài Identity | UI mock Event CRUD/publish, ticket/booking/check-in/payment và details composition | Gateway thật hiện chỉ allowlist Identity, không có các provider/composition này; M4 phụ thuộc service tương ứng, không coi đổi URL là xong |

### Logout: task bắt buộc trước browser integration

- [ ] Gửi Bearer access và refresh **hiện hành cùng phiên**; bỏ anonymous logout. Mismatch access A/refresh B phải401 và không revoke A/B; retry đúng cặp đã revoke còn hạn trả200 OK.
- [ ] Coordinator có trạng thái logging-out/single-flight, ngăn request mới; chờ refresh đang chạy với timeout hữu hạn rồi dùng cặp mới. Access hết hạn: refresh tối đa một lần rồi logout bằng cặp nhận được; retry logout tối đa một lần. Rotation đã commit nhưng mất response có thể không còn chứng minh cặp để revoke.
- [ ] Không refresh đệ quy auth endpoints; cơ chế skip `/auth/*` hiện có cần giữ. Không tự retry mutation với key khác.
- [ ] Generation guard cho token/profile/cache/inflight: response refresh/profile/login cũ không được khôi phục phiên sau logout/đổi tài khoản. Test logout khi refresh/profile đang chờ, response đảo thứ tự, timeout/network loss và login mới.
- [ ] Clear token/profile local và thông báo rõ server revoke đã xác nhận hay chưa. Chỉ200 logout đúng contract mới xác nhận server revoke; 401/network/5xx không phải bằng chứng revoke. Không giữ refresh để retry ngầm sau khi đã báo xóa local. Access cũ có thể sống tới exp tối đa15 phút.
- [ ] Chốt storage/transport: hiện localStorage chứa access/refresh/profile; rủi ro XSS chưa được giải quyết bằng backend. Cookie/BFF/CORS/CSRF policy cần thiết kế riêng trước browser triển khai ngoài local.
- [ ] **Nhiều tab còn OPEN:** đề xuất cùng origin phối hợp logout/session generation qua BroadcastChannel/storage events và serialize refresh liên tab; một promise chỉ giải quyết một tab. Cần quyết định đăng xuất mọi tab local hay tab hiện tại, test tab đóng/mất message/refresh race. Không đồng nghĩa server logout-all.

<a id="d09-draft"></a>

## 9. D09/F05 — đề xuất cụ thể chờ xác nhận trước implementation M4

Authority duy nhất cho HTTP resolver đề xuất: [OpenAPI 0.1.0-draft](../../shared/contracts/http/event-context.draft.openapi.json); [types DRAFT generated](../../shared/contracts/http/generated/event-context.draft.d.ts). Error envelope tham chiếu trực tiếp schema Error của Identity canonical, không copy định nghĩa. Examples trong spec là dữ liệu tổng hợp, không phải Event provider. `node scripts/check-event-context-draft.cjs` kiểm OpenAPI, allowlist refs local/canonical Error, fixtures âm/dương và parity types Identity/DRAFT; không kết nối network/provider.

Interface/fixture P5/P6 **ACCEPTED** theo ADR0003/0004 không tự phê duyệt HTTP/timeout/lifecycle này. Draft là API nội bộ bổ sung, không đổi accepted Identity v1.2.0 hoặc hành vi thiếu resolver409. Type DRAFT chưa được import vào application, không có adapter/provider/business consumer mới. Freeze cần người dùng và owner/reviewer hai phía xác nhận; chưa có consumer acceptance.

Các quyết định cần xác nhận:

| Đề xuất | Tác động / dependency còn mở |
|---|---|
| D09-A: dùng GET authorization-context trong artifact, trả metadata cho event tồn tại ở cả DRAFT/PUBLISHED/CANCELLED | Event sở hữu event→org; endpoint không trả allowed, không cần user context và không gọi Identity để tự bảo vệ resolver. Chưa có chính sách cấm gán theo lifecycle; nếu muốn cấm CANCELLED phải đổi/review contract trước implementation |
| D09-B: timeout mỗi call1000ms, tổng resolution/command2000ms, không retry tự động; không cache ownership | Giới hạn tổng phải bao gồm nhiều event IDs; adapter/orchestrator tương lai cần budget/cancel hữu hạn. Gateway timeout hiện3000ms vẫn giữ; cần đo tổng resolve+transaction, timeout Gateway không chứng minh mutation chưa commit, dùng key cũ để retry |
| D09-C: mapping missing404, wrong-org403, malformed/mismatched ID hoặc unavailable/provider error502, deadline504 | Không nhận response org do client cấp làm proof; schema UUID chưa đủ, adapter phải so requested event ID/org. Provider400 cho UUID đã validate/429/500/503 đều không grant. Missing adapter409 giữ nguyên; lỗi public Identity dùng Error canonical |
| D09-D: local network trust, không route Gateway/Swagger public; non-local cần service auth được chốt riêng | Không đọc chéo DB, không fallback fixture, không vòng Identity→Event→Identity. Không gửi bearer/refresh tới resolver hoặc log credential; request ID chỉ correlation |
| D09-E: lifecycle/xóa/chuyển org vẫn OPEN, chưa cam kết consistency | Cần quyết định có cho move/delete không, tombstone/status404/410, assignment cũ/invitation snapshot xử lý thế nào và version/revalidation nào. Resolve trước local transaction không khóa Event, chưa có distributed transaction; không triển khai tính năng phụ thuộc trước khi chốt |

Integration H03/M4 phải chạy Event thật: DRAFT cùng org/đủ quyền thành công; wrong-org403/missing404/bad ID response502/unavailable502/timeout504; ba mutation replace/create invitation/accept đều không partial write khi lỗi; fresh accept resolve lại, success replay không resolve lại; trace không gọi vòng và Gateway không expose internal. Những ca fixture P5/P6 chỉ chứng minh Identity xử lý dependency, chưa chứng minh HTTP serialization/deadline/provider.

## 10. Runbook bàn giao và thứ tự công việc tiếp theo

Nguồn vận hành hiện có: [Identity README](../../services/identity-service/README.md) (local, migrations/seed, session, M3 worker/replay), [Gateway README](../../gateway/README.md), [messaging v1](../api/messaging.md). Không tạo runbook root song song.

1. Local/demo: cấu hình local riêng, không in `.env`; generator chỉ tạo khi file chưa có. `docker compose --profile m1 up --build -d --wait gateway` chạy migration job trước app. Seed local là lệnh riêng trong README; không reset/db push, không sửa migrations cũ. Chạy M3 chỉ khi chủ môi trường muốn worker phát backlog, bằng lệnh profile m3 trong README.
2. Swagger tại Gateway `/docs`, spec `/docs-json`; register/login → Authorize access → users/me/org/invitation; key mới cho thao tác mới, key cũ khi retry cùng request. Internal authorization/profile chỉ service nội bộ, thử qua Gateway phải404 và spec không chứa internal.
3. Worker/queue: xem `ps -a`, log worker đã lọc và queue/bindings bằng lệnh read-only ở README; PENDING/PROCESSING/SENT/PARKED theo messaging authority. Không purge queue/xóa outbox/reset DB để xử lý lỗi. Replay PARKED dry-run trước, chỉ --apply sau điều tra reason không nhạy cảm, giữ ID và audit. Không replay SENT như cách khôi phục mọi subscriber.
4. Test: `npm run typecheck`, `npm run contracts:check`, `node scripts/check-event-context-draft.cjs`, `npm run format:check`; `npm run test:m3` là full regression/coverage+broker+lifecycle+Compose trên project riêng. `--compose-only` **không** chạy full suite/lifecycle. P6 Compose là target riêng `node scripts/compose-smoke.cjs --p6 --evidence-run=NN`, chọn NN chưa có cả hai artifact; không chạy suffix01 mặc định nếu evidence đã tồn tại.
5. Chẩn đoán: Docker unavailable → ghi NOT RUN/phụ thuộc; migration fail → giữ log an toàn và dừng phần phụ thuộc; placeholder JWT → sửa config ngoài report; 401 Swagger → Authorize chỉ access token hiện hành; EVENT_SCOPE_UNVERIFIED409 → runtime chưa có adapter (không bật fixture); idempotency conflict → kiểm actor/operation/target/body/key; dynamic test ports đổi sau restart/recreate → đọc lại mapping; PARKED → điều tra code/schema/attempt trước replay. Không dùng log chứa URL credential/token/body làm evidence.
6. M4 tiếp theo: chỉ định owner/reviewer; chốt D09 và browser/nhiều tab; review/freeze draft và regenerate; Event implement provider không vòng gọi + Identity adapter; hai phía validate cùng artifact rồi E2E thật; frontend derive types/đổi transport/coordinator/logout và contract-valid fixtures; business consumer chốt queue/dedupe/revision và kiểm đúng queue. Acceptance từng consumer ghi riêng tại H tương ứng.

P8 là đầu ra **chuẩn bị bàn giao**. Việc bên nhận chưa xác nhận, D09 DRAFT hoặc integration thật NOT RUN được ghi dependency rõ; không tự nâng M4 hoặc nhận xét production-ready từ local tests.
