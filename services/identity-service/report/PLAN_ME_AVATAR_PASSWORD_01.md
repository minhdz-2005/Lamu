# Kế hoạch cập nhật avatar và đổi mật khẩu trên trang `/me`

Ngày rà soát 18/11/2026. Hai luồng người dùng hiện chưa hoàn chỉnh. Avatar đã có API lưu ảnh và kiểm soát phiên bản. Đổi mật khẩu khi đang đăng nhập cần bổ sung cả API lẫn giao diện.

## Kết quả rà soát

| Phần | Bằng chứng trong repository | Hệ quả trên trang cá nhân |
| --- | --- | --- |
| Lưu avatar | `gateway/src/routes/media.controller.ts`, `services/identity-service/src/media/media.service.ts` và `tests/media.spec.ts` có luồng tạo upload intent, commit, kiểm tra revision và đọc lại avatar từ hồ sơ. | Có thể tái sử dụng backend hiện tại. |
| Đưa avatar đến giao diện | `frontend/src/lib/authMode.ts` chưa cho phép POST tạo intent và PUT commit. `types.ts` loại avatar khỏi `MeProfile`. `apiClient.ts` dựng lại kết quả GET hồ sơ và bỏ trường này. `accountView.ts` chỉ chuyển tên thành chữ viết tắt. | Ngay cả khi tài khoản đã có ảnh, bấm tải lại hồ sơ vẫn chỉ thấy chữ viết tắt. |
| Hai vị trí hiển thị | `frontend/src/features/account/ProfileSummary.tsx` và `IdentityHeader.tsx` render `profile.initials`. `LiveAccountPage.tsx` đã lấy profile và hàm reload từ `useSession`. | Thiếu thao tác chọn ảnh. Có sẵn một nguồn hồ sơ chung để cập nhật cả hai vị trí. |
| Mật khẩu | `gateway/src/routes/auth.controller.ts` và `services/identity-service/src/security/recovery.service.ts` phục vụ quên mật khẩu bằng mã và reset token. Auth controller của Identity chưa có thao tác xác minh mật khẩu hiện tại để đổi mật khẩu. | Người đang đăng nhập chưa thể đổi mật khẩu trong phần Thông tin cá nhân. |

Đã chạy `npm --prefix frontend test` tại thư mục gốc, đạt 38/38 test. Đây là kết quả của bộ test frontend hiện có. Các ca media tích hợp và Cloudinary được đối chiếu qua mã nguồn, chưa chạy với cơ sở dữ liệu hoặc dịch vụ ảnh trong lần rà soát này.

## 1. Đổi avatar từ cả hai vị trí

1. Mở đúng hai cặp method/path trong `authMode.ts`. Thêm hàm gọi API có kiểu theo `MediaIntent` và `MediaDisplay`. Giữ `avatar.url` và `avatar.revision` qua bước kiểm tra response, projection, cache phiên và `toAccountProfile`. Với cache cũ thiếu avatar, hiển thị chữ viết tắt và lấy lại hồ sơ trước khi tạo intent để có revision thật.
2. Trên `/me`, biến cả `lamu-account-avatarLarge` và `lamu-account-avatarSmall` thành nút “Đổi ảnh đại diện” dùng chung một bộ chọn file và trạng thái đang tải. Giữ kích thước 72px/32px, cắt ảnh tròn, hỗ trợ bàn phím và giữ chữ viết tắt nếu thiếu URL hoặc ảnh tải lỗi. Header dùng chung ở trang khác chỉ cần nhận ảnh từ hồ sơ. Fixture preview mô phỏng thao tác, không gọi dịch vụ thật.
3. Sau khi chọn file hợp lệ theo định dạng và giới hạn của media service, gửi `POST /api/identity/users/me/avatar/upload-intents` với `expected_revision` dạng chuỗi. Gửi file bằng `FormData` trực tiếp tới `upload_url` với `params` đã ký và `api_key` do intent trả về. Chỉ gửi Bearer tới API Identity. Khi upload thành công, gọi `PUT /api/identity/users/me/avatar` với `intent_id`. Mẫu đối chiếu là `tests/cloudinary-real.spec.ts`.
4. Khi commit thành công, đưa `{url, revision}` vào hồ sơ chung của đúng người và đúng generation phiên, rồi tự đồng bộ bằng GET hồ sơ. Hai avatar phải đổi ngay trong cùng lượt cập nhật, không cần F5 hoặc bấm “Tải lại”. Bỏ qua kết quả GET cũ có revision thấp hơn. Nếu đồng bộ lại lỗi sau commit, giữ ảnh vừa lưu và cho phép thử tải lại hồ sơ.
5. Nếu upload lỗi trước commit, giữ ảnh cũ và mở lại bộ chọn. Nếu commit mất phản hồi, đối chiếu lại hồ sơ hoặc gửi lại cùng `intent_id`. Khi gặp xung đột revision, lấy ảnh mới nhất từ server trước khi người dùng chọn thay tiếp. Hủy hoặc bỏ qua kết quả đang chờ khi đăng xuất hay chuyển tài khoản.

