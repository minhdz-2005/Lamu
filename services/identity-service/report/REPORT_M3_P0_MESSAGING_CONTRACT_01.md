# M3/P0 — Đề xuất contract messaging để xác nhận

Ngày 14/11/2026 (Asia/Saigon). **ACCEPTED A–E**: người dùng trả lời “xác nhận toàn bộ tiếp tục công việc” sau khi nhận đề xuất. Nguồn duyệt riêng M3, không suy từ M2 acceptance. [Messaging v1](../../../docs/api/messaging.md) và [ADR 0005](../../../docs/adr/0005-m3-outbox-delivery.md) chốt trước implementation phụ thuộc. Nội dung baseline/đề xuất bên dưới giữ lịch sử P0; evidence implementation cập nhật riêng tại P7. Không commit.

## Hiện trạng và baseline lượt này

Đã đối chiếu MASTER_PLAN/P7, REPORT_M2_ACCEPTANCE_01, REPORT_M2_P5_ORGANIZATION_RBAC_01, REPORT_M2_P6_CONTRACT_01, REPORT_M2_P6_INVITATION_01, REVIEW_MASTER_PLAN01/F08–F10, ADR 0002–0004, identity-handoff D10/D11/D12, catalog, architecture, events README, ba schema/fixture Identity, Prisma schema/bốn migration, các đường ghi outbox, Dockerfiles, Compose và test scripts. NestJS module/service, validation, auth/session, RBAC, invitation và idempotency hiện có được giữ nguyên.

| Lệnh thực sự chạy | Expected | Actual |
|---|---|---|
| `git status --short` ban đầu | Xác định thay đổi có sẵn | Sạch |
| `node --version`; `npm --version` | Runtime phù hợp root engines | v24.19.0 / 11.17.0 |
| `npm run typecheck` | Build runtime/Identity/Gateway + test types | Exit 0, PASS |
| `npm run contracts:check` | OpenAPI/local refs/Gateway projection hợp lệ | Exit 0, PASS |
| `npm run test:m1` | Regression M1/P5/P6 trên PostgreSQL test riêng | Exit 0, 20 suites/99 tests PASS, không skipped, 44.196s |
| `npm audit --omit=dev --audit-level=moderate` | Audit production dependencies | Exit 0, 0 vulnerabilities |
| `npm run format:check` | Format source/test/scripts hiện có | Exit 0, PASS |
| `docker ps -a --format ...`; `docker volume ls --format ...` | Kiểm broker/storage trước thay đổi | Không có container RabbitMQ hoặc volume tên RabbitMQ |
| `docker volume inspect <anonymous-volume> --format ...`; `docker ps -a --filter volume=<anonymous-volume> --format ...` | Xác định anonymous volume trước kết luận | Volume thuộc container PostgreSQL `eventhub-mobile-migration-test`; không đụng vào |
| `docker image inspect postgres:16-alpine --format ...` | Ghi image ID/digest DB test | `sha256:aa6cb33cf4c19c765cefcf48d96176258800870a9a1e930ad126200f9d825139` |
| `npm view amqplib version engines --json`; `npm view amqplib@2.3.1 engines types typings --json` | Xác minh client/runtime/type declarations | 2.3.1, Node >=18, bundled `./index.d.ts`; chưa cài/build client |
| `npm view amqplib@0.10.9 version engines --json` | Đối chiếu lựa chọn cũ | 0.10.9 tồn tại, Node >=10; không chọn chỉ vì ví dụ cũ dùng 0.10.x |
| `docker manifest inspect rabbitmq:4.2.1-management-alpine --verbose` | Xác minh ứng viên | Exit 0; loại khỏi đề xuất vì nhánh 4.2 đã hết community support theo release page |
| `docker manifest inspect rabbitmq:4.4.0-management-alpine --verbose` | Xác minh tag và platform | Exit 0, có linux/amd64; lưu descriptors, chưa pull/start image |

