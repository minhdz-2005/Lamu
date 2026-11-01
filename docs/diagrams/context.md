# Context và service boundaries

```mermaid
flowchart LR
  UI[Frontend] --> GW[API Gateway]
  GW --> ID[Identity & Organization]
  GW --> EV[Event Service]
  GW --> RG[Registration Service]
  GW --> NT[Notification Service]
  ID --> IDDB[(identity_db)]
  EV --> EVDB[(event_db)]
  RG --> RGDB[(registration_db)]
  PAY --> PAYDB[(payment_db)]
  NT --> NTDB[(notification_db)]
  ID -. domain events .-> MQ[RabbitMQ]
  EV -. domain events .-> MQ
  RG -. domain events .-> MQ
  PAY -. domain events .-> MQ
  MQ -. ReservationCreated .-> PAY
  MQ -. PaymentSucceeded / PaymentFailed .-> RG
  MQ -. EventCancelled .-> RG
  MQ -. EventCancelled .-> PAY
  MQ -. RegistrationConfirmed / TicketIssued / ReservationReleased / BookingCancelled .-> NT
```

Mỗi service chỉ ghi database riêng; các ID giữa service là tham chiếu logic. Payment không có route qua Gateway ở MUST: API của nó đều là `/internal/...`, phối hợp chỉ bằng event. Payment nhận `ReservationCreated` và trả kết quả qua event, không ghi reservation hay ticket.
