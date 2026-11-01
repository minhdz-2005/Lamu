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
    REG->>DB: Increase reserved; insert HELD reservation and outbox
    REG->>DB: COMMIT
    REG-->>Buyer: Reservation and expiry
  else Sold out
    REG->>DB: ROLLBACK
    REG-->>Buyer: 409 SOLD_OUT
  end
```

