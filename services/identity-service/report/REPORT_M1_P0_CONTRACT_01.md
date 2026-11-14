# M1 / P0 — Rà soát hiện trạng và quyết định contract

## Cập nhật sau xác nhận người dùng

13/11/2026: người dùng xác nhận “chốt các đề xuất đã được đưa ra tiếp tục công việc”. Các đề xuất M1 bên dưới đã ACCEPTED theo [ADR 0002](../../../docs/adr/0002-m1-auth-gateway.md); phần còn lại của báo cáo giữ lịch sử trước xác nhận. Không mở rộng ACCEPTED sang M2–M4.

P0 contract **PASS trong phạm vi validation tĩnh**: `npm test -- --testPathPatterns=p0-contract` RED 2 failed do thiếu OpenAPI/schema; sau tạo artifact cùng lệnh GREEN 2 passed. `npm run generate:contracts` thành công; `npm run contracts:check` PASS OpenAPI, chỉ local refs và Gateway projection. Consumer types tại shared/contracts/http/generated/identity.d.ts. Provider response verification sẽ chạy cùng endpoint P2–P4, không tính PASS runtime từ P0.

Cập nhật bàn giao: OpenAPI Identity v1.0.0 mô tả đúng context header nội bộ bắt buộc cho logout/profile; Gateway projection thay bằng Bearer security và không cho client khai user/session. Test bổ sung RED 1 failed do Identity spec còn Bearer security, GREEN 2 passed sau đồng bộ artifact/generate types. Không đổi mô hình verify đã chốt. `scripts/contract-projection.cjs` sinh Gateway contract; check-contracts kiểm projection toàn bộ và cấm remote/path refs. Provider HTTP success/error đã kiểm qua P2–P4 với cùng schemas; final suite 42 passed. Các tài liệu handoff/catalog/architecture đã đồng bộ phần M1; consumer M4 chưa được nghiệm thu.

Bộ version đã pin: Node host/container 24.19.0, NestJS 11.2.10, Prisma/client/adapter-pg 7.10.1, Argon2 0.45.2, TypeScript 5.9.3, Jest 30.5.2, ts-jest 29.4.15, npm 11.17.0. Detector ECC chọn npm từ package.json. Không checkpoint commit theo yêu cầu người dùng; RED/GREEN lưu tại report. Catalog/kiến trúc/event README đã bổ sung contract M1; các phần M2–M4 không tự freeze.

## Lịch sử rà soát trước xác nhận

Ngày: 13/11/2026 (Asia/Saigon). Trạng thái: **IN PROGRESS — chờ xác nhận quyết định M1**. Chưa freeze contract; kiểm thử runtime **NOT RUN**.

## Nguồn và hiện trạng

- Kế hoạch sử dụng: [MASTER_PLAN.md](../MASTER_PLAN.md), revision 2. Không lập lại kế hoạch tổng thể.
- Đã đối chiếu [review F01–F14](REVIEW_MASTER_PLAN01.md), [handoff D00–D13](../../../docs/integration/identity-handoff.md), [catalog](../../../docs/api/catalog.md), [kiến trúc](../../../docs/architecture.md) và [event contracts](../../../shared/contracts/events/README.md).
- `git rev-parse HEAD`: `cf58fa39aeef45be0e6085c51d23cc9fc8b4ee37`. Phạm vi rà soát là working tree, không chỉ commit này.
- Trước khi sửa đã có thay đổi tại `docs/README.md`, Identity README, event README; handoff, kế hoạch và thư mục report chưa được track. Giữ nguyên các thay đổi có sẵn.
- Identity/Gateway chỉ có scaffold tài liệu; chưa có backend package, Dockerfile, migration thực thi, OpenAPI/JSON Schema hoặc test runner. Package/lock frontend không phải dependency backend.
- `rg --files -g AGENTS.md` chỉ tìm thấy `frontend/AGENTS.md`; không sửa frontend trong M1.
- `MASTER_PLANT.md` được một số tài liệu liên kết nhưng không tồn tại (`Test-Path` trả `False`). Dùng `MASTER_PLAN.md` theo yêu cầu hiện tại; không tạo kế hoạch trùng.
- Compose hiện có năm PostgreSQL và RabbitMQ, chưa có ứng dụng Identity/Gateway. Identity DB chưa publish port. Chưa kiểm chứng network runtime.

