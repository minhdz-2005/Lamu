# Identity & Organization Service

Sở hữu user, tổ chức, membership, role, permission, phiên đăng nhập và authorization check. Database: `identity_db`.

M1 đã có backend NestJS/Prisma và Gateway. Phạm vi: register/login, JWT/profile, refresh/logout, UserRegistered outbox nguyên tử. Organization/RBAC API M2, worker RabbitMQ M3 và frontend/Event thật M4 chưa triển khai trong M1. Xem [báo cáo tổng](report/REPORT_M1_AUTH_GATEWAY_01.md) để phân biệt kiểm thử tự động với phần NOT RUN.

## Chạy local

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

## Giới hạn session và môi trường

Access HS256 15 phút; refresh opaque 32 byte/hash-only, 7 ngày tuyệt đối. Rotation một winner, giữ sid/hạn; token cũ 401. Logout chỉ revoke đúng phiên, mismatch access/refresh 401; retry đúng refresh hiện hành đã revoke khi còn hạn trả OK và không đổi revoked_at. Giữ record ít nhất expires_at + 15 phút, M1 chưa cleanup. Access đã cấp có thể còn hiệu lực tới exp sau logout; không có logout-all hoặc revoke access tức thời. Nếu access hết hạn, refresh trước rồi logout bằng cặp mới.

Identity không tự verify JWT; chỉ Gateway xác thực rồi cấp context header. Network trust này chỉ được chốt cho local. Frontend chưa đổi; backend M1 trả bearer/refresh trong JSON theo contract API client, chưa triển khai cookie/session browser M4. LOCKED được kiểm tại Identity login/refresh/profile, chưa cam kết hiệu lực trên các service M4. PostgreSQL port không publish ở Compose; test DB chỉ mở loopback tạm thời. Dừng local bằng `docker compose --profile m1 stop gateway identity-service identity-db`; `down` giữ volume. Không dùng `down -v` với project demo có dữ liệu cần giữ.

Theo dõi bàn giao cho các service khác tại [Identity/Gateway handoff](../../docs/integration/identity-handoff.md): cập nhật người phụ trách/người nhận, tiến độ từng đầu ra, contract version và bằng chứng tích hợp. Phạm vi triển khai ở [MASTER_PLAN.md](MASTER_PLAN.md); đề xuất rà soát ở [REVIEW_MASTER_PLAN01.md](report/REVIEW_MASTER_PLAN01.md). Bảng handoff không thay thế API/event contract hoặc báo cáo nghiệm thu.

