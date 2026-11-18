# Báo cáo Phần 0 — Nền móng registration-service

Ngày: **2026-11-18** (cập nhật lần 2 cùng ngày: đóng bằng chứng runtime 0.2/0.4 sau khi bạn cài Docker; định nghĩa mã lỗi M5 theo yêu cầu).
Nhánh: `service/registration` (đã fast-forward `f2e6e1b` → `29a23be`, merge `main` theo điều kiện tiên quyết của [plan.md](plan.md) §4).
Phạm vi: các bước 0.1–0.4 của plan.md — **cả bốn bước đã có bằng chứng chạy thật**. Chưa commit/push — chờ yêu cầu.

## 1. Việc đã làm

### 0.1 — Toolchain + skeleton + cấu trúc

| Hạng mục | Kết quả |
|---|---|
| Toolchain thực tế | `java 25.0.1` (Oracle, `D:\Java`) + `Maven 3.9.11`. **Lệch plan** (plan ghi Java 21 Temurin): xử lý bằng `maven.compiler.release=21` (bytecode target 21) chạy trên JDK 25; Docker image ở bước 5.1 sẽ dùng Temurin 21 như plan |
| Spring Boot | **3.5.16** — bản 3.5.x mới nhất trên Maven Central tại thời điểm làm (kiểm tra bằng `maven-metadata.xml`) |
| Cấu trúc package | **Capability** — bạn chốt qua câu hỏi 0.1: `com.luma.registration.{common, ticketing, reservation, saga, snapshot, outbox}`. Hiện mới có `common` + `common/web`; các package khác tạo khi tới phần tương ứng |
| [pom.xml](pom.xml) | parent Boot 3.5.16; deps: web, jdbc, amqp, validation, flyway-core + flyway-database-postgresql, postgresql (runtime), starter-test (test); plugin Boot với `-Xmx256m` |
| [RegistrationServiceApplication.java](src/main/java/com/luma/registration/RegistrationServiceApplication.java) | `@SpringBootApplication`, entry point |
| [application.yml](src/main/resources/application.yml) | port 8080; datasource `registration_db` qua env `DB_HOST/DB_PORT/DB_NAME/POSTGRES_USER/POSTGRES_PASSWORD`; Hikari **pool 10** (chủ ý, plan §1); Flyway `classpath:db/migration`; RabbitMQ qua env; Jackson `SNAKE_CASE`; `app.reservation.hold-ttl-seconds` từ `RESERVATION_HOLD_TTL_SECONDS` (default 120); log pattern kèm `%X{request_id}` |
| [.gitignore](.gitignore) | `target/`, IDE files (`.gitignore` gốc chỉ cover frontend) |
| [src/README.md](src/README.md) | Viết lại theo capability; **gộp nguyên nội dung** 7 README scaffolding cũ (nguyên tắc layer, đoạn messaging contract, quy tắc migration không FK chéo, dòng tests) — không mất chữ nào |

Giá trị default trong `application.yml` (`lumasoa`/`local_dev_only`, `luma`/`local_dev_only`) mirror đúng default công khai của `docker-compose.yml`; **không đọc `.env`** (máy hiện chưa có file `.env`, compose chạy bằng default). Chạy thật có `.env` thì truyền env từ đó.

### 0.2 — Compose override dev ✅ đã verify

- Tạo [docker-compose.dev.yml](../../docker-compose.dev.yml) ở gốc: publish `5432` của `registration-db` và `5672` của `rabbitmq` ra host. **Không sửa compose gốc.**
- **Đã chạy thật (2026-11-18)**: `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait registration-db rabbitmq` → cả hai container **Healthy**; `compose ps` xác nhận `5432/tcp -> 0.0.0.0:5432` và `5672/tcp -> 0.0.0.0:5672` (15672 giữ nguyên từ compose gốc).
- Ghi chú môi trường: Docker Desktop cài **per-user** tại `C:\Users\minhp\AppData\Local\Programs\DockerDesktop`; các phiên shell mở trước khi cài chưa thấy `docker` trong PATH → mình gọi bằng đường dẫn đầy đủ `resources/bin/docker.exe` và khởi động engine qua `Start-Process`. **Terminal mở mới sẽ có PATH bình thường.** Engine Docker **29.9.3**, Compose **v5.7.0**.