## 2. Đổi mật khẩu trong Thông tin cá nhân

1. Đề xuất `POST /api/users/me/password` tại gateway, tương ứng `POST /api/identity/users/me/password` từ trình duyệt. Body gồm `current_password` và `new_password`. Thành công trả HTTP 200 với `{"status":"OK"}`. Cập nhật `shared/contracts/http/{identity,gateway}.openapi.json`, chạy `npm run generate:contracts` và `npm run contracts:check`.
2. Gateway xác thực Bearer rồi chuyển context đã xác minh. Identity dùng `ContextGuard` lấy người dùng và phiên hiện tại. Kiểm tra mật khẩu hiện tại bằng Argon2, áp dụng quy tắc mật khẩu của Identity và giới hạn tần suất thử. Trả lỗi nghiệp vụ riêng khi mật khẩu hiện tại sai, ví dụ HTTP 400 với `CURRENT_PASSWORD_INCORRECT`, để client giữ phiên và đưa focus về đúng trường. HTTP 401 dành cho phiên không hợp lệ.
3. **Chính sách phiên đề xuất:** sau khi đổi thành công, thu hồi tất cả phiên kể cả phiên hiện tại và yêu cầu đăng nhập lại. Trong một transaction, khóa và kiểm tra lại hash, trạng thái tài khoản và hiệu lực phiên, cập nhật hash mới, thu hồi refresh session và vô hiệu hóa các challenge khôi phục còn mở. Dùng cùng thứ tự khóa với các luồng login/reset liên quan. Hai yêu cầu đồng thời dùng cùng mật khẩu cũ chỉ được có một lần thành công.
4. Thêm nút “Đổi mật khẩu” ngay trong thẻ Thông tin cá nhân của người đang đăng nhập. Form có mật khẩu hiện tại, mật khẩu mới, xác nhận mật khẩu mới và nút lưu/hủy. Dùng nhãn tiếng Việt, thuộc tính autocomplete phù hợp, báo lỗi ngay tại trường và khóa gửi lặp. Chỉ gửi hai trường API yêu cầu. Mật khẩu chỉ tồn tại trong form và request đang xử lý, tránh lưu vào cache phiên, bản ghi retry hoặc log.
5. Mở route mới trong allowlist và bổ sung hành vi tương ứng cho chế độ mock. Khi server xác nhận thành công, xóa phiên phía client, chuyển về đăng nhập và hiện thông báo “Đã đổi mật khẩu. Vui lòng đăng nhập lại.” Nếu mất phản hồi sau khi gửi, thông báo kết quả chưa xác định và hướng dẫn đăng nhập bằng mật khẩu mới. Tránh tự phát lại request chứa mật khẩu.

## 3. Điều kiện nghiệm thu

| Ca kiểm tra | Kết quả cần quan sát |
| --- | --- |
| Tài khoản chưa có ảnh, lần lượt chọn ảnh A từ avatar lớn và ảnh B từ avatar nhỏ | Ban đầu thấy chữ viết tắt. Sau mỗi lần commit, cả hai vị trí tự hiển thị cùng ảnh. Sau F5 hoặc đăng nhập lại vẫn thấy B. |
| Hủy chọn, ảnh không hợp lệ, lỗi upload, mất phản hồi commit, hai tab đổi ảnh đồng thời | Thông báo đúng bước lỗi. Có thể thử lại. Ảnh cuối khớp revision server. Phản hồi đến muộn không thay ảnh của tài khoản khác. |
| Mật khẩu hiện tại sai, mật khẩu mới không hợp lệ, xác nhận không khớp | Lỗi gắn đúng trường, phiên hiện tại vẫn dùng được, hash giữ nguyên. Thiếu xác thực thì API từ chối trước khi cập nhật. |
| Đổi hợp lệ với hai phiên đang mở | Yêu cầu đăng nhập lại. Hai phiên cũ mất quyền trên API được bảo vệ. Mật khẩu cũ không đăng nhập được, mật khẩu mới đăng nhập được. |
| Hai lần đổi đồng thời hoặc timeout sau khi server đã lưu | Hash không bị ghi đè từ lần xác minh cũ. Giao diện không báo thành công khi chưa xác định kết quả. |

Thứ tự triển khai: nối dữ liệu hồ sơ và transport avatar, hoàn thiện hai nút cùng luồng upload, bổ sung contract và API mật khẩu, sau cùng nối form. Mỗi phần bổ sung test tại lớp bị thay đổi. Mở rộng `frontend/tests/identityTransport.test.ts` và `identityPages.test.ts` cho allowlist và mapping, kiểm thử API mật khẩu qua gateway với DB, rồi chạy kịch bản trình duyệt trên `/me` ở chế độ real. Đối chiếu thêm mock/preview để người phát triển thử được trạng thái chờ, lỗi và thành công.
