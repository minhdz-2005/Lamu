# Luồng giữ vé đồng thời

```mermaid
sequenceDiagram
  actor Buyer
  participant GW as Gateway
  participant REG as Registration Service
  participant DB as registration_db
  Buyer->>GW: POST reservation + Idempotency-Key
  GW->>REG: Forward request
  REG->>DB: BEGIN; check idempotency key
  REG->>DB: SELECT inventory FOR UPDATE
  REG->>DB: Verify sold + reserved + quantity <= capacity
  alt Capacity available
    REG->>DB: Increase reserved; insert reservation and outbox
    opt total_amount = 0
      REG->>DB: Move reserved to sold; insert registration and tickets
    end
    REG->>DB: COMMIT
    REG-->>Buyer: Tickets (free) or HELD reservation + expiry
  else Sold out
    REG->>DB: ROLLBACK
    REG-->>Buyer: 409 SOLD_OUT
  end
```

Vé miễn phí confirm trong cùng transaction, không đi qua Payment; vé có phí ở `HELD` cho tới khi `PaymentSucceeded` về qua broker.