### 0.3 — `/healthz` + error envelope + request-id ✅ đã verify

| File | Vai trò |
|---|---|
| [RequestIdFilter.java](src/main/java/com/luma/registration/common/web/RequestIdFilter.java) | Nhận `X-Request-Id` (sinh UUID nếu thiếu/rỗng), đưa vào MDC `request_id`, ghi lại header response; chạy đầu tiên (`HIGHEST_PRECEDENCE`) |
| [ErrorEnvelope.java](src/main/java/com/luma/registration/common/web/ErrorEnvelope.java) | Record đúng shape catalog §0: `{"error":{"code","message","request_id"}}` |
| [ApiException.java](src/main/java/com/luma/registration/common/web/ApiException.java) | Lỗi nghiệp vụ mang `HttpStatus` + `code` (dùng từ Phần 1 trở đi) |
| [GlobalExceptionHandler.java](src/main/java/com/luma/registration/common/web/GlobalExceptionHandler.java) | `ApiException` → đúng status/code; validation family (`MethodArgumentNotValid`, `HttpMessageNotReadable`, `MissingRequestHeader`, `MissingServletRequestParameter`, `MethodArgumentTypeMismatch`) → 400 `VALIDATION_FAILED`; `NoResourceFound`/`NoHandlerFound` → 404 `NOT_FOUND`; còn lại → log + 500 `INTERNAL_ERROR` (định nghĩa ở §3.1); mọi envelope lấy `request_id` từ MDC |
| [HealthController.java](src/main/java/com/luma/registration/common/web/HealthController.java) | `GET /healthz` → `{"status":"ok"}`, không lộ cấu hình |

### 0.4 — Migration V1 (9 bảng) ✅ đã execute

[V1__init_registration_schema.sql](src/main/resources/db/migration/V1__init_registration_schema.sql) — đúng architecture §3.3 bản `main` (đã gồm `reservations.recipient_email` và `event_snapshot.organization_id`):

- 9 bảng: `ticket_types`, `inventory`, `reservations`, `reservation_items`, `registrations`, `tickets`, `event_snapshot`, `outbox_events` (`BIGSERIAL`), `processed_messages`.
- `CHECK (sold >= 0 AND reserved >= 0 AND sold + reserved <= capacity)` trên `inventory` (BR-INV-01).
- UNIQUE: `reservations.idempotency_key`, `tickets.code`.
- CHECK enum khóa: `reservations.status`, `tickets.status`, `ticket_types.status`, `payment_status`; CHECK theo BR-FMT: `capacity 1..100000`, `quantity 1..10`, `price/unit_price >= 0`, `sales_end > sales_start`.
- `registrations.status` **chưa CHECK** — enum chưa chốt với nhóm (plan M1), có comment trong SQL.
- FK nội bộ cùng DB (items→reservations, tickets→registrations…); **không FK chéo** `event_id`/`user_id`/`organization_id`.
- Index: `idx_reservations_held` (partial, worker hết hạn 3.5), `idx_outbox_unpublished` (partial, worker outbox 2.3), các index tra cứu theo khóa cha.
- **Đã execute thật**: Flyway chạy lúc app khởi động — log `Successfully applied 1 migration to schema "public", now at version v1 (00:00.128s)`; bảng `flyway_schema_history` có đúng 1 row `version=1, success=t`; `\dt` liệt kê đủ 9 bảng nghiệp vụ + `flyway_schema_history`.
- **CHECK quota đã thử bằng lệnh thật**: insert mẫu `capacity=10` rồi `UPDATE inventory SET reserved = 11` → `ERROR: new row for relation "inventory" violates check constraint "inventory_check"` (SQLSTATE **23514**). Dữ liệu mẫu đã xóa sạch sau test (`inventory_rows = 0`) — dev DB chỉ còn schema.

