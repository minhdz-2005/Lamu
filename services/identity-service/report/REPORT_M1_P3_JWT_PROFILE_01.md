# M1 / P3 — JWT và users/me

Ngày: 13/11/2026 (Asia/Saigon). Implementation: **IMPLEMENTED trong working tree**. Verification: **PASS trong phạm vi dưới đây**.

P2 đã GREEN trước P3. JwtGuard cố định HS256, verify issuer/audience/expiry, kiểm sub/sid/jti UUID, iat/exp integer và lifetime 900; raw Authorization phải duy nhất. Gateway chỉ forward context dựng từ claims đã verify, header allowlist; Identity ContextGuard kiểm context nội bộ. UsersModule đọc trạng thái hiện tại, chỉ trả profile/membership ACTIVE/role code. Swagger `/docs` và `/docs-json` dùng canonical Gateway OpenAPI, không sinh payload riêng.

TDD target: `tests/p3-jwt-profile.spec.ts`. Lệnh: `node scripts/test-db.cjs --migrate --testPathPatterns=p3-jwt`.

- RED: 5 failed/1 passed, profile/Swagger 404 và thiếu guard. Test signing field undefined ban đầu lỗi helper, đã sửa và chạy lại RED hợp lệ; không tính lỗi helper làm RED.
- GREEN: cùng lệnh 6 passed, `npm run build` exit 0. Lỗi type optional iat trong triển khai đã sửa trước GREEN.

Guarantees: token hợp lệ chỉ trả đúng user dù giả X-User-Id/X-Session-Id; response kiểm canonical schema và không hash/session; thiếu/sửa chữ ký/sai issuer/audience/algorithm/expired/missing claims/future iat/lifetime sai bị 401; raw duplicate Authorization bị 401; LOCKED profile bị 403, Identity thiếu context 401; internal/public-health proxy không được route; public auth loại header danh tính và giữ correlation UUID hợp lệ; Swagger không có internal operation.

Provider: Identity/Gateway thật, PostgreSQL thật; test riêng header public dùng upstream stub có ghi rõ trong test. Không coi stub là Event/frontend integration. Network isolation container ở gate P1; full rebuilt image/security follow-up tại P4. Chưa commit.