Artifact riêng: [M3_P0_RUN_20261114_01](M3_P0_RUN_20261114_01/baseline.json), `typecheck.txt`, `contracts.txt`, `regression.txt`, `audit.txt`, `format.txt`, `rabbitmq-manifest.json`. Baseline JSON lưu Docker version, HEAD, hash source/contracts/tests/migrations và inventory đã lọc, không env/container credentials. Lệnh inventory dùng format chỉ ID/name/image/status, volume labels; không dump Config.Env. Không đọc/in `.env`.

Coverage **lượt này**: statements 98.05%, branches 91.44%, functions 98.76%, lines 98.11%; ngưỡng global 80% PASS. Đây là coverage M1/M2, chưa có M3. Script `test:m1` thực tế tạo container tmpfs `lamu-m1-test-1794656867488`, migrate bốn migration, seed hai lần rồi chạy toàn bộ Jest và dọn đúng container test đó. Không reset DB demo. ORG/Identity/Gateway/PostgreSQL thật; EVENT resolver fixture tiêm riêng, normal runtime thiếu resolver fail closed. Manual Swagger/DOC-01 M2 giữ **USER-CONFIRMED**, Codex không chạy manual lượt này.

Outbox hiện có envelope columns/payload JSONB/status PENDING/SENT, index status/occurred_at và CHECK chỉ hai status; chưa có claim/lease/retry. Register và organization/invitation accept ghi outbox trong transaction nghiệp vụ. Compose dùng tag nổi `rabbitmq:3-management-alpine`, không khai báo mount/hostname/nodename. Tại thời điểm quan sát không có broker để đọc version/node/queues/messages; không suy broker ngoài Docker context này hoặc bản backup không tồn tại. Hai volume thấy được là Identity và PostgreSQL test cũ, không phải dữ liệu broker cần chuyển.

## Gói A — Client, wire format và phạm vi

- Pin **amqplib 2.3.1** ở Identity workspace và root lockfile; dùng Promise API với `createConfirmChannel`, callback confirm riêng mỗi publish. Node >=18 bao gồm Node 24.19.0; typings bundled tránh thêm handwritten declarations. Đây là compatibility theo metadata/source; runtime/build/container vẫn phải chứng minh sau duyệt.
- Worker NestJS application context/process riêng, module messaging dùng DB provider; API không import/kết nối RabbitMQ. API readiness tiếp tục theo DB, broker down không cản transaction state + outbox. M1 chạy không cần broker; M3 thêm profile/command worker.
- Chỉ UserRegistered/OrganizationCreated/MembershipChanged v1 từ backlog M1/M2 và mutation mới. Schema JSON hiện có là authority, không sửa payload/version/trigger, không invitation event/email/consumer nghiệp vụ/Event resolver M4.
- JSON body là envelope lấy từ row đã lưu, không query user/org/membership để tái dựng snapshot. Giữ event_id, occurred_at, aggregate và payload/revision gốc. JSONB không giữ whitespace/key order; bảo đảm nội dung JSON, không hứa byte-for-byte văn bản chưa từng lưu. Đọc timestamp bằng biểu diễn UTC giữ độ chính xác DB; không làm tròn microseconds qua Date nếu dữ liệu cũ có precision cao hơn milliseconds.
- AMQP: `messageId=event_id`, `contentType=application/json`, `contentEncoding=utf-8`, `persistent=true` (delivery mode 2), `mandatory=true`, `type=event_type`, `appId=identity-service`; headers `schema_version=version`, `x-publish-attempt-id=<UUID claim token>`. Header attempt thay theo retry; body/event/message ID không đổi. Không thêm credential hoặc payload vào log. AMQP timestamp không dùng thay occurred_at gốc.

## Gói B — Topology và nghĩa SENT (D10/F08, delivery D12)

Exchange **`lamu.events`**, type topic, durable=true, autoDelete=false; không alternate exchange. Routing keys:

| Schema v1 | Routing key |
|---|---|
| UserRegistered | `identity.user.registered.v1` |
| OrganizationCreated | `identity.organization.created.v1` |
| MembershipChanged | `identity.membership.changed.v1` |

