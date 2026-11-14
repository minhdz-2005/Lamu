# API Gateway

Cổng truy cập duy nhất cho frontend: xác thực JWT, định tuyến, rate limit và API Composition. Gateway không sở hữu dữ liệu nghiệp vụ.

M1 có register/login/refresh/logout và `/api/users/me`; API Composition và các route service nghiệp vụ chưa thuộc M1. Xem [runbook Identity/Gateway](../services/identity-service/README.md) cho cấu hình/chạy/test.

NestJS app build riêng: `npm run build -w @lamu/gateway`; image riêng từ `gateway/Dockerfile`. Public port mặc định loopback 8080, có thể cấu hình GATEWAY_BIND/GATEWAY_PORT. IDENTITY_URL là địa chỉ nội bộ; JWT_SECRET/ISSUER/AUDIENCE khớp Identity, timeout mặc định 3000ms. Không truy cập identity_db.

Swagger `/docs`, JSON `/docs-json` dùng [contract projection](../shared/contracts/http/gateway.openapi.json) từ canonical Identity OpenAPI. Endpoint ngoài allowlist, health Identity và `/internal/...` không được proxy. Public client chỉ gửi Bearer token; Gateway tự cấp X-User-Id/X-Session-Id từ claims verified, loại toàn bộ context client qua allowlist, từ chối Authorization trùng ở raw headers. JWT cố định HS256, issuer/audience/expiry/claim shape và lifetime 900. Request ID UUID được giữ hoặc sinh mới xuyên request. Không retry mutation khi 502/504.

Runtime chạy user node, không chứa Jest/tsx. Log chỉ gồm request_id/method/status/duration_ms, không body/header/token/URL query. Rate limit local theo IP, auth nghiêm hơn general; không có distributed limit. Không tự bật CORS rộng hoặc trust proxy. Browser frontend thật và cookie policy thuộc M4; local network trust không thay xác thực service-to-service khi triển khai ngoài local.

