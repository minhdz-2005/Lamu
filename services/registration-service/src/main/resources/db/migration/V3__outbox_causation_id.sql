-- messaging §5 hàng `causation_id`: event sinh ra bên trong một handler phải nhớ `event_id` của
-- message đã kích hoạt nó, còn event do người dùng gọi thì NULL (dòng 98 ghi rõ "rỗng với message
-- do người dùng tạo"). Cột UUID chứ không TEXT: giá trị bao giờ cũng là event_id của envelope.
ALTER TABLE outbox_events ADD COLUMN causation_id UUID;