Queue lưu/kiểm thử local **`identity.m3.delivery.v1`**, durable=true, exclusive=false, autoDelete=false, explicit `x-queue-type=classic`, bind chính xác ba keys. Không TTL/max-length/drop policy, không auto-purge. Đây là queue giữ message cho nghiệm thu local, không là consumer MUST. Test fault injection dùng vhost/project/volume riêng cùng topology; queue bổ sung `identity.m3.other.v1` chỉ ở test có chủ đích.

Worker assert exchange/queue/bindings trước vòng gửi sau connect/reconnect; lỗi declaration dừng claim mới và backoff, không xoá/recreate topology xung đột. Test thiếu binding tháo binding sau setup có barrier để không bị setup tự sửa trước publish.

**Đề xuất cần duyệt rõ:** SENT nghĩa broker ACK attempt mandatory, không return, không terminal channel/connection fault/timeout của attempt, và conditional DB update còn sở hữu lease thành công. SENT là bàn giao broker có route tới ít nhất một queue; không phải consumer ACK, không chứng minh mọi queue subscriber đã nhận. Queue đúng và payload đúng phải có evidence dequeue riêng.

Vì vậy ca queue đích thiếu binding nhưng queue khác nhận cùng routing key sẽ có ACK/no-return và **có thể SENT theo nghĩa trên**, trong khi assertion delivery queue đích phải phát hiện không nhận; không được báo gate delivery đích PASS. Test negative topology này PASS chỉ khi quan sát đúng sự khác biệt đó, sau đó khôi phục topology và kiểm delivery đúng queue bằng event test/replay có chủ đích. Không che thiếu binding bằng assert queue existence. Nếu yêu cầu SENT phải chứng minh từng queue đích thì cần contract khác (ví dụ receipt từ từng đích hoặc định tuyến riêng), vượt bảo đảm publisher confirms và phải chốt trước implementation; không tự dùng preflight HTTP bindings để hứa atomic delivery.

## Gói C — Tương quan attempt và state machine

- Một connection/process, một confirm channel, tối đa 10 inflight. Map attempt UUID → context {event_id, channel generation, returned, terminal, deadline}; callback confirm đóng trên đúng context. Return tra header attempt UUID và messageId, không dùng event ID đơn lẻ vì retry giữ ID. Unknown/mismatched return hoặc lỗi handler là protocol fault: invalidate channel/generation, fail pending attempts; không bỏ qua để mark SENT.
- Đăng ký return/error/close/blocked handlers trước publish. Return handler đồng bộ đặt returned cho đúng context trước khi confirm callback xét thành công. Không `await` trước khi cập nhật cờ return. amqplib theo dõi confirm callback theo sequence của channel, kể cả cumulative ACK; không dùng `publish()` boolean hoặc `waitForConfirms()` chung làm kết quả từng event.
- Return luôn thất bại, kể cả ACK sau đó. NACK, sync throw, error/close connection/channel, timeout hoặc protocol fault: không SENT. Mất kết nối fail mọi attempt chưa hoàn tất. Return/confirm cũ không được gắn sang channel generation mới. Double callback/error sau settle phải idempotent.
- Confirm timeout **10s**, connection/setup timeout **5s**, heartbeat **10s**. Timeout là deadline thất bại, không là timer suy thành công. Khi timeout invalidate channel và fail pending chưa settle; reconnect channel mới. Blocked connection ngừng claim, inflight vẫn có deadline. Backpressure false dừng publish thêm đến drain/deadline, message đã viết vẫn chờ confirm.
- Broker ACK/no-return tạo kết quả thành công attempt; DB SENT chỉ cập nhật khi token/status/lease vẫn hợp lệ tại DB update. Fault đã quan sát trước lúc kết quả attempt được chốt thắng ACK; fault xảy ra sau một attempt đã confirm hoàn tất không thu hồi broker confirm lịch sử. Crash sau confirm hoặc DB update lỗi giữ khả năng retry và duplicate cùng ID, không mutation nghiệp vụ lại.

## Gói D — Additive persistence, retry, parked và shutdown

