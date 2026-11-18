# Kế hoạch triển khai Registration & Ticketing Service

Chủ service: **minh**. Database: `registration_db`. Stack: **Java 21 + Spring Boot 3.5.x**, chạy local cùng Docker Compose.

Tài liệu này là kế hoạch thực thi, **không định nghĩa lại hợp đồng**. Nguồn hợp đồng (mọi mâu thuẫn giữa file này và các nguồn dưới đây đều là lỗi của file này):

- [docs/architecture.md](../../docs/architecture.md) §3.0, §3.3, §4.2, §5, §6, §7
- [docs/api/catalog.md](../../docs/api/catalog.md) §0, §3
- [docs/api/messaging.md](../../docs/api/messaging.md) §1–§9
- [docs/business-rules.md](../../docs/business-rules.md) — các luật BR-*
- [shared/contracts/events/README.md](../../shared/contracts/events/README.md) — payload 14 event
- Kiến thức SOA: `LectureNotesSOA-new.pdf` (bài giảng Kiến trúc Hướng dịch vụ) — trích dẫn theo chương/mục, viết tắt **LG**

Trạng thái: hai lỗ hổng hợp đồng L1 (nguồn `recipient_email`) và L2 (`organization_id` trong `event_snapshot`) đã đóng bằng commit `29a23be` trên `main`: Gateway chuyển tiếp `X-User-Email` từ claim `email` của JWT; `reservations` có cột `recipient_email`; `event_snapshot` có cột `organization_id`.

Phạm vi MUST của service (architecture §3.0): 9 bảng, lock `FOR UPDATE` + `CHECK` quota, `Idempotency-Key`, confirm vé miễn phí một bước, worker giải phóng hết hạn, outbox, 5 event phát / 5 event tiêu. STRETCH (không làm trong 4 tuần): check-in QR/scanning, waitlist, giỏ vé nhiều loại có ưu đãi.

---

## 1. Tech stack đã chốt

| Mảng | Chọn | Ghi chú |
|---|---|---|
| JDK | Java 21 LTS (Temurin) | Đã cài; kiểm tra `java -version` ở bước 0.1 |
| Framework | Spring Boot 3.5.x + Spring Web (MVC) | Blocking, hợp JDBC + row lock |
| Build | Maven | Đã cài; kiểm tra `mvn -version` |
| DB access | Spring JDBC (`JdbcTemplate`) + `TransactionTemplate`, HikariCP | SQL thuần cho `FOR UPDATE` / `SKIP LOCKED`; transaction tường minh |
| Migration | Flyway | File SQL V1, V2… trong `migrations/` hoặc `src/main/resources/db/migration` (chốt ở 0.4) |
| Broker | Spring AMQP | Publisher confirm, manual ack, prefetch, `Declarables` cho queue/DLQ |
| Validation | Bean Validation (`starter-validation`) | BR-FMT-10..14, 16; `price` decimal-string validate custom |
| JSON | Jackson, `snake_case` | Quy ước catalog §0 |
| Test | JUnit 5 + AssertJ, WireMock (giả Identity), integration test trên container compose dev | Không Testcontainers để đỡ RAM |
| Tải đồng thời | JUnit + `ExecutorService` bắn 200 request | Bằng chứng tuần 3, chạy lại bằng `mvn test` |

**Tránh** (ý kiến cá nhân, đã bàn trong phiên làm việc): JPA/Hibernate cho bảng inventory (che mất lock, stale cache); WebFlux/R2DBC (không giúp gì cho row-lock); Lombok (thêm magic khi đang học).

**Bẫy kỹ thuật phải nhớ:**

1. Spring AMQP mặc định retry/requeue khác hợp đồng — BR-ASY-03 cấm `requeue=true`, phải tự cấu hình nghỉ 1s→5s→25s trong tiến trình rồi `basic.nack(requeue=false)` sang DLQ.
2. `@Transactional` vô tác dụng khi self-invocation; dùng `TransactionTemplate` cho ranh giới tường minh. **Mọi lời gọi mạng (Identity, broker) nằm ngoài transaction giữ lock** (BR-INV-03).
3. Hikari pool mặc định 10 connection là chủ ý đúng cho bài test 200 request — hàng đợi ở pool, không tăng pool để "né" contention.
4. Dev chạy `-Xmx256m`; chỉ bật `registration-db` + `rabbitmq` khi làm một mình (máy 7.79GB RAM).
5. Cấu hình dev trỏ `localhost:5432`/`localhost:5672` qua compose override; cấu hình trong Docker network trỏ `registration-db:5432`/`rabbitmq:5672` (5672 không publish ra host ở compose gốc).

