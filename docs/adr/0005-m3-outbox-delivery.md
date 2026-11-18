# ADR 0005 — M3 Outbox delivery và RabbitMQ storage

14/11/2026 (Asia/Saigon). **ACCEPTED**: người dùng trả lời “xác nhận toàn bộ tiếp tục công việc” sau gói A–E [M3/P0](../../services/identity-service/report/REPORT_M3_P0_MESSAGING_CONTRACT_01.md). Phê duyệt riêng D10/D11/delivery D12, không suy từ M2 acceptance. Không commit.

Delivery authority [messaging v1](../api/messaging.md); payload authority ba JSON Schema Identity v1 giữ nguyên. Pin amqplib2.3.1, RabbitMQ4.4.0 tag/digest; NestJS worker process riêng. API transaction không phụ thuộc broker. Durable topic/queue, mandatory/persistent/confirm, correlation theo attempt; ACK + no-return + conditional owner/lease update mới SENT. SENT xác nhận route ít nhất một queue, không mọi subscriber; negative missing-target/other-queue test ghi rõ giới hạn đã được duyệt.

Additive claim/lease/retry/park/audit; SKIP LOCKED, không lock qua I/O, at-least-once giữ ID và snapshot, stale owner fail closed. Deadline/backoff/limits/shutdown theo messaging v1. Invalid schema/exhaustion giữ PARKED để điều tra/replay CLI có audit, không auto-delete/SENT. Migration bất biến, giữ backlog/session/idempotency/invitation/revision. Legacy SENT không bịa sent_at.

Named volume + node identity cố định để giữ local queue qua recreate; inventory trước triển khai không có RabbitMQ container/volume. Không coi broker mới là migration backlog broker cũ; nếu phát hiện dữ liệu cũ phải thống nhất phương án trước thay storage. Chỉ fault/lifecycle test trên môi trường riêng. Không cam kết mất host/volume, production HA hoặc consumer delivery processing.

ACCEPTED không đồng nghĩa IMPLEMENTED/PASS: bằng chứng thực tế ở P7; Event resolver thật/frontend/Notification/email/consumer nghiệp vụ vẫn ngoài M3.