- Migration mới, không sửa bốn migration cũ: thêm `attempt_count INT DEFAULT 0`, `next_attempt_at TIMESTAMPTZ DEFAULT now()`, `claim_token UUID NULL`, `lease_until TIMESTAMPTZ NULL`, `last_attempt_at`, `sent_at`, `last_error_code`, `parked_at`; mở CHECK status thành PENDING/PROCESSING/SENT/PARKED và thêm invariant claim/lease, attempt>=0, SENT timestamp. Index due/reclaim có thứ tự next_attempt_at/occurred_at/event_id. Existing PENDING giữ snapshot/ID; existing SENT nếu có phải có phương án nullable legacy sent_at, không tự bịa thời điểm SENT. Không hồi tố lịch sử hoặc xóa row.
- Transaction ngắn dùng `FOR UPDATE SKIP LOCKED`, DB clock `clock_timestamp()`: claim tối đa **10**, mỗi row token UUID mới, lease **60s**, increment attempt_count; trả rows rồi commit trước I/O broker. Poll **1s**, concurrency **10**, không overlapping poll; chỉ claim theo capacity trống. PROCESSING hết lease có thể reclaim bằng token mới. Không giữ DB lock khi chờ broker, không heartbeat kéo lease vô hạn.
- SENT/retry/PARKED dùng WHERE event_id + status PROCESSING + claim_token + lease_until > DB clock, clear claim/lease khi chuyển trạng thái; affected=0 là ownership lost, không success. Worker cũ không đổi claim mới. DB lỗi sau publish không ghi trạng thái giả; lease expiry bảo đảm reclaim.
- Retry lỗi delivery với cùng event ID: exponential **min(300s, 1s × 2^(attempt_count−1))**, jitter uniform 0.5–1.0 của delay, tối đa **20 attempts/cycle** rồi PARKED. Reclaim crash cũng tính attempt; hết budget thì park, không SENT. Reconnect dùng backoff riêng 1–30s cùng jitter; không tạo claim mới khi chưa có channel/topology sẵn sàng. Lỗi DB ownership update không tự đánh PARKED khi chưa ghi được DB.
- Validate bằng pinned Ajv + formats (promote dependency runtime khi worker cần), whitelist ba event/version schemas; thêm kiểm aggregate_id khớp payload ID và ORG resource_id khớp organization_id. Không resolve membership snapshot với DB hiện tại/Event service. Sai schema/unknown type-version park ngay với error code an toàn; giữ nguyên body, không publish một phần, không log email/payload hoặc validator value nhạy cảm.
- Replay là CLI operator nội bộ có `event_id` và reason bắt buộc, mặc định dry-run; chỉ PARKED → PENDING conditional transaction, không sửa body/ID/occurred_at/revision; reset retry budget và giữ audit lịch sử trong bảng delivery attempts/replay audit additive riêng (không credentials/payload). Không API public, không tự replay SENT. Schema sai vẫn park lại cho tới khi có repair/migration được review riêng. SENT disaster recovery là quy trình riêng cần xác nhận, không suy từ CLI parked replay.
- Shutdown SIGTERM/SIGINT ngừng claim/poll ngay, chờ inflight + DB finalize tối đa **15s**; Compose stop_grace_period **20s**. Hết hạn close channel/connection, không SENT attempt chưa confirm; pending ownership còn lại hết lease rồi reclaim. DB operation cũng phải có timeout hữu hạn trong budget shutdown. Worker process không kéo HTTP API xuống.
- Migration rollback ứng dụng giữ schema/additive audit; không DOWN phá dữ liệu. Test upgrade so sánh toàn bộ state/outbox M1/M2, bao gồm session/idempotency/revision/invitation, trước/sau; production-sized migration/backup chưa được chứng minh từ baseline local.

## Gói E — Image, storage và giới hạn môi trường (D11/F09)

