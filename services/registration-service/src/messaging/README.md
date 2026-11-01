# Messaging layer

Phát `ReservationCreated` (chỉ khi `total_amount > 0`), `ReservationReleased`, `RegistrationConfirmed`, `TicketIssued`, `BookingCancelled`; tiêu `EventPublished`, `EventUpdated`, `EventCancelled`, `PaymentSucceeded`, `PaymentFailed`. Consumer idempotent theo `message_id` và ghi vào `processed_messages`. Registration không gọi REST sang Event hay Payment: trạng thái event đọc từ `event_snapshot`, email người nhận lấy từ payload.