---

## 2. Bản đồ kiến thức SOA áp dụng

Đối chiếu bài giảng (LG) với chỗ áp dụng trong service này. Cột "Phần" trỏ tới các phần triển khai §3.

| Khái niệm | Nguồn LG | Áp dụng ở đâu |
|---|---|---|
| Standardized Service Contract | Ch2 §1.1, §3 | Toàn bộ API theo catalog §3; error envelope chung; payload event theo contracts README |
| Contract-first Design | Ch2 §3.5 | Code viết sau hợp đồng đã freeze; đổi API = PR có review (catalog §8) |
| Loose Coupling | Ch2 §1.2 | Không FK chéo, không đọc DB service khác; quyền hỏi Identity qua API, trạng thái event đọc snapshot |
| Service Abstraction | Ch2 §1.3 | Consumer chỉ thấy API/event; `event_snapshot` che Event service; `/healthz` không lộ chi tiết nội bộ |
| Service Autonomy | Ch2 §1.5 | DB riêng, migration riêng, deploy riêng; không REST ngược chiều consumer→producer (BR-ASY-06) |
| Service Statelessness | Ch2 §1.6 | Không session trong service; danh tính mỗi request qua `X-User-Id`/`X-User-Email` |
| Service Reusability | Ch2 §1.4 | Cùng một use-case confirm phục vụ cả endpoint nội bộ lẫn consumer saga; availability phục vụ cả trang bán lẫn Gateway composition |
| Service Composability | Ch2 §1.8; Ch7 §8.1 | `GET /availability` là mảnh ghép của `GET /api/public/events/{slug}/details` tại Gateway |
| Service Discoverability | Ch2 §1.7; Ch4 §1–2 | OpenAPI (việc tuần 1 của nhóm); định danh bằng tên service trong compose network — quy mô 5 service chưa cần registry động |
| Service Governance | Ch4 §3 | Đổi tên exchange/routing key/queue = PR review cả producer lẫn consumer (messaging mở đầu) |
| Request-Response (MEP) | Ch3 §1.4 | REST đồng bộ cho truy vấn/lệnh cần kết quả ngay |
| One-Way Messaging (MEP) | Ch3 §1.4 | Phát event cho Notification, không chờ kết quả gửi mail |
| Publish-Subscribe (MEP) | Ch3 §1.4 | `EventCancelled` một tin hai queue độc lập (`registration.event-snapshot`, `payment.event-cancelled`) |
| Choreography Saga + Compensating Transaction | Ch5 §2.4.3; Ch7 §5.1 | Giữ chỗ → confirm hoặc release; release chính là giao dịch bù trừ của hold |
| ACID cục bộ / BASE toàn cục | Ch5 §2.4.2; Ch7 §2 mục 3 | Quota + reservation + outbox một transaction ACID; snapshot/email chấp nhận eventual consistency |
| Retry + Idempotency | Ch5 §2.3.2; Ch6 §3.2.2 | LG: retry phải kèm idempotency (ví dụ `paymentId`), POST không idempotent tự nhiên. Header `Idempotency-Key` là hợp đồng project (catalog §0, BR-INV-09) — LG không nêu header này; consumer chống trùng bằng `processed_messages` |
| Timeout | Ch5 §2.3.1 | Lời gọi authorization/check có timeout; quá hạn → fail-closed, không cho qua |
| Dead Letter Queue | Ch7 §7.2 (mục 3: Xử lý lỗi) | Retry 3 lần hết → nack sang `<queue>.dlq` qua `luma.dead`; không tự bơm lại |
| Correlation ID / Distributed Tracing | Ch7 §2 mục 2 | Filter nhận `X-Request-Id` + MDC log; header `correlation_id`/`causation_id` trên message (messaging §5). LG ví dụ `X-Correlation-Id` — project dùng `X-Request-Id`, hợp đồng project thắng |
| Database per Service | Ch7 §4 | `registration_db` riêng, không chia sẻ schema persistence |
| API Gateway | Ch7 §8 | Service không expose public; chỉ Gateway gọi vào; `/internal/...` không route ra ngoài |
| OWASP API Security (BOLA) | Ch6 §7 | Kiểm tra chủ sở hữu reservation; check-in đòi `ticket.checkin` đúng event sở hữu mã vé |
| JWT + Gateway verify | Ch5 §1.6; Ch6 §6.1–6.2 | Service không tự verify chữ ký (BR-AUTH-01); tin header do Gateway ghi đè |
| Containerization | Ch8 §1 | Dockerfile multi-stage, compose build target, healthcheck |

