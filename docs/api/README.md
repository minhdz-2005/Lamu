# Hợp đồng API

Hai tài liệu ở cùng cấp và cùng phải approve:

Sau khi freeze, mỗi service tách phần của mình thành spec machine-readable: `gateway.openapi.yaml` cho API public đặt tại đây, còn spec của từng service đặt trong `services/` ngay bên dưới. Schema event có version nằm ở `shared/contracts/events/` ở gốc repo.


Identity backend hiện dùng OpenAPI chuẩn tại `shared/contracts/http/identity.openapi.json` (v1.4.0), Gateway là projection được sinh bằng `scripts/contract-projection.cjs`; generated types ở `shared/contracts/http/generated/identity.d.ts`. Không duy trì bản spec riêng tại thư mục này. Recovery/media đã có implementation và bằng chứng riêng: [handoff](../integration/media-password-recovery.md).