## 2. Bằng chứng đã xác minh

| Bằng chứng | Kết quả |
|---|---|
| `git merge --ff-only main` | Fast-forward `f2e6e1b..29a23be`, 6 files hợp đồng cập nhật, working tree sạch trước merge |
| `mvn -B test` | **BUILD SUCCESS**, `Tests run: 5, Failures: 0, Errors: 0, Skipped: 0`, 48.8s, Boot 3.5.16 trên Java 25.0.1 |
| `HealthControllerTest.healthzTra200VaGiuNguyenRequestId` | `/healthz` → 200 `{"status":"ok"}`, response giữ nguyên `X-Request-Id: req-test-1` |
| `HealthControllerTest.routeLaTra404DungEnvelope` | GET route lạ → 404, `error.code=NOT_FOUND`, `error.request_id=req-test-2` đúng header gửi vào |
| `HealthControllerTest.thieuHeaderThiSinhRequestIdUuid` | Không gửi header → response có `X-Request-Id` parse được thành UUID |
| `GlobalExceptionHandlerTest.apiExceptionGiuDungStatusCodeVaRequestId` | `ApiException(409, SOLD_OUT)` → envelope đúng code/message/request_id từ MDC |
| `GlobalExceptionHandlerTest.loiKhongRoiVao500InternalError` | Exception lạ → 500 `INTERNAL_ERROR` + log (stacktrace "boom" trong output build là log chủ đích của test này, không phải lỗi) |
| `compose up -d --wait` (dev override) | `registration-db` + `rabbitmq` **Healthy**; ports 5432/5672 publish đúng ra host |
| `mvn spring-boot:run` (app thật, DB + broker compose) | `Started RegistrationServiceApplication in 3.891 seconds`; Tomcat port 8080; Flyway applied v1 thành công |
| `curl -i localhost:8080/healthz` | **HTTP 200**, body `{"status":"ok"}`, header `X-Request-Id: a57ea27f-…` (UUID tự sinh) |
| `curl -i localhost:8080/khong-ton-tai -H "X-Request-Id: demo-1"` | **HTTP 404**, body đúng envelope: `{"error":{"code":"NOT_FOUND","message":"Không tìm thấy tài nguyên.","request_id":"demo-1"}}` |
| `psql \dt` trong container | 9 bảng nghiệp vụ + `flyway_schema_history`; history: `1 \| init registration schema \| t` |
| `UPDATE inventory SET reserved = 11` (capacity 10) | `ERROR … violates check constraint "inventory_check"` (**23514**) — quota không thể vượt capacity ngay ở tầng DB; rows mẫu đã dọn sau test |

App đã **dừng** sau khi verify (giải phóng RAM); hai container `registration-db` + `rabbitmq` **vẫn chạy healthy** cho các bước sau. Tắt hạ tầng khi nghỉ: `docker compose -f docker-compose.yml -f docker-compose.dev.yml down` (thêm `-v` nếu muốn xóa cả volume — sẽ mất schema, Flyway tạo lại từ đầu).

## 3. Quyết định mới

| # | Việc | Trạng thái |
|---|---|---|
| M5 | Mã lỗi 500 — **đã định nghĩa xong** (bạn giao ở lượt này): `INTERNAL_ERROR`, chi tiết §3.1 | Code + test đã dùng; proposal thêm vào catalog §0 **chờ nhóm approve** — chưa tự sửa catalog vì là hợp đồng chung |
| — | Java 25 thay vì 21 như plan | Đã xử lý bằng `--release 21`; không cần cài lại JDK. Image Docker (5.1) vẫn Temurin 21 |
| — | Warning Mockito self-attach trên JDK 25 ("sẽ không work ở JDK tương lai") | Chưa xử lý, không chặn; khi nào cần mock nặng sẽ cấu hình mockito-agent |
| M1–M4 | Như plan §5 (enum registrations, duyệt DLQ, refund gap, freeze) | Không đổi |