**Có chủ đích KHÔNG áp dụng** (để khỏi over-engineer — LG cũng cảnh báo):

- **2PC** (LG Ch5 §2.4.1): chậm, coupling cao — thay bằng saga.
- **ESB** (LG Ch3 §2): microservices dùng broker + gateway, không trục trung tâm.
- **CQRS/Event Sourcing đầy đủ** (LG Ch7 §5.2–5.3, có cảnh báo chỉ dùng khi cần): `event_snapshot` chỉ là projection đọc đơn giản, không phải tách command/query model; outbox không phải event sourcing.
- **Service Mesh** (LG Ch7 §8.2 cảnh báo không dùng với compose cục bộ): không Istio/Envoy.
- **Circuit Breaker, Rate Limiting** (LG Ch5 §2.3.3, Ch6 §7.1): architecture §3.0 xếp STRETCH; mức MUST thay bằng timeout + fail-closed cho lời gọi Identity, và fallback `degraded` thuộc về Gateway.
- LG ví dụ bằng Kafka (`groupId`); project dùng RabbitMQ stock — khái niệm map 1:1 (mỗi queue một service tiêu = một consumer group), tên exchange/queue/routing key theo messaging.md, không tự đặt.

---

## 3. Các phần triển khai

Mỗi phần: mục tiêu → chức năng → API cung cấp → kiến thức SOA → công việc chi tiết (☐) với bằng chứng pass/fail. Cost là **ước lượng** theo buổi dev (~2–3h), không phải số đo.

### Phần 0 — Nền móng (khung chạy được, DB đúng schema)

**Mục tiêu:** service khởi động được, kết nối DB + broker, schema 9 bảng đúng hợp đồng, mọi lỗi cùng một envelope.

**Chức năng xây dựng:** skeleton Spring Boot; compose override dev; `/healthz`; error envelope + request-id filter; migration V1.

**API cung cấp:** `GET /healthz` (không qua Gateway, cho Compose healthcheck).

**Kiến thức SOA:** Autonomy (DB/migration riêng — LG Ch2 §1.5, Ch7 §4); Standardized Contract (envelope `{"error":{"code","message","request_id"}}` là Message + Policy contract — LG Ch2 §3.4); Abstraction (`/healthz` chỉ báo sẵn sàng, không lộ cấu hình — LG Ch2 §1.3); Correlation ID (filter + MDC đúng ví dụ Java LG Ch7 §2, nhưng header là `X-Request-Id`); Containerization (LG Ch8 §1).

| ☐ | Việc | Cách làm | Bằng chứng pass/fail | Cost |
|---|---|---|---|---|
| 0.1 | Kiểm tra toolchain + skeleton + chốt cấu trúc | `java -version` (21), `mvn -version`; Spring Initializr: web, jdbc, flyway, amqp, validation; đặt trong `services/registration-service/`. **Chốt cấu trúc package trước khi code**: src hiện có 5 thư mục layer (api/application/domain/infrastructure/messaging) chỉ chứa README; phương án đề xuất là gộp theo capability (ticketing, reservation, saga, snapshot, outbox) cho ít thư mục hơn — bạn quyết, không tự đổi | `mvn spring-boot:run` khởi động không lỗi; app đọc env; cấu trúc được bạn gật đầu | 1 buổi |
| 0.2 | Compose override dev | Tạo `docker-compose.dev.yml` riêng (không sửa file gốc): publish 5432 của registration-db, 5672 của rabbitmq | `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d registration-db rabbitmq` → healthy; JDBC + AMQP từ host kết nối được | 0.5 buổi |
| 0.3 | `/healthz` + envelope + request-id | Filter nhận `X-Request-Id` (sinh UUID nếu thiếu), đưa vào MDC; `@RestControllerAdvice` map mọi lỗi về envelope; map đủ mã lỗi catalog §0 | `curl :8080/healthz` → 200; route lạ → 404 envelope đúng shape, `request_id` khớp header gửi vào | 0.5 buổi |
| 0.4 | Migration V1 — 9 bảng | Flyway: `ticket_types`, `inventory`, `reservations` (kèm `recipient_email`), `reservation_items`, `registrations`, `tickets`, `event_snapshot` (kèm `organization_id`), `outbox_events` (BIGSERIAL), `processed_messages`; `CHECK (sold >= 0 AND reserved >= 0 AND sold + reserved <= capacity)`; UNIQUE `idempotency_key`, UNIQUE `code` | `\dt` đủ 9 bảng; `UPDATE inventory SET reserved = capacity + 1` → lỗi CHECK 23514 | 1 buổi |

