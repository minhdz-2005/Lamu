# Hợp đồng API

`catalog.md` là danh mục API của năm service, phần composition của Gateway và ma trận use case; đây là bản nháp chờ cả nhóm approve.

Sau khi freeze, mỗi service tách phần của mình thành spec machine-readable: `gateway.openapi.yaml` cho API public đặt tại đây, còn spec của từng service đặt trong `services/` ngay bên dưới. Schema event có version nằm ở `shared/contracts/events/` ở gốc repo.
