# LumaSOA

Đồ án nền tảng quản lý sự kiện theo SOA/Microservices: tổ chức, sự kiện, RBAC đa cấp và đăng ký vé có kiểm soát đồng thời.

## Tài liệu
- [Kiến trúc và kế hoạch tổng thể](architecture.md)
- [Danh mục API năm service](docs/api/catalog.md)
- [Tài liệu dự án](docs/README.md)

## Nguyên tắc kiến trúc
- Mọi request từ frontend đi qua API Gateway.
- Năm core services chạy độc lập và sở hữu database PostgreSQL riêng.
- Không chia sẻ database, không có khóa ngoại giữa service; chỉ dùng ID tham chiếu.
- REST cho truy vấn/lệnh cần phản hồi ngay; RabbitMQ cho sự kiện nghiệp vụ bất đồng bộ.
- Chạy hạ tầng local từ `docker-compose.yml` ở thư mục gốc.

> Đây là bộ khung tài liệu và thư mục. Các service chưa có mã nguồn triển khai.


