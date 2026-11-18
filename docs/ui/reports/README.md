# Báo cáo test tay giao diện

Mỗi feature một file khi test manual theo mục "Checklist nghiệm thu" của tài liệu tương ứng: `01-auth.md`, `02-event-discovery.md`, `03-event-detail-and-booking.md`, `04-my-tickets.md`, `05-organizer.md`.

Các trang 06–09 có [báo cáo nghiệm thu local chung](identity-pages-integration-02.md) cho Gateway và Identity.

01-auth hiện có report mock lịch sử; thêm section lượt mới khi thực sự test Gateway/Identity, không ghi đè hoặc đổi provider của record cũ. Manual Swagger/DOC-01 M2 USER-CONFIRMED và regression backend P8 không thay acceptance UI/browser M4.

Một lượt cần ngày/môi trường, frontend/backend version hoặc working tree, base URL/proxy mode, provider thật/mock/fixture, expected/actual, request_id an toàn và evidence. Dòng chưa chạy ghi NOT RUN, fail giữ lỗi/tái hiện, pass chỉ sau quan sát tương ứng. Không lưu password/token/email thật/raw sensitive response; không tự commit hoặc gửi báo cáo chỉ từ quy ước này.

Định dạng gợi ý:

```text
| Checklist mục | Kết quả | request_id / ghi chú |
|---|---|---|
| Đăng nhập sai mật khẩu 2 lần hiện cùng một câu lỗi | đạt | req-4f2a9c |
| Đăng ký email trùng tự chuyển sang tab Đăng nhập | chưa | registration-service chưa trả EMAIL_TAKEN |
```
