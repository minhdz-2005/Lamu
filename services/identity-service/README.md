# Identity & Organization Service

Sở hữu user, tổ chức, membership, role, permission, phiên đăng nhập và authorization check. Database: `identity_db`.

Trạng thái P8 14/11/2026: **M1/M2/M3 local đã triển khai; gói chuẩn bị bàn giao P8 hoàn tất** theo [báo cáo P8](report/REPORT_P8_INTEGRATION_HANDOFF_01.md). [Handoff §7–§10](../../docs/integration/identity-handoff.md) chứa mapping API/event/frontend, H01–H05, checklist bên nhận và D09 DRAFT. M4 frontend/Event provider/adapter/business consumer chưa triển khai; không suy nghiệm thu M4 từ regression hoặc fixture. Các đoạn ghi “trong M1/P5/P6” dưới đây giữ giới hạn lịch sử từng mốc; bằng chứng hiện tại đọc báo cáo P8.

M1 đã có backend NestJS/Prisma và Gateway. Phạm vi: register/login, JWT/profile, refresh/logout, UserRegistered outbox nguyên tử. Organization/RBAC API M2, worker RabbitMQ M3 và frontend/Event thật M4 chưa triển khai trong M1. Xem [báo cáo tổng](report/REPORT_M1_AUTH_GATEWAY_01.md) để phân biệt kiểm thử tự động với phần NOT RUN.

## Chạy local

M2/P5 tiếp nối M1 đã triển khai organization/read/member/role replacement, internal authorization và public user profile theo [ADR 0003](../../docs/adr/0003-m2-p5-organization-rbac.md). Phạm vi/bằng chứng: [P0](report/REPORT_M2_P0_CONTRACT_01.md), [P5](report/REPORT_M2_P5_ORGANIZATION_RBAC_01.md). P6 invitation triển khai theo ADR 0004; M2 đã nghiệm thu, manual Swagger/DOC-01 PASS theo xác nhận người dùng; xem [báo cáo nghiệm thu](report/REPORT_M2_ACCEPTANCE_01.md).

P5 dùng cùng profile Compose `m1`/job migrate; deploy migration `202611140001_p5` thêm revision/idempotency và DML migration riêng `202611140002_rbac_reference` khởi tạo RBAC hệ thống cho DB mới, không phụ thuộc demo seed/không reset DB. Trong Swagger sau login, tạo organization với Idempotency-Key mới (success 201), đọc org/members, PUT roles với key mới. Assignment bắt buộc code/resource_type/resource_id, roles là tập unique, thay toàn bộ. Replay giữ kết quả cũ trong 24h nhưng kiểm lại quyền hiện tại; actor tự hạ mất quyền có thể nhận 403 khi retry. No-op/replay không tăng revision/event. Default runtime từ chối EVENT mutation với EVENT_SCOPE_UNVERIFIED; test mới được inject fixture resolver, không có env bật fixture. Internal check/profile không route qua Gateway.

`npm run test:m1` hiện chạy các Jest spec đã có (cả M3 unit/DB), PostgreSQL thật/coverage, **không** bao gồm `m3-broker.integration.cjs` hoặc broker lifecycle. Full DB+broker/lifecycle/Compose dùng `npm run test:m3`. Target Compose P5 cũ ghi suffix01 cố định; không chạy lại nếu artifact đã có. Test upgrade áp dụng SQL cũ, lưu dữ liệu tổng hợp rồi SQL additive và so invariants, không migrate reset. Manual Swagger/DOC-01 M2 PASS — USER-CONFIRMED. Production-sized migration/backup restore và Event thật chưa kiểm chứng; broker delivery có evidence P7/P8 riêng.

Từ root repository, cần Docker Engine/Compose. Chỉ Gateway publish cổng ứng dụng; Identity/DB ở network nội bộ.

```powershell
node scripts/init-local-env.cjs
docker compose --profile m1 up --build -d --wait gateway
docker compose --profile m1 ps -a
```

Generator tạo `.env` với JWT/database secret ngẫu nhiên và không in giá trị; từ chối ghi đè `.env` đã có. Nếu đã có `.env`, tự cấu hình JWT_SECRET ngẫu nhiên ít nhất 32 byte; placeholder cũ bị từ chối. Không commit `.env`. JWT_ISSUER/JWT_AUDIENCE phải giống nhau giữa Gateway và Identity. POSTGRES_PASSWORD trong URL phải là chuỗi URL-safe (generator dùng hex); nếu tự đặt ký tự đặc biệt cần URL-encode trước cấu hình DATABASE_URL.