### Phần 1 — Danh mục bán (ticket types + availability)

**Mục tiêu:** organizer tạo được loại vé + quota; trang bán đọc được chỗ còn và cửa bán, không gọi sang Event.

**Chức năng xây dựng:** CRUD loại vé (tạo/đọc/sửa), tính availability từ inventory, kiểm tra cửa bán theo `event_snapshot`, client RBAC sang Identity.

**API cung cấp** (shape đúng catalog §3, không định nghĩa lại):

| API | Quyền | Lỗi chính |
|---|---|---|
| `POST /events/{eventId}/ticket-types` | `event.update` | 400, 403, 409 event chưa PUBLISHED |
| `GET /events/{eventId}/ticket-types` | Công khai khi PUBLISHED | 404 |
| `GET /events/{eventId}/availability` | Công khai | 404, 409 event không PUBLISHED |
| `PATCH /ticket-types/{ticketTypeId}` | `event.update` | 403, 404, 409 capacity giảm dưới `sold+reserved` |

**Kiến thức SOA:** Contract-first (LG Ch2 §3.5) — code theo catalog đã chốt; Policy Contract (LG Ch2 §3.4.4) — permission `event.update` là chính sách dùng API; Loose Coupling (LG Ch2 §1.2) — quyền hỏi qua `POST /internal/authorization/check`, không đọc bảng role Identity; Composability (LG Ch2 §1.8, Ch7 §8.1) — availability là nguồn cho API Composition của Gateway; Timeout + fail-closed (LG Ch5 §2.3.1) — Identity không trả lời thì từ chối, không cho qua; Statelessness (LG Ch2 §1.6).

| ☐ | Việc | Cách làm | Bằng chứng pass/fail | Cost |
|---|---|---|---|---|
| 1.1 | `AuthorizationClient` | Gọi `POST /internal/authorization/check` với `{user_id, organization_id, resource_type:"EVENT", resource_id, permission}`; `organization_id` lấy từ `event_snapshot` của event (chưa có snapshot → 404/409 trước khi check); timeout ~3s; lỗi mạng/timeout → 502 `UPSTREAM_UNAVAILABLE` (fail-closed); gọi **trước** khi mở transaction. Identity chưa có → test bằng WireMock; tích hợp thật blocked-by-Hào | WireMock `allowed:false` → 403 FORBIDDEN; `allowed:true` → đi tiếp; WireMock chết → 502, không 500, không cho qua | 0.5 buổi |
| 1.2 | `POST /events/{id}/ticket-types` | Validate BR-FMT-10..13 (name ≤60; price string decimal ≥0; currency VND; capacity 1..100000; sales_end > sales_start); snapshot phải PUBLISHED nếu không 409; ghi `ticket_types` + `inventory`(0,0) một transaction | Thiếu `sales_end` → 400 VALIDATION_FAILED; chưa có snapshot → 409; thành công → inventory đúng capacity | 1 buổi |
| 1.3 | `GET ticket-types` + `GET availability` | Mảng thô (catalog §0); `available = capacity - sold - reserved` (BR-INV-08, không âm, không cache quá 5s); `sales_open` theo snapshot + cửa bán (BR-INV-05) | `available` khớp phép trừ từng hàng; ngoài cửa → `sales_open:false`; event không PUBLISHED → availability 409 | 1 buổi |
| 1.4 | `PATCH /ticket-types/{id}` | Capacity chỉ tăng (BR-INV-06); không UI nào gọi ở MUST → làm cuối | Giảm capacity dưới sold+reserved → 409; tăng → inventory đổi đúng | 0.5 buổi |

### Phần 2 — Giữ chỗ + outbox (trái tim service, bằng chứng tuần 3)

**Mục tiêu:** hai bất biến không được cắt — `sold + reserved <= capacity` và bấm lại không trừ chỗ hai lần.

**Chức năng xây dựng:** giữ chỗ có phí (HELD) / miễn phí (CONFIRMED một bước), sinh mã vé, idempotency theo key, hủy giữ chỗ, outbox worker.

**API cung cấp:**

| API | Quyền | Lỗi chính |
|---|---|---|
| `POST /events/{eventId}/reservations` | Đã đăng nhập | 400 `IDEMPOTENCY_KEY_REQUIRED` / thiếu `X-User-Email` → `VALIDATION_FAILED`, 409 `SOLD_OUT`, 409 `SALES_CLOSED`, 404 |
| `GET /reservations/{reservationId}` | Self | 404, 403 không phải chủ |
| `DELETE /reservations/{reservationId}` | Self | 404, 409 đã confirm |

