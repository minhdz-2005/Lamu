# Sơ đồ kiến trúc

Lưu sơ đồ Mermaid hoặc text-based về context, phân quyền, luồng đăng ký và API Composition. Mỗi sơ đồ phải ghi các service sở hữu dữ liệu.

- `context.md`: ranh giới năm service và database riêng của từng service.
- `rbac-flow.md`: luồng kiểm tra quyền khi admin sửa event.
- `ticket-concurrency-flow.md`: giữ chỗ đồng thời và ràng buộc quota.
- `payment-saga-flow.md`: phối hợp Registration và Payment qua Saga.
- `api-composition-flow.md`: Gateway tổng hợp response từ nhiều service.
