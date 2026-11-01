# Messaging layer

Phát `EventPublished` khi publish, `EventUpdated` khi sửa, `EventCancelled` khi hủy; tạo `DRAFT` không phát event. Payload ba event đó mang `event_id`, `organization_id`, `slug`, `title`, `status`, `starts_at`, `ends_at` để Registration và Payment không phải gọi lại Event. Event Service không tiêu event nghiệp vụ nào ở MUST.
