# Messaging layer

Phát `UserRegistered`, `OrganizationCreated`, `MembershipChanged`. Ở MUST chưa có consumer nào cho ba event này, nên chúng chỉ cần đúng envelope và sẵn sàng cho STRETCH; Identity không tiêu event nghiệp vụ nào. Mọi quyết định quyền đi qua `POST /internal/authorization/check`, không qua broker.

M3 worker dùng process NestJS riêng, repository claim/lease/audit, publisher confirm/return theo attempt và replay CLI. Contract được duyệt: [messaging v1](../../../../docs/api/messaging.md); schema authority trong shared/contracts/events. Runbook ở [Identity README](../../README.md), gate/evidence ở [P7](../../report/REPORT_M3_P7_OUTBOX_DELIVERY_01.md). Không consumer nghiệp vụ mới hoặc event projection thay authorization runtime.
