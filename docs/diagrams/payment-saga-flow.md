# Payment Saga

Chỉ vé có phí đi qua saga này. Vé miễn phí (`total_amount = 0`) được Registration confirm và phát vé ngay trong transaction giữ chỗ, không chạm Payment.

```mermaid
sequenceDiagram
  actor Buyer
  participant REG as Registration Service
  participant MQ as RabbitMQ
  participant PAY as Payment Service
  Buyer->>REG: Request reservation
  REG->>REG: Lock inventory; create HELD reservation
  REG->>MQ: ReservationCreated (outbox)
  MQ->>PAY: ReservationCreated
  PAY->>PAY: Create idempotent payment (mock)
  alt Payment succeeds
    PAY->>MQ: PaymentSucceeded
    MQ->>REG: PaymentSucceeded
    REG->>REG: Confirm reservation; issue ticket
  else Payment fails
    PAY->>MQ: PaymentFailed
    MQ->>REG: PaymentFailed
    REG->>REG: Release reserved inventory
  end
```

## Nhánh event bị hủy

```mermaid
sequenceDiagram
  participant EV as Event Service
  participant MQ as RabbitMQ
  participant REG as Registration Service
  participant PAY as Payment Service
  participant NT as Notification Service
  EV->>MQ: EventCancelled
  MQ->>REG: EventCancelled
  REG->>REG: Release reserved; mark tickets VOIDED
  REG->>MQ: BookingCancelled (per registration)
  MQ->>NT: BookingCancelled
  MQ->>PAY: EventCancelled
  PAY->>PAY: Refund 100% payments SUCCESS cùng event_id
  PAY->>MQ: RefundCompleted
```

Registration sở hữu reservation và quota; Payment sở hữu giao dịch và hoàn tiền. Không ai gọi REST ngược chiều: mọi phối hợp đi qua broker, `PaymentSucceeded` hay `PaymentFailed` đều idempotent theo `message_id`. Nếu kết quả thành công đến muộn sau khi reservation hết hạn, Payment tự refund mà Registration không phải gửi yêu cầu. Không có transaction phân tán.