## Bằng chứng công cụ

| Lệnh đã chạy | Kết quả thực tế | Giới hạn |
|---|---|---|
| `node --version` | `v24.19.0` | Chỉ runtime host |
| `npm --version` | `11.17.0` | Chưa cài dependency backend |
| `docker --version` | `29.9.3`, build `5457199` | Chưa kiểm Docker daemon/build/container |
| `docker compose version` | `v5.7.0` | Chưa chạy Compose |
| `git status --short` / tìm file | Quan sát hiện trạng nêu trên | Kiểm tra tĩnh, không phải PASS chức năng |

## Quyết định giữ nguyên

Giữ D00: TypeScript/NestJS, PostgreSQL riêng, HS256 Identity ký/Gateway verify, Argon2id, access 900 giây, refresh 7 ngày, nhiều thiết bị, logout phiên hiện tại. Giữ D04 theo yêu cầu hiện tại và §2.1 kế hoạch: register ghi user + UserRegistered trong cùng transaction từ M1; worker RabbitMQ M3; seed demo không phát event. Không hỏi lại các lựa chọn này.

## Các điểm cần người dùng xác nhận trước phần phụ thuộc

Các lựa chọn dưới đây là **đề xuất để xác nhận**, chưa được đánh ACCEPTED. Sổ quyết định chính thức vẫn là handoff; bảng này chỉ là nội dung đề nghị review cho M1.

| Decision | Lựa chọn cụ thể đề nghị | Phần đang chờ |
|---|---|---|
| D01 | Dùng Prisma và npm; Node 24 cho container; chọn phiên bản NestJS/Prisma/Argon2 tương thích bằng metadata/tài liệu chính thức, pin phiên bản chính xác và lockfile trước scaffold. Dùng Jest + Supertest cho test HTTP/service, DB PostgreSQL thật cho transaction/constraint/race. Chưa có bộ version backend được kiểm chứng. | Scaffold, migration, RED/GREEN |
| D02 | Local giữ network trust: Gateway verify HS256, issuer/audience, expiry và claims `sub,sid,iss,aud,iat,exp,jti`; `sub/sid/jti` UUID. Forward header theo allowlist; bỏ context client không phân biệt case, public auth cũng không forward context. Từ chối Authorization trùng. Tự tạo đúng một `X-User-Id`/`X-Session-Id` từ JWT đã verify. Request ID chỉ nhận một UUID hợp lệ, còn lại tạo UUID mới. Identity không tự verify JWT, không expose host port. | Contract context/JWT/logout |
| D03 | Bốn auth POST success 200; login/refresh trả `expires_in:900`; credential sai/hết hạn 401; credential hợp lệ nhưng user LOCKED: login/refresh/users-me 403. Ngoại lệ Idempotency-Key cho bốn auth POST: register dùng email unique, login tạo phiên mới, refresh rotation nguyên tử, logout retry theo cùng phiên. Giữ error envelope catalog; lỗi upstream 502 UPSTREAM_UNAVAILABLE, timeout 504 UPSTREAM_TIMEOUT. `/healthz` cho process, `/readyz` kiểm DB và trả 503 khi DB down; cấu hình không hợp lệ dừng startup. | OpenAPI/catalog và handler |
| D03 — retention/logout | Refresh ngẫu nhiên 32 byte, DB chỉ lưu SHA-256; rotation giữ sid và hạn tuyệt đối 7 ngày từ login. Logout chỉ chấp nhận access + refresh hiện hành của đúng user/sid; mismatch 401 và không mutate. Retry cùng cặp đã revoke trả OK khi access còn hạn và refresh chưa hết hạn; giữ row/hash ít nhất tới `expires_at + 15 phút`, chưa tự cleanup ở M1. Refresh cũ đã rotation luôn 401. Logout không thu hồi access JWT tức thời. | Session schema và test clock/race/retry |
| D07 — chỉ M1 | Theo §6.1/F07: CITEXT email unique, app trim email; tám bảng nền + outbox; UUID/FK nội bộ, TIMESTAMPTZ và check expiry; ORG resource_id NULL, EVENT UUID; SQL tùy chỉnh cho CHECK và UNIQUE NULLS NOT DISTINCT. Tách seed khỏi DDL; seed local hai org, bốn role/mười permission, fixture EVENT được ghi rõ. Không reset dữ liệu sẵn có để chạy migration. | Migration/seed |
| D13 | Dùng 19456 KiB / iterations 2 / parallelism 1 làm cấu hình thử Argon2id; đo container p50/p95, concurrency và lỗi trước khi chốt baseline. Chưa có SLA và không tuyên bố cấu hình đã đạt hiệu năng. | Hash runtime và baseline |

