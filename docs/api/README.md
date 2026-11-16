# Hợp đồng API

Hai tài liệu ở cùng cấp và cùng phải approve:

| File | Trả lời câu hỏi |
|---|---|
| [catalog.md](catalog.md) | Ai gọi được endpoint nào, body ra sao, lỗi mã gì — phần composition của Gateway và ma trận use case. Bản nháp chờ approve. |
| [messaging.md](messaging.md) | Exchange, routing key, queue, DLQ, header, quy tắc outbox/ack/retry cho 14 event. Bản nháp chờ approve. |

Quy ước chung (error envelope, mã lỗi, pagination, idempotency, port) nằm ở §0 của catalog và áp cho cả hai tài liệu.

Sau khi freeze, mỗi service tách phần của mình thành spec machine-readable: `gateway.openapi.yaml` cho API public đặt tại đây, còn spec của từng service đặt trong [services/](services/README.md) ngay bên dưới. Schema event có version nằm ở [`shared/contracts/events/`](../../shared/contracts/events/README.md) — field list trong đó là hợp đồng, file JSON Schema là việc của tuần 1.
