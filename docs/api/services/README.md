# OpenAPI service

Danh mục API của từng service đang nằm trong [catalog.md](../catalog.md) — đó là nguồn duy nhất cho tới khi freeze.

Sau khi approve, mỗi service tách phần của mình thành spec machine-readable đặt tại đây: `identity.openapi.yaml`, `event.openapi.yaml`, `registration.openapi.yaml`, `payment.openapi.yaml`, `notification.openapi.yaml`. Hình dạng request/response phải khớp catalog; đổi hình dạng là đổi hợp đồng, cần PR có review.
