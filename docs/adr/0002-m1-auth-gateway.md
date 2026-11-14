# ADR 0002 — M1 Auth/Gateway

Ngày: 13/11/2026. Trạng thái: ACCEPTED cho M1, nguồn: người dùng xác nhận “chốt các đề xuất đã được đưa ra tiếp tục công việc” sau báo cáo P0.

Giữ D00/D04; chấp nhận các lựa chọn D01/D02/D03/D07-M1/D13, DTO và UserRegistered trong REPORT_M1_P0_CONTRACT_01. Không mở rộng quyết định M2–M4. Node 24, npm workspaces với từng app build/container độc lập, NestJS 11.2.10, Prisma/client/pg-adapter 7.10.1, Argon2 0.45.2; pin lockfile. Không chọn dist-tag Prisma latest vì metadata hiện trả bản RC 8 trong khi client stable 7.10.1. NestJS 11 dùng TypeScript 5.9/CommonJS; Prisma adapter PostgreSQL theo hướng dẫn v7.

Provider: Identity; consumer trực tiếp: Gateway, Swagger/API client. Người dùng là người xác nhận contract M1 trong phiên này; chưa gán reviewer hoặc cam kết tích hợp frontend/service M4. HTTP canonical artifact: shared/contracts/http/identity.openapi.json; Gateway OpenAPI là projection có kiểm tra của artifact này. Consumer types được generate từ artifact. Event canonical artifact: shared/contracts/events/user-registered.v1.schema.json. Mọi lỗi dùng envelope catalog. Không đổi field/status âm thầm; breaking change phải review/version contract trước implementation.

JWT HS256: Identity ký, Gateway verify chữ ký/issuer/audience/exp và claims sub/sid/jti UUID, iat/exp integer; access 900 giây. Secret môi trường ít nhất 32 byte, không dùng placeholder. Gateway tự gán context user/session, không tin header client. Chỉ local network trust, Identity/DB không publish host port; Gateway không route internal. Request ID nhận duy nhất UUID hợp lệ hoặc tạo mới.

Refresh 32 byte ngẫu nhiên base64url, SHA-256 hash-only; mỗi login một session. Rotation giữ sid/hạn 7 ngày tuyệt đối, một winner khi race. Logout access + refresh hiện hành phải cùng user/sid; retry revoked đúng cặp khi refresh còn hạn/access hợp lệ trả 200 và giữ revoked_at lần đầu. Giữ record/hash tới ít nhất expires_at + 15 phút, không cleanup ở M1. Access chưa bị revoke tức thời. Token cũ đã rotation trả 401.

Auth POST success 200; không yêu cầu Idempotency-Key cho register/login/refresh/logout. Email unique, login phiên mới, rotation nguyên tử và logout retry thay thế idempotency cache. LOCKED với credential hợp lệ trả 403 tại Identity login/refresh/profile. Liveness không phụ thuộc DB, readiness DB down trả 503. Upstream unavailable 502, timeout 504, không tự retry mutation.

Schema M1 tám bảng nền + outbox; CITEXT email, UUID/FK nội bộ, CHECK scope/expiry và NULLS NOT DISTINCT theo F07. DDL tách seed; seed local lặp an toàn không reset dữ liệu, không event. UserRegistered v1 ghi cùng transaction user, không credentials, worker M3. Argon2id 19456 KiB/2/1 là cấu hình đo baseline, chưa có SLA để kết luận hiệu năng.

Nguồn kỹ thuật: https://docs.nestjs.com/faq/versions và https://www.prisma.io/docs/orm/v7 . Compatibility phải được chứng minh thêm bằng build/test/container thực tế; ACCEPTED không đồng nghĩa PASS.