**Kiến thức SOA:** Idempotency — LG Ch5 §2.3.2 (retry phải kèm idempotency, ví dụ `paymentId`) và Ch6 §3.2.2 (POST không idempotent tự nhiên); còn header `Idempotency-Key` + cùng key trả kết quả cũ là hợp đồng project (catalog §0, BR-INV-09), LG không nêu header này. ACID cục bộ (LG Ch5 §2.4.2) — quota + reservation + tickets + outbox trong MỘT transaction, không 2PC; Reusability (LG Ch2 §1.4) — use-case confirm dùng chung cho endpoint nội bộ và consumer; Request-Response (LG Ch3 §1.4) cho lệnh cần kết quả ngay. **Transactional Outbox** là hợp đồng project (messaging §6, BR-ASY-01) — LG không có mục riêng về outbox; nó là lời giải cho bài toán nhất quán "ghi dữ liệu + phát tin" của LG Ch7 §2 mục 3 (Data Consistency). Khóa hàng `FOR UPDATE` là kỹ thuật của project (architecture §3.3), không phải khái niệm LG.

| ☐ | Việc | Cách làm | Bằng chứng pass/fail | Cost |
|---|---|---|---|---|
| 2.1 | POST reservations — nhánh có phí | Thiếu key → 400 `IDEMPOTENCY_KEY_REQUIRED`; thiếu `X-User-Email` → 400 `VALIDATION_FAILED` (BR-RSV-06); cùng key + cùng body → trả kết quả cũ (tra trước lock); người mua chỉ cần danh tính `X-User-Id` (không gọi authorization/check — quyền "Đã đăng nhập"); BEGIN → `SELECT inventory FOR UPDATE` → quota không đủ → 409 `SOLD_OUT` fail toàn bộ (BR-INV-02); cửa bán → 409 `SALES_CLOSED`; server tự tính `total_amount = Σ price×qty` (BR-INV-04); HELD + `expires_at = now + RESERVATION_HOLD_TTL_SECONDS` (120, BR-RSV-03); ghi `recipient_email`; outbox `ReservationCreated` cùng transaction (đủ 7 field: reservation_id, event_id, organization_id từ snapshot, user_id, total_amount, currency, expires_at) | 2 lần cùng key → 1 row, reserved tăng 1 lần; 200 request đồng thời capacity 100 → đúng 100 thành công, invariant còn đúng; payload đủ field theo contracts | 2 buổi |
| 2.2 | Nhánh miễn phí + mã vé | `total_amount = 0` → CONFIRMED + `registrations` + `tickets` ngay trong transaction giữ chỗ (quyết định 2), outbox `RegistrationConfirmed` + `TicketIssued` (mang `recipient_email` từ cột đã lưu); code `LUMA-` + 4 hex hoa + `-` + 4 hex hoa, va chạm UNIQUE → sinh lại trong cùng transaction, không bao giờ 500 (BR-TCK-01) | 1 request → `tickets[].code` khớp `^LUMA-[0-9A-F]{4}-[0-9A-F]{4}$`; không có message nào gửi Payment | 1 buổi |
| 2.3 | Outbox worker | Quét `published_at IS NULL` theo `id` BIGSERIAL tăng dần; publish lên `luma.registration` với publisher confirm; header đủ messaging §5 (`message_id = event_id`, `correlation_id` từ X-Request-Id gốc, `causation_id`, `timestamp`, `type`, `delivery_mode=2`); chỉ điền `published_at` khi confirm; lần quét sau phát lại cùng `event_id` | Tắt broker rồi đặt vé → outbox ghi, chưa publish; bật lại → message lên broker cùng event_id, `published_at` điền | 1 buổi |
| 2.4 | GET + DELETE reservations | GET self-only, trả `{status, expires_at, items[], total_amount, payment_status}`; DELETE chỉ HELD → nhả reserved + outbox `ReservationReleased(CANCELLED)`; CONFIRMED → 409 (BR-TCK-05); repeat DELETE → không đổi số lần hai | DELETE HELD → reserved giảm đúng qty, RELEASED; DELETE lần 2 → 409; GET user khác → 403 | 1 buổi |

### Phần 3 — Consumer + saga + worker hết hạn

**Mục tiêu:** vòng saga khép kín bằng event; mọi consumer idempotent; chỗ hết hạn tự nhả đúng một lần.

**Chức năng xây dựng:** topology 2 queue + 2 DLQ; khung consumer chống trùng + retry; cập nhật `event_snapshot`; xử lý `EventCancelled`; confirm/release theo `PaymentSucceeded`/`PaymentFailed`; worker hết hạn.

