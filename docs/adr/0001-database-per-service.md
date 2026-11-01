# ADR 0001: Database-per-Service

- Trạng thái: Chấp nhận
- Bối cảnh: Các service cần triển khai độc lập và sở hữu ranh giới dữ liệu rõ ràng.
- Quyết định: Mỗi service có PostgreSQL database riêng; không chia sẻ database/schema và không FK chéo service. Service khác dùng ID tham chiếu và API/event contract.
- Hệ quả: Báo cáo tổng hợp cần API Composition hoặc read model; cập nhật liên service có tính eventual consistency; cần xử lý retry, idempotency và outbox.
