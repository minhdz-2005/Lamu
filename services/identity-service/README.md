# Identity & Organization Service

Một câu: nơi duy nhất biết **một người là ai** và **người đó được làm gì**. Database: `identity_db`.

## Phần này lo gì

- Hồ sơ người dùng: email, tên hiển thị, mật khẩu, còn hoạt động hay đã khóa.
- Phiên làm việc: đăng nhập, đăng nhập lại khi trình duyệt mở lại, thoát là hết hiệu lực thật.
- Tổ chức: lập ban tổ chức, cho người vào ban, gắn chức danh cho từng người trong từng phạm vi.
- Trả lời câu hỏi "người này có được làm hành động này trên đối tượng này không" cho toàn hệ thống. Đây là điểm chốt quyền duy nhất; không service nào tự suy ra quyền.

## Nguyên tắc cứng

- Quyền cấp cho cả tổ chức áp dụng xuống mọi event thuộc tổ chức đó; quyền cấp cho một event không lan sang event khác.
- Thành viên của tổ chức A không có chỗ đứng trong event của tổ chức B.
- Không service khác được ghi vào dữ liệu người dùng, tổ chức, thành viên hay chức danh.
- Danh sách 10 mã permission và 4 chức danh là hợp đồng chung; service khác chỉ gửi mã khi hỏi quyền, không tự thêm mã mới.

## Bốn chức danh trong hệ thống

| Chức danh | Phạm vi | Được làm gì |
|---|---|---|
| `OWNER` | Tổ chức | Toàn bộ: cấu hình tổ chức, quản lý thành viên, tạo/sửa/công bố/hủy event, mở bán, check-in vé, hoàn tiền |
| `ADMIN` | Tổ chức | Như `OWNER` nhưng không thêm hoặc thay chức danh thành viên |
| `SPEAKER` | Một event | Chỉ đọc thông tin event mình được gán; không sửa, không công bố, không mở bán |
| `ATTENDEE` | Một event | Người mua vé: giữ chỗ, xem vé của mình, đọc mã tại cửa. Không có quyền quản trị; việc check-in do `OWNER`/`ADMIN` của tổ chức sở hữu event thực hiện |

`SPEAKER` và `ATTENDEE` không có màn hình hay endpoint riêng trong bản MUST; chúng tồn tại như chức danh đã seed để câu trả lời kiểm quyền chính xác.

## API phải cung cấp

Nguồn hợp đồng là [docs/api/catalog.md](../../docs/api/catalog.md). Bảng này không định nghĩa API mới.

| API | Dùng để làm gì | Ai gọi | Quyền |
|---|---|---|---|
| `POST /auth/register` | Mở tài khoản | Người chưa đăng nhập, qua cổng vào | Công khai |
| `POST /auth/login` | Kiểm tra thông tin đăng nhập, phát thẻ phiên | Người chưa đăng nhập, qua cổng vào | Công khai |
| `POST /auth/refresh` | Đổi thẻ hết hạn lấy thẻ mới | Frontend khi phiên sắp hết, qua cổng vào | Công khai |
| `POST /auth/logout` | Thu hồi phiên hiện tại | Người dùng, qua cổng vào | Đã đăng nhập |
| `GET /users/me` | Hồ sơ của người đang đăng nhập kèm các tổ chức họ thuộc về và chức danh trong từng tổ chức | Frontend (trang vé của tôi, trang quản trị), qua cổng vào | Self |
| `POST /organizations` | Lập ban tổ chức; người tạo tự thành `OWNER` | Frontend (trang quản trị), qua cổng vào | Đã đăng nhập |
| `GET /organizations/{orgId}` | Chi tiết một tổ chức + chức danh của tôi trong đó | Frontend, qua cổng vào | `org.read` hoặc thành viên |
| `GET /organizations/{orgId}/members` | Danh sách thành viên kèm chức danh đang gán | Frontend, qua cổng vào | `org.member.read` |
| `PUT /organizations/{orgId}/members/{userId}/roles` | Gán lại chức danh cho một thành viên | Frontend, qua cổng vào | `org.member.manage` |
| `POST /internal/authorization/check` | **Điểm chốt quyền của toàn hệ thống**: cho biết được hay không, kèm lý do | Bất kỳ service nào cần kiểm một mã quyền đã seed — Event trước mọi thay đổi, Registration khi mở bán/check-in, Payment khi hoàn tiền | Nội bộ |
| `GET /internal/users/{userId}/public-profile` | Tên hiển thị cho trang công khai, không kèm email | Cổng vào (ghép trang chi tiết event) | Nội bộ |
| `GET /public/organizations/{slug}` | Tên ban tổ chức hiển thị trên trang sự kiện | Cổng vào (ghép trang chi tiết event) | Công khai |
| `GET /healthz` | Cho Docker biết service đã sẵn sàng | Docker Compose | Không qua cổng vào |

Chưa làm trong 4 tuần (STRETCH): `POST /organizations/{orgId}/members/invitations`, `GET /internal/users/{userId}/contact`. Endpoint tra email tồn tại trong tài liệu cũ đã bị bỏ vì địa chỉ người nhận nằm thẳng trong thông báo nghiệp vụ.

## Báo tin đi

| Thông báo | Khi nào | Ai nghe trong bản MUST |
|---|---|---|
| `UserRegistered` | Vừa mở tài khoản | chưa có |
| `OrganizationCreated` | Vừa lập tổ chức | chưa có |
| `MembershipChanged` | Vừa thay đổi chức danh | chưa có |

Ba tin này vẫn cần khuôn dạng chuẩn để sau này có người nghe thì không phải đổi shape. Phần này không nhận thông báo từ service nào.