**API cung cấp:** `POST /reservations/{id}/confirm` — endpoint nội bộ (không route qua Gateway), xây ở 3.4 cùng use-case confirm; consumer `PaymentSucceeded` gọi use-case này trong tiến trình. Còn lại là consumer + worker, không API public mới.

**Kiến thức SOA:** Choreography Saga + Compensating Transaction (LG Ch7 §5.1, Ch5 §2.4.3) — hold là giao dịch xuôi, release là giao dịch bù trừ, không coordinator trung tâm; Pub-Sub (LG Ch3 §1.4) — `EventCancelled` hai queue độc lập; One-Way (LG Ch3 §1.4) — phát `BookingCancelled` không chờ Notification; BASE/Eventual Consistency (LG Ch5 §2.4.2, Ch7 §2 mục 3) — snapshot chậm vài giây chấp nhận được, quota thì không; Retry + Idempotency phía consumer (LG Ch5 §2.3.2) — at-least-once delivery + `processed_messages`; DLQ (LG Ch7 §7.2, mục 3: retry 3 lần rồi đẩy sang hàng đợi chết); Autonomy (LG Ch2 §1.5) — không REST ngược về Event/Payment/Identity (BR-ASY-06).

| ☐ | Việc | Cách làm | Bằng chứng pass/fail | Cost |
|---|---|---|---|---|
| 3.1 | Topology | `registration.event-snapshot` bind `luma.event` → `event.published.v1`/`event.updated.v1`/`event.cancelled.v1`; `registration.saga` bind `luma.payment` → `payment.succeeded.v1`/`payment.failed.v1`; durable, prefetch 1, `x-dead-letter-exchange=luma.dead`, `x-dead-letter-routing-key=<tên queue>`; DLQ direct-bound | `rabbitmqctl list_queues`/UI 15672 thấy 2 queue + 2 DLQ, bindings đúng messaging §3 | 0.5 buổi |
| 3.2 | Khung consumer + snapshot | Kiểm `message_id` trong `processed_messages` trước; handler + ghi dấu MỘT transaction; ack sau commit; retry trong tiến trình 1s→5s→25s rồi nack(requeue=false) (BR-ASY-02/03); `EventPublished`/`EventUpdated` → upsert ghi đè field có trong payload (BR-ASY-05), `organization_id` chỉ ghi khi payload mang | Tự publish `EventPublished` đúng schema → snapshot có hàng (kèm organization_id); cùng message_id lần 2 → không ghi lặp; message hỏng → DLQ sau 3 lần | 1.5 buổi |
| 3.3 | `EventCancelled` | Cùng queue snapshot: nhả mọi HELD của event (`ReservationReleased(EVENT_CANCELLED)`), tickets → VOIDED, outbox `BookingCancelled` cho TỪNG registration (email từ `reservations.recipient_email`); idempotent theo message_id | Event 2 registration + 1 HELD → 2 ticket VOIDED, reserved về 0, outbox 2 BookingCancelled + 1 ReservationReleased | 1 buổi |
| 3.4 | Consumer saga + confirm nội bộ | Dựng use-case confirm + endpoint `POST /reservations/{id}/confirm` (nội bộ; 409 đã confirm/hết hạn, 403). `PaymentSucceeded` → gọi use-case: khóa reservation + inventory, chỉ confirm khi HELD chưa hết hạn; reserved→sold, registrations+tickets, `payment_status=SUCCEEDED`, outbox Confirmed+TicketIssued; không còn HELD → **ack + bỏ qua + log request_id** (BR-RSV-02, không 409); `PaymentFailed` → release `PAYMENT_FAILED`, `payment_status=FAILED` | Publish PaymentSucceeded cho HELD → CONFIRMED + vé; message thứ 2 khác event_id cùng reservation → không vé thứ 2; cho RELEASED → ack, quota bất biến, log có request_id | 1.5 buổi |
| 3.5 | Worker hết hạn | Quét HELD quá `expires_at` bằng `FOR UPDATE SKIP LOCKED` (BR-RSV-04); nhả đúng một lần kể cả nhiều tiến trình; outbox `ReservationReleased(EXPIRED)` | TTL=10s thử nghiệm → reserved tự về, RELEASED; 2 instance cùng quét → outbox không nhân đôi | 1 buổi |

### Phần 4 — Vé của tôi + check-in

**Mục tiêu:** khách xem được vé (kể cả vé VOIDED); organizer check-in bằng mã in trên vé, đúng quyền.

