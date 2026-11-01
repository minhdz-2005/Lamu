# Messaging layer

Tiêu `ReservationCreated` và `EventCancelled` từ broker; phát `PaymentSucceeded`, `PaymentFailed`, `RefundCompleted`. Consumer idempotent theo `message_id` và ghi vào `processed_messages`. Ở MUST, Payment không nhận lệnh thanh toán từ frontend.