Đề xuất **`rabbitmq:4.4.0-management-alpine`**, linux/amd64 manifest digest **`sha256:598b474e2511f37a7408f3fa580f002684638f4ad6401395102b51e3209a9a51`**; pin tag+digest khi sửa Compose, không dùng latest/tag major nổi. Manifest đã truy vấn, image chưa pull/start và runtime image ID/version chưa có. Đây là broker local mới vì inventory không thấy RabbitMQ hiện hữu; không gọi là nâng cấp 3→4 hay đã di chuyển dữ liệu. Nếu inventory thay đổi/có dữ liệu broker cần giữ, dừng phần storage và hỏi phương án cụ thể trước thao tác phụ thuộc.

Named volume **`rabbitmq-data:/var/lib/rabbitmq`**, hostname `rabbitmq`, `RABBITMQ_NODENAME=rabbit@rabbitmq`, cùng Compose project/volume qua recreate/down-up không `-v`. AMQP nội bộ; management bind loopback 127.0.0.1:15672, credentials từ env, không đọc/in secret hoặc dump `docker compose config` nội suy. Giới hạn local single-node/classic: volume không thay backup/replication, mất host/volume không được bảo đảm. Consumer tương lai cần retention/dedupe riêng.

Lifecycle/fault tests dùng project `lamu-m3-test-<runid>`, volume/vhost/ports riêng, credentials synthetic trong RAM. Không gỡ binding/restart/stop demo hoặc shared broker; không xóa volume demo/shared. Ghi image ID sau pull, broker/node version thật, volume identity và message IDs trước/sau riêng từng case restart và recreate/down-up. Không dùng restart làm evidence recreate. Không đổi PostgreSQL/demo storage.

## Nguồn semantics và kiểm chứng còn phải làm

[RabbitMQ confirms](https://www.rabbitmq.com/docs/confirms#when-publishes-are-confirmed) xác định return của mandatory unroutable đi trước ACK/NACK; confirm không gắn với việc consumer xử lý. [amqplib API](https://amqp-node.github.io/amqplib/channel_api.html) mô tả return event, confirm callback và backpressure. Đã đối chiếu source đúng [amqplib v2.3.1 channel](https://github.com/amqp-node/amqplib/blob/v2.3.1/lib/channel.js), [channel model](https://github.com/amqp-node/amqplib/blob/v2.3.1/lib/channel_model.js): return content phát event đồng bộ, ACK/NACK gọi callback đã đăng ký qua cơ chế sequence. Suy luận thiết kế: synchronous attempt map kết hợp protocol ordering tránh cần timer đợi return; phải chứng minh bằng test thật với version được pin, không coi đọc source là runtime PASS. [Release information](https://www.rabbitmq.com/release-information) dùng để chọn nhánh 4.4; [persistence](https://www.rabbitmq.com/docs/persistence-conf) để giới hạn single-node storage.

Sau xác nhận A–E: tạo messaging contract/ADR và đồng bộ canonical artifacts liên quan trước production worker. TDD target M3 phải chạy RED hợp lệ rồi cùng target GREEN; không commit checkpoint vì yêu cầu người dùng cấm commit ưu tiên hơn skill. Mapping/commands/evidence thực tế bổ sung vào [P7](REPORT_M3_P7_OUTBOX_DELIVERY_01.md).

Các gate M3 **NOT RUN**: backlog/new events + exact stored schema/IDs/revision, broker down/reconnect/API commits offline, return+ACK, other queue/missing target binding, simultaneous attempts/NACK/timeout/channel/connection errors, claim crash/lease reclaim/stale owner, crash sau confirm và DB SENT failure, replay/invalid schema, restart **và** recreate/down-up, migration upgrade preservation, M1/M2/M3 full regression/coverage, Compose M3 và security review worker. NACK nếu chỉ injected client sẽ ghi rõ, không gán broker thật phát NACK. Không suy M3 COMPLETE từ baseline99 hoặc proposal.

**Gate đã đóng:** người dùng xác nhận toàn bộ A–E, gồm nghĩa SENT ở B, tham số/replay D và broker mới/storage E. Nguồn gate là mục 2 và 5 trong yêu cầu đính kèm; nguồn đóng là xác nhận riêng sau báo cáo này. Acceptance không thay evidence runtime tại P7.