### 3.1 M5 — Định nghĩa mã lỗi 500: `INTERNAL_ERROR`

- **Mã**: `INTERNAL_ERROR` — HTTP **500**. Đặt theo đúng phong cách mã sẵn có của catalog §0 (SCREAMING_SNAKE_CASE, chỉ loại lỗi, không lộ nguyên nhân nội bộ).
- **Khi nào dùng**: mọi exception không rơi vào nhánh đã định nghĩa (`ApiException`, validation family, 404). Tức lỗi không mong muốn của **chính Registration**: bug, NPE, DB chết giữa transaction…
- **Message**: câu tiếng Việt chung, không stacktrace/SQL/tên bảng: `"Lỗi hệ thống, thử lại sau."` Chi tiết thật chỉ nằm ở log server kèm `request_id` (MDC) để truy vết — đúng Service Abstraction (LG Ch2 §1.3) và không tiết lộ thông tin nhạy cảm qua response lỗi (LG Ch6 §7).
- **`request_id`**: luôn có trong envelope, lấy từ MDC; vận hành dùng nó grep log ra đúng request hỏng.
- **Phân biệt với `UPSTREAM_UNAVAILABLE` 502**: 502 = lỗi khi gọi service khác (Identity timeout, Phần 1.1); 500 = lỗi nội tại của Registration. Không dùng lẫn hai mã này.
- **Proposal cho catalog §0** (dán vào cột "Mã lỗi dùng chung" khi nhóm approve):
  > `INTERNAL_ERROR` 500 — lỗi không mong muốn của chính service; message chung tiếng Việt, chi tiết ở log kèm `request_id`. Khác `UPSTREAM_UNAVAILABLE` 502 (lỗi gọi service thượng nguồn).
- **Đã enforce trong code**: `GlobalExceptionHandler.handleUnexpected` → 500 `INTERNAL_ERROR`; test `loiKhongRoiVao500InternalError` pass.

## 4. Còn tồn

2. **7 thư mục scaffolding cũ chưa xóa được** (lệnh `rm` bị permission classifier chặn, không retry): `src/api`, `src/application`, `src/domain`, `src/infrastructure`, `src/messaging`, `tests/`, `migrations/`. Nội dung đã gộp hết vào `src/README.md` mới. Tự chạy khi muốn dọn:
   ```bash
   rm -rf services/registration-service/src/{api,application,domain,infrastructure,messaging} services/registration-service/tests services/registration-service/migrations
   ```
3. **Chưa commit/push** bất cứ gì (plan.md, code, report, compose override, README rewrite, merge ff)

## 5. Chạy lại từ đầu + bước kế tiếp

```bash
# Terminal mở MỚI sau khi cài Docker sẽ có docker trong PATH.
# Shell cũ chưa thấy thì gọi: /c/Users/minhp/AppData/Local/Programs/DockerDesktop/resources/bin/docker.exe
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait registration-db rabbitmq
cd services/registration-service
mvn spring-boot:run        # -Xmx256m đã cấu hình trong pom; Flyway tự chạy migration
curl -i localhost:8080/healthz
```

- Hạ tầng hiện **đang chạy sẵn** (registration-db + rabbitmq healthy), app đã dừng — bước sau chỉ cần `mvn spring-boot:run` lại.
- Bước kế tiếp theo plan: **1.1 `AuthorizationClient`** (WireMock giả Identity, timeout ~3s, fail-closed 502 `UPSTREAM_UNAVAILABLE`) — thêm dep WireMock khi tới bước đó.