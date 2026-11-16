# Báo cáo test tay giao diện

Mỗi file là **ảnh chụp có đề ngày**, không phải tài liệu sống: nó ghi những gì quan sát được trên mock vào đúng ngày đó. Hợp đồng đổi (catalog, architecture) thì file báo cáo **không** bị viết lại; muốn biết luật hiện hành, tra ở bảng dưới.

| Muốn biết gì | Đọc ở đâu |
|---|---|
| Luật hiện hành | [docs/business-rules.md](../../business-rules.md), [catalog](../../api/catalog.md), file UI tương ứng |
| Mock đang lệch hợp đồng ở đâu | [frontend/README.md "Chỗ mock lệch hợp đồng"](../../../frontend/README.md) |
| Kết quả test lần cuối | file báo cáo cùng tên, kèm ngày ở dòng đầu |

## Cách viết báo cáo

Mỗi feature một file khi test manual theo mục "Checklist nghiệm thu" của tài liệu tương ứng: `01-auth.md`, `02-event-discovery.md`, `03-event-detail-and-booking.md`, `04-my-tickets.md`, `05-organizer.md`.

Một dòng kết quả gồm: mục checklist, đạt hay không, `request_id` của response lỗi (nếu có), và ghi chú ngắn. File này trống khi chưa test; commit kèm kết quả để buổi bảo chứng minh được đường thẳng đứng chạy thật.

Định dạng gợi ý:

```text
| Checklist mục | Kết quả | request_id / ghi chú |
|---|---|---|
| Đăng nhập sai mật khẩu 2 lần hiện cùng một câu lỗi | đạt | req-4f2a9c |
| Đăng ký email trùng tự chuyển sang tab Đăng nhập | chưa | registration-service chưa trả EMAIL_TAKEN |
```