**Chức năng xây dựng:** trang vé của tôi đọc từ snapshot; bảng vé theo event (phân trang); check-in theo code.

**API cung cấp:**

| API | Quyền | Lỗi chính |
|---|---|---|
| `GET /users/me/tickets` | Self | 401 |
| `GET /events/{eventId}/tickets?status=&limit=&offset=` | `event.read` | 404, 403 |
| `POST /tickets/check-in` | `ticket.checkin` trên event sở hữu mã | 404 mã lạ, 409 `ALREADY_CHECKED_IN`, 409 `TICKET_VOIDED`, 403 |

**Kiến thức SOA:** Abstraction (LG Ch2 §1.3) — `event_title`/`event_slug`/`event_starts_at` lấy từ `event_snapshot`, trang vé không biết Event service tồn tại; OWASP BOLA (LG Ch6 §7) — không tra vé của người khác, check-in phải đúng quyền trên event sở hữu mã; REST semantics (LG Ch6 §3) — check-in là POST không idempotent, chặn lặp bằng trạng thái (`USED` → 409) chứ không thực hiện lại; Policy Contract (LG Ch2 §3.4.4) — phân trang limit/offset là quy ước dùng API (BR-FMT-17).

| ☐ | Việc | Cách làm | Bằng chứng pass/fail | Cost |
|---|---|---|---|---|
| 4.1 | `GET /users/me/tickets` | Join tickets + registrations + ticket_types + event_snapshot; mảng thô đủ 10 field catalog §3; VOIDED vẫn trả (BR-TCK-04) | Response đủ field kể cả `event_status`; không lời gọi HTTP nào sang Event | 0.5 buổi |
| 4.2 | `GET /events/{id}/tickets` | `{items, total}`; limit mặc định 20 max 100, offset ≥0, vượt biên → `items:[]` không 400; không kèm tên người mua | `?limit=200` → kẹp 100; `?offset=99999` → 200 items rỗng; item không có tên/email người mua | 0.5 buổi |
| 4.3 | `POST /tickets/check-in` | Trim + so không phân biệt hoa thường (BR-FMT-16); quyền `ticket.checkin`; ISSUED→USED + `checked_in_at`; USED → 409 message tiếng Việt chứa timestamp RFC3339 lần trước (BR-TCK-03); VOIDED → 409 `TICKET_VOIDED`; response kèm `event_id` + `event_title` (BR-TCK-02); không phát event ở MUST | Mã viết thường + khoảng trắng → 200 USED; lần 2 → 409 message dạng "…lúc 2026-…T…Z."; mã lạ → 404 | 1 buổi |

### Phần 5 — Đóng gói + nghiệm thu

**Mục tiêu:** service chạy trong compose gốc như một thành viên thật; bằng chứng tuần 3 chạy lại bằng một lệnh; sẵn sàng ghép dọc với nhóm.

**Chức năng xây dựng:** Dockerfile + build target; script tải đồng thời; tích hợp thật với 4 service bạn.

**API cung cấp:** không API mới.

**Kiến thức SOA:** Containerization (LG Ch8 §1) — image multi-stage, healthcheck, tự chạy migration; Autonomy/Independent deployment (LG Ch2 §1.5) — build/deploy riêng không đụng service khác; Discoverability (LG Ch2 §1.7) — OpenAPI cho contract freeze tuần 1; Governance (LG Ch4 §3) — sửa compose gốc là đụng hạ tầng chung, báo nhóm trước khi commit.

| ☐ | Việc | Cách làm | Bằng chứng pass/fail | Cost |
|---|---|---|---|---|
| 5.1 | Dockerfile + compose target | Multi-stage Maven → JRE 21; thêm vào compose gốc: network backend, KHÔNG publish cổng, healthcheck `/healthz`, env `registration-db:5432`/`rabbitmq:5672`; **báo nhóm trước khi sửa file gốc** | `docker compose up --build registration-service` → healthy; container khác gọi `registration-service:8080` được | 1 buổi |
| 5.2 | Script tải đồng thời | JUnit/`ExecutorService` 200 request song song trên capacity 100 + tự kiểm invariant; chạy bằng `mvn test` (hoặc một lệnh script) | In ra: 100 thành công / 100 SOLD_OUT, `sold+reserved == 100`, 0 reservation trùng key | 1 buổi |
| 5.3 | Tích hợp dọc | Bỏ WireMock → Identity thật (Hào); Event thật (Ngân) phát snapshot; Payment (Thảo) tiêu ReservationCreated; Notification (Hậu) nhận email qua Mailpit | Demo: login → publish → đặt vé có phí → poll thấy CONFIRMED → Mailpit có thư → vé ở trang 04. **Blocked-by cả 4 service bạn** (tuần 2–4 lộ trình nhóm) | 1–2 buổi |

