# M1 / P2 — Register/login và outbox

Ngày: 13/11/2026 (Asia/Saigon). Implementation: **IMPLEMENTED trong working tree**. Verification: **PASS trong phạm vi dưới đây**.

Nguồn contract: [P0](REPORT_M1_P0_CONTRACT_01.md), ADR 0002. P1 gate đã PASS trước P2. AuthModule/controller DTO class-validator, AuthService sở hữu transaction. Password Argon2id; email normalize/DB unique; login ký HS256 và tạo session hash-only 7 ngày; Gateway route allowlist public không forward context client. Không broker/worker M1.

TDD target: `tests/p2-auth.spec.ts`. Lệnh: `node scripts/test-db.cjs --migrate --testPathPatterns=p2-auth`.

- RED hợp lệ: 6 failed; HTTP expected 200/400/500, actual 404 vì route chưa có. Lần chạy trước đó có lỗi type trong chính test serialization, đã sửa và chạy lại RED; không tính lỗi test setup này làm bằng chứng RED.
- GREEN: cùng lệnh 6 passed, PostgreSQL thật trong container test riêng, Identity/Gateway là app NestJS thật giao tiếp HTTP nội bộ. `npm run build` exit 0. Trong quá trình triển khai có lỗi literal type Argon2 options, đã sửa trước GREEN; không tính là lỗi startup.

Guarantees: register/login qua cả hai app đúng schema; password whitespace không bị trim, DB Argon2 hash; JWT thật lifetime 900; refresh hash 64 hex/hạn 7 ngày; concurrent register khác case/trim chỉ một user + event; credential sai/unknown 401, LOCKED đúng credential 403; extra/invalid DTO 400; trigger SQL tổng hợp làm outbox thất bại trả 500 không lộ lỗi và user rollback. UserRegistered schema/aggregate_id/payload.user_id/status PENDING được kiểm, không credential.

Trigger lỗi chỉ tạo trên DB test, được tháo ở finally. Không fault injection trên demo/shared. Container runtime full auth flow sau rebuild và restart persistence sẽ kiểm P4; benchmark container chưa chạy ở bước này. Worker M3/frontend/Event M4 NOT RUN. Chưa commit.
