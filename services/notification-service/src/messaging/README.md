# Messaging layer

Tiêu `RegistrationConfirmed`, `TicketIssued`, `ReservationReleased`, `BookingCancelled`; mỗi payload đã mang `recipient_email` nên không gọi ngược Identity. Không tiêu `EventUpdated` hay `EventCancelled` vì hai event đó không chỉ định người nhận. Consumer idempotent theo `message_id` và ghi vào `processed_messages`; job gửi qua Mailpit hoặc log, retry có backoff, message hỏng đẩy sang DLQ.