**Tổng ước lượng: ~22 buổi** cho phần làm một mình (0.1→5.2), khớp đích tuần 3 nếu dev đều.

---

## 4. Thứ tự thực thi và phụ thuộc

**Điều kiện tiên quyết:** nhánh làm việc phải chứa commit `29a23be` (L1/L2). Nhánh `service/registration` hiện cắt từ `f2e6e1b` nên **thiếu** các sửa đổi hợp đồng đó — `git merge main` trước khi code, nếu không schema V1 và validate sẽ lệch docs trong working tree.

Thứ tự (mỗi lượt làm MỘT hàng, theo khả năng verify độc lập — hàng nào cũng có bằng chứng riêng trước khi sang hàng kế):

```
0.1 → 0.2 → 0.3 → 0.4 → 1.1 → 1.2 → 1.3 → 2.1 → 2.2 → 2.3 → 2.4
→ 3.1 → 3.2 → 3.4 → 3.5 → 3.3 → 4.1 → 4.2 → 4.3 → 1.4 → 5.1 → 5.2 → 5.3
```

- **3.4 trước 3.3**: saga verify một mình bằng message tự publish; EventCancelled cần dữ liệu nhiều registration.
- **2.3 ngay sau 2.1–2.2**: có outbox worker thì bằng chứng event mới là message thật trên broker, không chỉ là row trong bảng.
- **1.4 cuối**: PATCH ticket-types là API MUST nhưng không màn hình nào gọi.
- Phụ thuộc ngoài: 1.1 cần WireMock trước, Identity thật sau (Hào, tuần 2); 3.2/3.3 cần message đúng schema — tự publish để test, Event thật của Ngân sau; 5.3 cần cả nhóm.
- Không mở STRETCH khi MUST chưa có bằng chứng (architecture §3.0).

## 5. Việc mở — phải hỏi nhóm, không tự quyết trong code

| # | Việc | Ảnh hưởng |
|---|---|---|
| M1 | `registrations.status` để TEXT, chưa chốt enum (architecture §3.3) | Tạm dùng `CONFIRMED`/`CANCELLED` trong code, ghi chú chờ nhóm; không tự thêm giá trị lạ vào response (business-rules §2) |
| M2 | messaging §13.3: đường DLQ (`luma.dead` direct + routing key = tên queue) chờ cả nhóm gật | 3.1 khai báo theo đúng bản nháp hiện tại; nhóm đổi thì sửa |
| M3 | messaging §13.4: khoảng tiền-thua-hụt (reservation release trước expires_at khi PaymentSucceeded đã phát) chưa có cơ chế tự hoàn | MUST: ack + bỏ qua + log (BR-RSV-02); queue `payment.refund` là đổi topology, chỉ làm khi nhóm duyệt |
| M4 | catalog + messaging vẫn "bản nháp chờ approve" (catalog §8, messaging §13) | Kế hoạch này chạy trên bản hiện tại + commit `29a23be`; freeze xong nếu đổi tên/field thì sửa theo PR được duyệt |

## 6. Tiêu chí nghiệm thu của riêng service (trích architecture §7, đối chiếu được)

- [ ] 200 request đồng thời capacity 100: không vượt quota, không nhân đôi reservation; `sold + reserved <= capacity` đúng sau chạy (BR-INV-01/02/09).
- [ ] Vé miễn phí: một request duy nhất ra vé, Payment không xuất hiện (BR-INV-07).
- [ ] Vé có phí: chỉ `PaymentSucceeded` confirm; UI không có đường confirm khác (BR-RSV-01).
- [ ] Worker nhả hết hạn đúng một lần kể cả 2 tiến trình (BR-RSV-04).
- [ ] Consumer idempotent theo `message_id`; retry 1s→5s→25s rồi DLQ, không `requeue=true` (BR-ASY-02/03).
- [ ] Outbox ghi cùng transaction nghiệp vụ; publish sau commit có confirm (BR-ASY-01).
- [ ] Không REST ngược chiều: không gọi Event/Payment/Identity để lấy dữ liệu nghiệp vụ (authorization/check là điểm chốt quyền được thiết kế riêng, không phải đọc dữ liệu) (BR-ASY-06).
- [ ] Không FK chéo; migration chỉ của `registration_db`.
- [ ] Check-in đúng quyền `ticket.checkin`, mã tra không phân biệt hoa thường, 409 đúng message (BR-TCK-01..03, BR-FMT-16).