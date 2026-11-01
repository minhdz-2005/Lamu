# Payment Saga

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
  PAY->>PAY: Create idempotent payment (mock/provider)
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

Registration sở hữu reservation/quota; Payment sở hữu giao dịch. Nếu kết quả thành công đến muộn sau khi reservation hết hạn, Registration yêu cầu void/refund theo chính sách. Không có transaction phân tán.
