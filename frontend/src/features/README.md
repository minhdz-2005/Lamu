# Tính năng giao diện

Mỗi thư mục tương ứng một tài liệu trong [docs/ui](../../../docs/ui/README.md). Đặt tên thư mục theo tài liệu để khi review biết code thuộc màn hình nào.

| Thư mục | Tài liệu | Route |
|---|---|---|
| `auth/` | [01-auth.md](../../../docs/ui/01-auth.md) | `/auth` |
| `event-discovery/` | [02-event-discovery.md](../../../docs/ui/02-event-discovery.md) | `/events` |
| `event-detail/` | [03-event-detail-and-booking.md](../../../docs/ui/03-event-detail-and-booking.md) | `/events/[slug]` |
| `my-tickets/` | [04-my-tickets.md](../../../docs/ui/04-my-tickets.md) | `/me/tickets` |
| `organizer/` | [05-organizer.md](../../../docs/ui/05-organizer.md) | `/organizer` |

Component chỉ dùng nội bộ một feature thì để trong feature đó; dùng từ hai feature trở lên thì đẩy lên `frontend/src/components/`. Mọi lời gọi API đi qua `frontend/src/lib` (§9 của [00-conventions.md](../../../docs/ui/00-conventions.md)).
