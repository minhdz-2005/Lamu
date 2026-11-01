# Event schemas

Mười bốn event cần schema, mỗi schema có envelope `event_id`, `event_type`, `version`, `occurred_at`, `aggregate_type`, `aggregate_id`, `producer`, `payload`:

| Producer | Event |
|---|---|
| Identity | `UserRegistered`, `OrganizationCreated`, `MembershipChanged` |
| Event | `EventPublished`, `EventUpdated`, `EventCancelled` |
| Registration | `ReservationCreated`, `ReservationReleased`, `RegistrationConfirmed`, `TicketIssued`, `BookingCancelled` |
| Payment | `PaymentSucceeded`, `PaymentFailed`, `RefundCompleted` |

Event nào hướng tới Notification (`RegistrationConfirmed`, `TicketIssued`, `ReservationReleased`, `BookingCancelled`) bắt buộc mang `recipient_email` trong payload để consumer không phải gọi ngược service khác. Nguồn định nghĩa là cột "Event / bảng ghi" trong [danh mục API](../../../docs/api/catalog.md).
