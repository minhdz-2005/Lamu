# Báo cáo test tay giao diện

Mỗi feature một file khi test manual theo mục "Checklist nghiệm thu" của tài liệu tương ứng: `01-auth.md`, `02-event-discovery.md`, `03-event-detail-and-booking.md`, `04-my-tickets.md`, `05-organizer.md`.

Một dòng kết quả gồm: mục checklist, đạt hay không, `request_id` của response lỗi (nếu có), và ghi chú ngắn. File này trống khi chưa test; commit kèm kết quả để buổi bảo chứng minh được đường thẳng đứng chạy thật.

Định dạng gợi ý:

```text
| Checklist mục | Kết quả | request_id / ghi chú |
|---|---|---|
| Đăng nhập sai mật khẩu 2 lần hiện cùng một câu lỗi | đạt | req-4f2a9c |
| Đăng ký email trùng tự chuyển sang tab Đăng nhập | chưa | registration-service chưa trả EMAIL_TAKEN |
```
