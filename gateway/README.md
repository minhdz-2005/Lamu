# API Gateway

Một câu: **cửa duy nhất** mà giao diện web được phép gõ; bên trong có năm service thì bên ngoài chỉ thấy một cổng. Cổng này chạy ở `8080` và là thành phần duy nhất expose ra ngoài.

Cổng vào **không sở hữu dữ liệu nghiệp vụ**: không tự quyết định giá, chỗ còn lại, trạng thái sự kiện hay quyền hạn.

## Phần này lo gì

- Chuyển tiếp mọi request công khai xuống đúng service sở hữu, kèm danh tính đã được xác minh.
- Xác minh thẻ đăng nhập: chữ ký, nơi phát hành, đối tượng dùng, hạn dùng. Service bên trong không tự kiểm chữ ký nữa.
- Tập hợp câu trả lời nằm rải rác ở nhiều service thành một response duy nhất cho một màn hình.
- Trả lời bằng một khuôn lỗi thống nhất cho toàn hệ thống, kèm mã để giao diện dịch sang tiếng Việt.
- Ghi dấu vết yêu cầu để một lượt đặt vé lần ra được ở cả năm service.

## Nguyên tắc cứng

- Không route nào mở đường cho frontend chạm thẳng vào cổng service hoặc database nào khác.
- Không endpoint nội bộ nào (`/internal/...`) được đi qua cổng vào.
- Không quyết định nghiệp vụ: chỉ chuyển và tập hợp.
- Một nguồn dữ liệu lỗi thì vẫn trả những phần đã có, đánh dấu phần thiếu; chỉ báo lỗi cả trang khi cả ba nguồn đều hỏng.
- Chỗ còn lại không được cache lâu quá năm giây.

## API phải cung cấp

Nguồn hợp đồng là [docs/api/catalog.md](../../docs/api/catalog.md). Bảng này không định nghĩa API mới.

### Hai endpoint tự tổng hợp

| API | Dùng để làm gì | Nguồn dữ liệu ghép lại |
|---|---|---|
| `GET /api/public/events/{slug}/details` | Trang chi tiết sự kiện, frontend chỉ cần một request | Sự kiện + Hồ sơ & quyền hạn (tên ban tổ chức) + Vé (chỗ còn từng loại) |
| `GET /api/users/me/dashboard` | Vé sắp tới của tôi + sự kiện tôi quản lý | Vé & chỗ ngồi + Sự kiện |

Quy tắc dự phòng: nguồn nào lỗi thì key đó trả `null`, kèm `degraded: true` và tên nguồn trong `degraded_sources`; chỉ báo 502 khi cả ba nguồn cùng lỗi.

### Bảng chuyển tiếp

| Tiền tố công khai | Chuyển tới service |
|---|---|
| `/api/auth/...`, `/api/users/me`, `/api/organizations/...`, `/api/public/organizations/...` | Identity & Organization |
| `/api/events` (tạo/sửa/publish/cancel), `/api/organizations/{orgId}/events`, `/api/public/events` | Event |
| `/api/events/{id}/ticket-types`, `/api/events/{id}/availability`, `/api/events/{id}/tickets`, `/api/events/{id}/reservations`, `/api/reservations/...`, `/api/users/me/tickets`, `/api/tickets/check-in` | Registration & Ticketing |
| `/internal/...` của Payment và Notification | **Không route.** Trong bản MUST, frontend không có màn hình nào chạm hai service này |

Chỗ dễ đi sai: hai service Event và Registration cùng dùng đường dẫn bắt đầu bằng `/api/events/...`. Điểm phân biệt là đoạn con `ticket-types`, `availability`, `reservations`, `tickets` — bảng phân tuyến phải ghi rõ và cả nhóm duyệt, nếu không vé sẽ bị gửi nhầm sang service sự kiện. Cùng một kiểu: `/api/users/me` thuộc service hồ sơ, còn `/api/users/me/tickets` thuộc service vé.

Chưa làm trong 4 tuần (STRETCH): giới hạn tần suất request phân tán, cache, mạch ngắt khi một service chết.

## Việc còn treo trước khi đóng băng

1. Chưa có tài liệu định nghĩa endpoint sống của chính cổng vào; quy ước hiện tại chỉ nói năm service có `GET /healthz` và **không** đi qua cổng. Cần chốt để Docker kiểm tra được cổng.
2. Danh sách 10 mã quyền và 4 chức danh phải được Identity và Event duyệt chung; cổng vào không liên quan tới quyết định này nhưng mọi service khác thì có.
3. Tên thông báo, luồng tin và hàng đợi chưa có tài liệu; ai đặt sai là bốn, năm thành phần phải sửa cùng lúc.