UserRegistered: giữ payload đã mô tả trong event README (`user_id,email,display_name`) và envelope chung. Đề nghị schema v1 dùng `event_type=UserRegistered`, `aggregate_type=user`, `aggregate_id=payload.user_id`, `producer=identity-service`, UUID và RFC3339 UTC; cấm credential/field ngoài schema; event ID/thời điểm/payload được lưu một lần trong transaction. Chỉ freeze sau xác nhận và có JSON Schema/fixture/test máy kiểm được.

Các chi tiết DTO còn cần thể hiện khi tạo artifact: email tối đa 254 ký tự; password 8–128 ký tự, không trim; display_name trim 1–100 ký tự; từ chối field thừa. Đây cũng là đề xuất, chưa áp dụng thành hành vi API.

Không kéo D05/D06/D08/D09/D10/D11/D12 hoặc phần khóa/invitation của D07 vào M1; chúng giữ mốc phụ thuộc M2–M4 theo kế hoạch.

## Chênh lệch contract phải xử lý sau xác nhận

- Catalog thiếu `X-Session-Id`, policy header giả/trùng và JWT claims chi tiết.
- Quy tắc Idempotency-Key chung chưa có ngoại lệ auth; logout mới chỉ ghi X-User-Id.
- Chưa có success status chính xác, LOCKED refresh/profile, timeout 504, readiness và retention logout retry.
- Kiến trúc chưa có bảng outbox Identity từ M1; event README mới có prose, chưa có schema UserRegistered thực thi.
- `.env.example` đang có JWT placeholder yếu: phải thay cách hướng dẫn tạo secret/validation; không dùng placeholder làm secret chạy.
- H01/H04/H05 chưa có reviewer/bên nhận xác nhận. Không tự ghi FROZEN hay giả tên người review; người dùng cần xác nhận phạm vi review M1.

## Contract-first và TDD

Đầu ra tiếp theo sau xác nhận: OpenAPI Identity/Gateway theo đường dẫn dự kiến trong handoff; JSON Schema UserRegistered tại shared/contracts/events; types/fixtures derive từ artifact và test response provider cùng contract. Chưa tạo artifact để tránh tự nâng proposal thành contract đã duyệt.

P0 → test contract/schema; P1 → config/health/DDL/seed; P2 → register/login/outbox; P3 → JWT/header/profile; P4 → refresh/logout/race/expiry. Chỉ ghi RED khi test thực sự chạy và thất bại vì hành vi cần triển khai; chỉ sửa code tương ứng sau RED, chỉ chuyển bước sau GREEN/gate. Chưa có RED/GREEN nào.

Áp dụng cả năm skill được yêu cầu. Quy tắc checkpoint commit trong tdd-workflow được thay bằng evidence trong report vì người dùng yêu cầu **không tự commit**. Chỉ dùng lệnh validation đã kiểm tra theo package/scripts thực tế; không thực thi nguyên lệnh từ kế hoạch.

Nguồn kiểm tra tương thích sơ bộ: [NestJS migration guide](https://docs.nestjs.com/migration-guide), [Prisma system requirements](https://docs.prisma.io/docs/orm/reference/system-requirements). Tài liệu hiện hành không thay kiểm chứng bộ version cụ thể trên host/container.

## Kết quả lịch sử tại thời điểm trước xác nhận

P0 chưa hoàn tất. Build/typecheck/lint/coverage, schema validator, migration/seed, HTTP/Gateway E2E, benchmark Argon2 và security runtime: **NOT RUN**. Chưa khởi động ứng dụng, chưa cài dependency, chưa sửa source/Compose/catalog và chưa commit. Chờ xác nhận các đề xuất trực tiếp M1 theo yêu cầu người dùng trước khi tiếp tục phần phụ thuộc.
