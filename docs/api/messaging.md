# Identity messaging v1 — M3

ACCEPTED 14/11/2026: người dùng xác nhận toàn bộ A–E trong [M3/P0](../../services/identity-service/report/REPORT_M3_P0_MESSAGING_CONTRACT_01.md). [ADR 0005](../adr/0005-m3-outbox-delivery.md). Acceptance contract khác runtime evidence.

Identity là producer; queue nghiệm thu local giữ messages, chưa có consumer nghiệp vụ MUST. Body authority là ba JSON Schemas v1 trong `shared/contracts/events/`; không thay trigger/payload M1/M2. Delivery authority là tài liệu này. Không mở rộng Event/frontend/Notification/email M4.

| Setting | Value |
|---|---|
| Client/runtime | amqplib 2.3.1, Node 24.19.0, bundled typings, confirm channel |
| Exchange | `lamu.events`, topic, durable, không auto-delete/alternate exchange |
| Queue local | `identity.m3.delivery.v1`, classic, durable, non-exclusive, non-auto-delete; không TTL/max-length |
| UserRegistered v1 | `identity.user.registered.v1` → queue local |
| OrganizationCreated v1 | `identity.organization.created.v1` → queue local |
| MembershipChanged v1 | `identity.membership.changed.v1` → queue local |
| AMQP properties | messageId=event_id; contentType=application/json; contentEncoding=utf-8; persistent=true; mandatory=true; type=event_type; appId=identity-service |
| Headers | schema_version=version; x-publish-attempt-id=claim token UUID; header attempt khác khi retry, body/ID giữ nguyên |
| Concurrency | batch/capacity 10, poll 1s, không overlapping poll |
| Deadlines | connect/setup 5s, confirm 10s, heartbeat 10s, lease 60s |
| Retry | min(300s, 1s × 2^(attempt_count−1)), jitter uniform 0.5–1.0; max20/cycle rồi PARKED |
| Reconnect | exponential 1–30s, jitter 0.5–1.0; không claim khi channel/topology chưa sẵn sàng/blocked |
| Shutdown | ngừng claim, drain tối đa15s, Compose grace20s; chưa hoàn tất để lease reclaim |
| Broker | rabbitmq:4.4.0-management-alpine@sha256:598b474e2511f37a7408f3fa580f002684638f4ad6401395102b51e3209a9a51 (linux/amd64) |
| Storage | rabbitmq-data:/var/lib/rabbitmq, hostname rabbitmq, nodename rabbit@rabbitmq; giữ project/volume qua recreate/down-up không -v |

Publish JSON envelope từ outbox đã lưu; không dựng snapshot lại từ bảng nghiệp vụ. Giữ occurred_at ở precision PostgreSQL, aggregate và membership_revision gốc; JSONB không bảo đảm whitespace/thứ tự key. Schema whitelist + aggregate/payload identity + ORG scope consistency được validate trước publish. Invalid/unknown schema park ngay, giữ nguyên dữ liệu, không log payload/email/token.

SENT = publisher ACK của đúng attempt, không return/fault/timeout trước khi attempt hoàn tất và DB conditional update giữ token/status/lease còn hiệu lực. Đây là broker handoff tới ít nhất một queue, chưa là consumer ACK hay xác nhận mọi subscriber. Queue khác nhận nhưng queue đích thiếu binding **có thể SENT**; test phải phát hiện queue đích không nhận và không gọi delivery đích PASS. Khôi phục topology rồi dùng event test/replay có chủ đích để chứng minh queue đúng nhận. Không tự replay SENT.

Return handler đồng bộ map header attempt UUID + messageId + channel generation; callback confirm riêng từng publish. Return thắng ACK. Unknown/mismatched return, NACK, timeout, error/close hoặc throw không SENT; invalidate channel fail pending khi không còn tin được kết quả. `publish()` false là backpressure: chờ drain/deadline trước gửi thêm, không là NACK. Không timer suy thành công, không returned flag toàn cục, không dùng waitForConfirms chung thay kết quả từng message. [RabbitMQ ordering](https://www.rabbitmq.com/docs/confirms#when-publishes-are-confirmed), [amqplib API](https://amqp-node.github.io/amqplib/channel_api.html), [source v2.3.1](https://github.com/amqp-node/amqplib/blob/v2.3.1/lib/channel.js).

Claim transaction ngắn `FOR UPDATE SKIP LOCKED`, dùng DB clock, token mới mỗi attempt, increment count; commit trước broker I/O. Reclaim PROCESSING hết lease; old owner không được finalize. SENT/retry/park WHERE event_id/status/token/lease; affected0=ownership lost. Audit attempts/replay cùng transaction finalization. Crash sau broker ACK hoặc DB finalize failure retry cùng event ID, có duplicate; không lặp mutation nghiệp vụ, không exactly-once hoặc ordering guarantee.

Replay CLI yêu cầu event_id + reason, mặc định dry-run; chỉ PARKED→PENDING có điều kiện, reset retry budget, giữ audit và toàn bộ envelope. Schema sai tiếp tục park, sửa payload cần quy trình riêng được review. Không xóa failed rows, không biến exhaustion thành SENT. SENT legacy có thể sent_at=NULL khi migration để không bịa thời điểm cũ. Rollback app giữ additive schema; không reset/db push/sửa migration cũ.

Worker process NestJS riêng, API không kết nối broker và readiness giữ DB. Assert topology khi connect/reconnect, không sửa topology conflict bằng delete. AMQP chỉ nội bộ, management loopback, credentials env không log. Single-node/classic + named volume không là backup/HA, mất volume/host cần phục hồi riêng. Nếu phát hiện dữ liệu broker cũ trước thay storage phải dừng phần phụ thuộc để thống nhất bảo toàn. Fault/lifecycle chỉ chạy project/volume test riêng, restart và recreate là hai gate độc lập.

Runbook/evidence: [Identity README](../../services/identity-service/README.md), [P7](../../services/identity-service/report/REPORT_M3_P7_OUTBOX_DELIVERY_01.md). Không claim PASS nếu chưa có expected/actual artifact.

Cập nhật P8 14/11/2026: [báo cáo P8](../../services/identity-service/report/REPORT_P8_INTEGRATION_HANDOFF_01.md) ghi lượt full mới riêng (regression127 + broker/lifecycle + Compose trong cùng invocation exit0). [Handoff H04](../integration/identity-handoff.md) nêu điều kiện consumer: chốt queue/binding, validate version, deduplicate event_id và xử lý revision trùng/cũ. Contract v1 không thay đổi; NACK chỉ client-injected, business consumer/provider Event thật M4 NOT RUN. Không suy SENT là mọi queue đích/consumer đã xử lý.