Đích `gateway` chỉ kéo Identity DB → job `identity-migrate` → Identity → Gateway, không chạy RabbitMQ hoặc database khác. Migration job phải exit 0; migration lỗi chặn Identity khởi động. Liveness `/healthz`, readiness `/readyz` nội bộ; Gateway readiness phụ thuộc Identity. Thiếu/sai config làm process exit khác 0; DB mất kết nối sau startup làm readiness 503, liveness vẫn 200. Khi khởi động có lỗi, lưu log đã che nhạy cảm trước khi sửa môi trường; không reset volume để vượt lỗi.

Swagger: [http://localhost:8080/docs](http://localhost:8080/docs), contract JSON `/docs-json`. Dùng register → login → **Authorize** bằng access_token → GET `/api/users/me`; refresh gửi refresh_token trong JSON; logout gửi access + refresh hiện hành cùng phiên. `.http` mẫu: [requests/m1.http](requests/m1.http). Không paste token thật vào file được theo dõi hoặc báo cáo.

## Migration và seed

Migration version `202611130001_m1`: tám bảng nền + outbox, CITEXT, FK nội bộ, CHECK scope/expiry và UNIQUE NULLS NOT DISTINCT. Không dùng `db push` hoặc `migrate reset`. Migration đã áp dụng là bất biến; production rollback dùng migration tiến hoặc backup/restore được kiểm thử riêng, không có auto destructive DOWN cho schema mới. Index inline chỉ tạo trên bảng mới; nâng cấp bảng lớn phải có chiến lược index/lock riêng. Production-sized migration/restore chưa được chạy trong M1 local.

Image `identity-migrate` target tools chứa Prisma CLI/tsx cho migration, seed và benchmark; hai image app runtime loại dev runner/tsx, chạy user `node`. Seed là lệnh riêng, không nằm trong migration/startup:

```powershell
docker compose --profile m1 run --rm --no-deps -e APP_ENV=local identity-migrate npm run db:seed -w @lamu/identity
```

Seed demo chỉ cho local; từ chối ngoài APP_ENV=local. Hai org `demo-a`, `demo-b`; tài khoản `owner1`, `owner2`, `admin`, `speaker`, `guest` tại domain `@demo.lamu.test`. Password local mặc định `LocalDemo!2026`; có thể truyền SEED_PASSWORD khi tạo lần đầu. Seed lại giữ nguyên password/hash, user/session và dữ liệu không thuộc seed; phát hiện drift/collision thì rollback thay vì sửa/xóa ngầm. Bốn role/mười permission đúng ma trận kiến trúc; ADMIN A là OWNER B, A có hai OWNER, B một OWNER; SPEAKER dùng UUID event fixture, **không phải Event integration**. Guest không membership. Seed không phát event.

Register ghi user + UserRegistered PENDING cùng transaction; không kết nối broker, không dựng lại event khi retry. Worker M3 sẽ dùng metadata/payload đã lưu. Chưa có bảo đảm delivery RabbitMQ trong M1.

## Kiểm chứng từ source

Node 24.19/npm 11.17; package/lockfile backend ở root, frontend tách biệt. Chạy từ root:

```powershell
npm ci --ignore-scripts
npm run db:generate -w @lamu/identity
npm run typecheck
npm run contracts:check
npm run format:check
npm run test:m1
npm run test:compose
```

`test:m1` tự tạo PostgreSQL test tmpfs với credentials ngẫu nhiên, migration, seed hai lần, Jest/Supertest + coverage; `test:compose` tạo project/volume test riêng, luồng container thật và fault injection DB outage, restart/redeploy rồi tự dọn đúng project test. Không dùng volume demo. Không chạy suite DB bằng `npm test` trực tiếp nếu chưa chuẩn bị env/database. Các test biên có cấu hình rate limit cao riêng; runtime mặc định 100 request/phút/IP và auth 20/phút/IP. Identity nhìn thấy IP Gateway nên giới hạn local là tổng hợp phía sau Gateway, không có distributed limiter hay tin X-Forwarded-For từ client.

Contract chuẩn [Identity OpenAPI](../../shared/contracts/http/identity.openapi.json); Gateway projection và consumer types được generate/kiểm từ đó. Sau đổi artifact có review, chạy `node scripts/contract-projection.cjs`, `npm run generate:contracts`, `npm run contracts:check`. Không tải remote refs/generator tùy ý.

P8 thêm [Event HTTP resolver DRAFT](../../shared/contracts/http/event-context.draft.openapi.json). Kiểm `node scripts/check-event-context-draft.cjs` để validate draft/examples/errors/local refs và parity generated types Identity/draft. PASS ở đây không chứng minh Event HTTP provider/adapter đã có. Chốt D09 trước implementation M4; không thay default fail closed bằng fixture runtime.

## Giới hạn session và môi trường

Access HS256 15 phút; refresh opaque 32 byte/hash-only, 7 ngày tuyệt đối. Rotation một winner, giữ sid/hạn; token cũ 401. Logout chỉ revoke đúng phiên, mismatch access/refresh 401; retry đúng refresh hiện hành đã revoke khi còn hạn trả OK và không đổi revoked_at. Giữ record ít nhất expires_at + 15 phút, M1 chưa cleanup. Access đã cấp có thể còn hiệu lực tới exp sau logout; không có logout-all hoặc revoke access tức thời. Nếu access hết hạn, refresh trước rồi logout bằng cặp mới.

Identity không tự verify JWT; chỉ Gateway xác thực rồi cấp context header. Network trust này chỉ được chốt cho local. Frontend chưa đổi; backend M1 trả bearer/refresh trong JSON theo contract API client, chưa triển khai cookie/session browser M4. LOCKED được kiểm tại Identity login/refresh/profile, chưa cam kết hiệu lực trên các service M4. PostgreSQL port không publish ở Compose; test DB chỉ mở loopback tạm thời. Dừng local bằng `docker compose --profile m1 stop gateway identity-service identity-db`; `down` giữ volume. Không dùng `down -v` với project demo có dữ liệu cần giữ.

Theo dõi bàn giao cho các service khác tại [Identity/Gateway handoff](../../docs/integration/identity-handoff.md): cập nhật người phụ trách/người nhận, tiến độ từng đầu ra, contract version và bằng chứng tích hợp. Phạm vi triển khai ở [MASTER_PLAN.md](MASTER_PLAN.md); đề xuất rà soát ở [REVIEW_MASTER_PLAN01.md](report/REVIEW_MASTER_PLAN01.md). Bảng handoff không thay thế API/event contract hoặc báo cáo nghiệm thu.


P6 dùng migration additive `202611140003_p6_invitations`, hạn invitation 7 ngày, snapshot role phía server; OWNER ACTIVE tạo/revoke, recipient ACTIVE list/accept/decline. Create 201, action 200; bốn POST cần Idempotency-Key TTL24h/lock2s. Existing membership kể cả INACTIVE trả ALREADY_MEMBER, không ghi đè/reactivate. Accept atomically ghi membership/assignments/revision1/MembershipChanged/result; replay không chạy lại nghiệp vụ, kiểm quyền nhận kết quả hiện tại. [Contract](report/REPORT_M2_P6_CONTRACT_01.md) / [evidence](report/REPORT_M2_P6_INVITATION_01.md).

Luồng Swagger dự kiến: OWNER login → POST organization hoặc dùng org có quyền → POST members/invitations bằng email recipient và roles scoped → recipient login → GET users/me/invitations → POST accept với body rỗng/key mới → GET users/me thấy membership. Decline/revoke dùng các lời mời PENDING khác; accept không nhận roles. Manual Try it out/DOC-01 M2 PASS — USER-CONFIRMED, không phải lượt manual do Codex trực tiếp chạy. `npm run test:m1` chạy regression M1/P5/P6; `node scripts/compose-smoke.cjs --p6` ghi artifact M2_P6 riêng, không ghi đè bằng chứng cũ. EVENT chỉ test inject, runtime thiếu resolver từ chối cả create/accept; không dùng env để bật fixture.

## M3 — Worker, delivery và khôi phục local

[Messaging v1](../../docs/api/messaging.md) và ADR0005 chốt riêng M3; [P7](report/REPORT_M3_P7_OUTBOX_DELIVERY_01.md) là nguồn trạng thái kiểm chứng thực tế. API/worker cùng image nhưng process riêng, runtime user `node`. Migration `202611140004_m3_outbox` additive metadata + audit attempts/replay, giữ snapshot/IDs/session/idempotency/revision/invitation/backlog. M1 và M2 vẫn ghi outbox được khi broker down.

Trước lần bật M3 trên môi trường đang có dữ liệu, xem inventory container/mount/node/queues/messages bằng các lệnh đã lọc; không dump env/credentials. Nếu có broker/storage cũ cần giữ, thống nhất backup/chuyển trước thay image/mount. Named volume mới không tự chuyển dữ liệu cũ. Inventory M3/P0 không thấy broker cũ trong Docker context đã kiểm, không chứng minh mọi môi trường đều mới.

```powershell
# Dùng .env local đã cấu hình, không in giá trị.
docker compose --profile m3 up --build -d --wait gateway rabbitmq identity-worker
docker compose --profile m3 ps -a
docker compose --profile m3 logs --tail 50 identity-worker

# Tái hiện test thật, project/volume/credentials riêng; không dùng volume demo.
npm run test:m3
```

`node scripts/test-m3.cjs --compose-only` chỉ tái hiện Compose offline/reconnect/delivery/SIGTERM trên project mới; **không chạy regression/lifecycle** và không thay lệnh full ở trên. Mapping cổng host test được đọc lại sau recreate/down-up/stop-start; AMQP bên trong Compose vẫn dùng rabbitmq:5672.

AMQP không mở host port ở Compose thường; management chỉ http://127.0.0.1:15672. Worker tự reconnect với backoff, không đòi broker healthy để process/API được khởi động. Structured logs chỉ event_id/attempt_id/status/error code; không payload/email/credentials. PENDING chờ next_attempt_at, PROCESSING chờ lease60s, SENT đã broker handoff, PARKED cần điều tra. Không xoá backlog khi lỗi; không coi ACK là consumer đã xử lý. Queue local giữ message dù chưa có consumer nghiệp vụ, không TTL/auto-delete.

Replay chỉ PARKED; reason không chứa thông tin nhạy cảm. Mặc định dry-run, thêm `--apply` mới chuyển PENDING, giữ ID/envelope và ghi audit. Không tự sửa schema/payload hoặc replay SENT.

```powershell
docker compose --profile m3 run --rm --no-deps identity-worker node services/identity-service/dist/messaging/replay.js <event_id> "operator investigation"
docker compose --profile m3 run --rm --no-deps identity-worker node services/identity-service/dist/messaging/replay.js <event_id> "approved parked retry" --apply
```

Kiểm tra bằng truy vấn read-only qua PostgreSQL tools, chỉ chọn ID/status/attempt_count/lease_until/next_attempt_at/last_error_code, không dump payload/hashes/tokens vào report. Audit ở `outbox_delivery_attempts` và `outbox_replays`; exhaustion20/cycle vẫn PARKED và giữ lịch sử. Invalid schema replay sẽ park lại. Chạy CLI host sau build cần DATABASE_URL; `npm run outbox:replay -w @lamu/identity -- <event_id> "reason" [--apply]`.

Để recreate broker, giữ cùng Compose project, volume `rabbitmq-data`, hostname/node `rabbitmq`/`rabbit@rabbitmq` và image digest đã pin. `docker compose --profile m3 up -d --no-deps --force-recreate rabbitmq` giữ named volume; down/up không `-v` cũng giữ storage. Backup/restore/mất volume/host và replay SENT sau disaster là quy trình riêng chưa được bảo đảm. Không tự dùng các lệnh fault/recreate trên broker shared/demo. Test harness thực hiện lifecycle trên project `lamu-m3-test-<runid>` riêng và giữ volumes/evidence để điều tra.

SIGTERM/SIGINT ngừng claim, drain inflight tối đa15s rồi close; process hard deadline18s, Compose grace20s. Attempt chưa rõ kết quả để lease reclaim, chấp nhận duplicate cùng event ID sau broker ACK trước DB SENT. Stale token không finalize được. Rollback app giữ additive schema/audit; không sửa migration đã chạy/reset/db push. Index migration local dùng DDL thông thường với lock ngắn; production-sized lock/backup chưa được kiểm chứng.

### Truy vấn trạng thái an toàn và tái hiện P8

Các lệnh dưới chỉ đọc status/IDs/codes và topology, không dump Config.Env/payload/session/password hash. Dùng đúng local project đã chủ động khởi động; không fault/recreate/replay apply vào demo/shared chỉ để kiểm chứng.

```powershell
docker compose --profile m3 exec -T identity-db psql -U lumasoa -d identity_db -c "SELECT status,count(*) FROM outbox_events GROUP BY status ORDER BY status"
docker compose --profile m3 exec -T identity-db psql -U lumasoa -d identity_db -c "SELECT event_id,status,attempt_count,lease_until,next_attempt_at,last_error_code FROM outbox_events ORDER BY occurred_at DESC LIMIT 20"
docker compose --profile m3 exec -T rabbitmq rabbitmqctl list_queues name durable auto_delete messages messages_ready messages_unacknowledged
docker compose --profile m3 exec -T rabbitmq rabbitmqctl list_bindings source_name destination_name routing_key
```

Nếu POSTGRES_USER local đã đổi thì thay `-U` tương ứng, không đưa password vào command/report. SENT count không chứng minh subscriber/consumer đã nhận; queue có message không chứng minh business processing.

P8 chạy mới full `npm run test:m3` và target `node scripts/compose-smoke.cjs --p6 --evidence-run=03`; xem báo cáo P8. Khi tái hiện **chọn suffix NN hai chữ số chưa tồn tại cả** `M2_P6_COMPOSE_EVIDENCE_NN.json` lẫn `M2_P6_ARGON2_BASELINE_NN.txt`; script P6 hiện chưa tự chặn ghi đè. Không chạy lại03 hoặc suffix01 mặc định khi đã có artifact. Full M3 tự tạo thư mục/project timestamp mới, down không-v và giữ named volumes. P6 target dọn đúng project test riêng; không dùng project/volume demo. `test:compose`/P5 cũ dùng artifact cố định, tránh khi cần giữ bằng chứng cũ.
