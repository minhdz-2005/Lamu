# Messaging layer

Phát `UserRegistered`, `OrganizationCreated`, `MembershipChanged`. Ở MUST chưa có consumer nào cho ba event này, nên chúng chỉ cần đúng envelope và sẵn sàng cho STRETCH; Identity không tiêu event nghiệp vụ nào. Mọi quyết định quyền đi qua `POST /internal/authorization/check`, không qua broker.
