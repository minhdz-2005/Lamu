# Tài liệu dự án

Tập hợp tài liệu kiến trúc, sơ đồ, quyết định kiến trúc, hợp đồng API và mô tả giao diện. Tài liệu phải cập nhật cùng thay đổi của service.

| Thư mục | Nội dung |
|---|---|
| [architecture.md](architecture.md) | service boundary, schema, RBAC, concurrency, nhịp thời gian, lộ trình 4 tuần |
| [business-rules.md](business-rules.md) | mọi quy tắc nghiệp vụ đã đánh số BR-xx: ai chặn, lỗi mã gì, event nào, câu chữ UI, phép thử |
| [api/](api/README.md) | [hợp đồng REST](api/catalog.md) và [hợp đồng thông báo](api/messaging.md) |
| [ui/](ui/README.md) | mô tả năm trang giao diện MUST, đủ chi tiết để code |
| [diagrams/](diagrams/README.md) | sơ đồ context, RBAC, giữ vé, Payment Saga, composition |
| [adr/](adr/README.md) | quyết định kiến trúc dài hạn |
| [integration/identity-handoff.md](integration/identity-handoff.md) | tiến độ bàn giao Identity/Gateway, phụ thuộc giữa service và vị trí cập nhật contract/bằng chứng |

## Đọc theo thứ tự nào

| Bạn làm phần này | Đọc tối thiểu |
|---|---|
| Identity | architecture §3.1 + §3.1.1, business-rules §3 (RBAC), catalog §1 |
| Event | architecture §3.2, business-rules §2 (vòng đời event), catalog §2, messaging §1–§2 |
| Registration | architecture §3.3 + §4.2, business-rules §4–§6, catalog §3, messaging §3/§6/§7/§9 |
| Payment | architecture §3.4 + §4.2, business-rules §5 (tiền), catalog §4, messaging §2/§9 |
| Notification | architecture §3.5, business-rules §7 (email), catalog §5, messaging §3/§8 |
| Gateway | architecture §4.3, catalog §0 + §6, gateway/README.md |
| Frontend | docs/ui/00-conventions.md trước, rồi file của màn hình mình làm, business-rules §1 (định dạng field) |

Quy ước: tài liệu nghiệp vụ (business-rules) nói **luật**, catalog/messaging nói **hình thức truyền**, architecture nói **ai sở hữu**, docs/ui nói **hiển thị**. Một sự việc chỉ có một nguồn định nghĩa; phát hiện chỗ hai tài liệu cùng định nghĩa một luật là bug của tài liệu, báo ngay cho chủ service liên quan.

