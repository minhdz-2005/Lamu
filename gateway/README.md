# API Gateway

Cổng truy cập duy nhất cho frontend: xác thực JWT, định tuyến, rate limit và API Composition. Gateway không sở hữu dữ liệu nghiệp vụ.

Cập nhật P8 14/11/2026: implementation hiện proxy allowlist **Identity HTTP1.2.0**; API Composition/Event/Registration/Payment/Notification trong kiến trúc chưa có route thật ở Gateway. [Báo cáo P8](../services/identity-service/report/REPORT_P8_INTEGRATION_HANDOFF_01.md) có lượt kiểm chứng mới, [handoff](../docs/integration/identity-handoff.md) có mapping browser/logout/H01–H05. Frontend default `/api` hiện vẫn Next mock; chọn Gateway base có `/api` đúng một lần và chốt same-origin/CORS/transport trước M4. P8 không sửa frontend hoặc bật CORS. Event resolver [DRAFT](../shared/contracts/http/event-context.draft.openapi.json) không thuộc projection public.

P5 thêm allowlist POST/GET organizations, GET members, PUT member roles và GET public organization; route protected dùng cùng JwtGuard M1. Chỉ mutation P5 forward một Idempotency-Key hợp lệ; query pagination giữ nguyên cho Identity validate. Hai endpoint `/internal/` chỉ ở Identity, bị loại khỏi projection Swagger và không có route Gateway. [ADR 0003](../docs/adr/0003-m2-p5-organization-rbac.md) và canonical HTTP v1.1.0 ghi contract được duyệt; P6 được triển khai riêng theo ADR 0004 và canonical v1.2.0.

M1 có register/login/refresh/logout và `/api/users/me`; API Composition và các route service nghiệp vụ chưa thuộc M1. Xem [runbook Identity/Gateway](../services/identity-service/README.md) cho cấu hình/chạy/test.

NestJS app build riêng: `npm run build -w @lamu/gateway`; image riêng từ `gateway/Dockerfile`. Public port mặc định loopback 8080, có thể cấu hình GATEWAY_BIND/GATEWAY_PORT. IDENTITY_URL là địa chỉ nội bộ; JWT_SECRET/ISSUER/AUDIENCE khớp Identity, timeout mặc định 3000ms. Không truy cập identity_db.

Swagger `/docs`, JSON `/docs-json` dùng [contract projection](../shared/contracts/http/gateway.openapi.json) từ canonical Identity OpenAPI. Endpoint ngoài allowlist, health Identity và `/internal/...` không được proxy. Public client chỉ gửi Bearer token; Gateway tự cấp X-User-Id/X-Session-Id từ claims verified, loại toàn bộ context client qua allowlist, từ chối Authorization trùng ở raw headers. JWT cố định HS256, issuer/audience/expiry/claim shape và lifetime 900. Request ID UUID được giữ hoặc sinh mới xuyên request. Không retry mutation khi 502/504.

Runtime chạy user node, không chứa Jest/tsx. Log chỉ gồm request_id/method/status/duration_ms, không body/header/token/URL query. Rate limit local theo IP, auth nghiêm hơn general; không có distributed limit. Không tự bật CORS rộng hoặc trust proxy. Browser frontend thật và cookie policy thuộc M4; local network trust không thay xác thực service-to-service khi triển khai ngoài local.


P6 allowlist thêm năm route create/list/accept/decline/revoke invitation theo canonical; JwtGuard áp dụng cả năm, bốn POST forward một Idempotency-Key hợp lệ, list forward query để Identity validate. Không wildcard/internal route. Swagger /docs-json là projection v1.2.0. Flow container: `node scripts/compose-smoke.cjs --p6`, artifact M2_P6 riêng. Manual Swagger/DOC-01 M2: PASS — USER-CONFIRMED, xem [nghiệm thu](../services/identity-service/report/REPORT_M2_ACCEPTANCE_01.md).
