# 07. Tổ chức của tôi và tạo tổ chức

**Route:** `/organizations` · **Cần đăng nhập:** Bắt buộc · **Ưu tiên:** M4 Identity — 3 · **API:** `GET /api/users/me`, `POST /api/organizations`

Mục tiêu: chọn hoặc tạo tổ chức mà không phụ thuộc trang organizer/Event. **Trạng thái: thiết kế M4, chưa triển khai/chưa nghiệm thu.** Danh sách lấy từ `Profile.memberships`, không đề xuất thêm `GET /organizations`.

Authority: [Identity OpenAPI v1.2.0](../../shared/contracts/http/identity.openapi.json), schema `Profile`, `CreateOrganization`, `OrganizationCreatedResult`; hành vi key ở [00 §5](00-conventions.md). Form tạo có thể tái sử dụng phần trình bày ở organizer cũ sau khi tách dependency Event.

## 1. Layout

```text
+----------------------------------------------------------------+
| Lamu   Tài khoản   Tổ chức   Lời mời          [Tên] [Đăng xuất]  |
+----------------------------------------------------------------+
| Tổ chức của tôi                         [+ Tạo tổ chức]         |
| Tên                 Slug             Vai trò        Hành động  |
| Nhóm nghiên cứu     nhom-nghien-cuu   OWNER          [Mở]       |
| Cộng đồng           cong-dong        ADMIN          [Mở]       |
+----------------------------------------------------------------+
| Dialog: Tạo tổ chức                                            |
| Tên tổ chức *     [________________________________]           |
| Slug *            [________________________________]           |
| Bạn sẽ trở thành OWNER của tổ chức mới.                        |
|                                 [Hủy] [Tạo tổ chức]            |
+----------------------------------------------------------------+
```

Mảng rỗng: card “Bạn chưa tham gia tổ chức nào” + Tạo tổ chức + Xem lời mời. Không gắn việc tạo tổ chức với bắt buộc tạo sự kiện. Mobile chuyển hàng thành card; tên/slug dài xuống dòng.

| Component | Props | Ghi chú |
|---|---|---|
| `OrganizationsPage` | — | list/error/load từ Profile dùng chung session |
| `OrganizationCardList` | `memberships`, `onOpen` | chỉ dữ liệu chủ thể đang đăng nhập |
| `CreateOrganizationDialog` | `open`, `onClose`, `onCreated` | form, field errors, operation key và kết quả chưa rõ |
| `MutationNotice` | `state`, `requestId`, `onRetry` | giữ nguyên thao tác/key khi retry |

## 2. Trường và validate

| Field | Tên gửi | Luật UI | Lỗi hiển thị |
|---|---|---|---|
| Tên tổ chức | `name` | trim, 1–100 ký tự | “Tên tổ chức cần từ 1 đến 100 ký tự.” |
| Slug | `slug` | trim/lowercase, 3–63 ký tự, theo pattern của `CreateOrganization` canonical | “Slug chỉ gồm chữ thường, số và dấu gạch nối giữa các nhóm.” |
| Key thao tác | header `Idempotency-Key` | sinh bằng UUID cho một thao tác mới; không nằm trong body | UI tự quản lý, không bắt user nhập |

Gợi ý slug từ tên chỉ đến khi user tự sửa slug; vẫn validate theo canonical, không dùng regex slug event cũ ở 00 §10 thay contract organization. Chạy validation khi blur/submit; password/token không liên quan form này. Chỉ gửi hai field được contract cho phép.

## 3. Hành vi theo API

### 3.1 Danh sách

`GET /api/users/me` → schema `Profile`; render `memberships[]` và role code cho hiển thị. Không có server pagination/search cho danh sách này; nếu thêm lọc client thì phải ghi rõ chỉ lọc danh sách đã tải. Không dùng danh sách members hoặc dữ liệu mock để suy tất cả tổ chức trên hệ thống.

### 3.2 Tạo tổ chức

1. Bấm Tạo tổ chức mở modal, focus ô tên; chưa sinh request.
2. Validate, đóng băng body normalized và sinh key cho thao tác; gửi `POST /api/organizations` với access và key.
3. Thành công **201** `OrganizationCreatedResult`; backend tạo OWNER và outbox atomically. Không đợi RabbitMQ/worker trước thông báo thành công.
4. Refetch Profile rồi chuyển `/organizations/{organization_id}`; nếu reload Profile lỗi, giữ kết quả create đã thành công và link Mở tổ chức, không tạo lại để chữa lỗi reload.
5. Khi mất response/502/504, trạng thái commit chưa rõ: giữ request snapshot/key, cho “Kiểm tra lại thao tác” bằng retry cùng key. Không thay key hoặc body âm thầm. Key TTL24h, replay còn chịu quyền hiện tại; không hứa exactly-once vô hạn.

| Tình huống | API | UI |
|---|---|---|
| Slug đã có | 409 SLUG_TAKEN | lỗi dưới slug, giữ tên; chỉnh dữ liệu sau lỗi xác định tạo thao tác mới |
| Body/slug không hợp lệ | 400 VALIDATION_FAILED | field error hoặc banner chung, focus phù hợp |
| Key đang được xử lý | 409 IDEMPOTENCY_IN_PROGRESS | thông báo đang xử lý; retry có chủ đích với key cũ, không spin loop |
| Key dùng cho request khác / tranh chấp | 409 CONFLICT | yêu cầu kiểm tra/tải lại; không tự sinh key để vượt conflict |
| User không còn quyền nhận kết quả | 403 FORBIDDEN | dừng mutation/replay, refresh Profile; không coi tạo chưa từng thành công |
| Token/network/timeout/rate limit | 401/502/504/429/network | theo 00; retry mutation luôn cùng snapshot/key, coordinator auth không đổi chúng |

## 4. State màn hình

| State | Khi nào | Nội dung |
|---|---|---|
| Loading | load Profile | skeleton card/list |
| Empty | memberships rỗng | tạo tổ chức hoặc nhận lời mời |
| Success | list có dữ liệu | Mở từng org; Tạo tổ chức luôn có cho user ACTIVE |
| Error list | Profile lỗi | Tải lại độc lập với form đã thành công |
| Form/submitting | modal mở/request bay | lỗi inline; submit disabled, không gửi double click |
| Outcome unknown | không nhận response đáng tin | panel giữ thao tác, retry cùng key; không báo chắc chắn chưa tạo |
| Created | nhận201 | thông báo thành công, refetch + Mở tổ chức |

Modal có dialog label, focus trap, trả focus về nút mở. Không dismiss khi submit đang chờ. Nếu thoát sau network timeout, thông báo chưa xác định kết quả; không âm thầm bỏ key rồi gửi lại như cùng thao tác. Thiết kế hiện chỉ giữ request/key trong vòng đời trang; sau reload phải tải Profile để đối chiếu trước thao tác mới, không cam kết tự resume qua reload.

## 5. Edge cases phải xử lý

| Case | Xử lý |
|---|---|
| Tạo organization trả201 thay vì mock200 | xem201 là success đúng contract |
| Hai tab dùng cùng slug | một thành công, bên còn lại SLUG_TAKEN; không append org giả |
| Tạo xong nhưng load Profile fail | giữ organization_id xác nhận và link mở; không resend với key mới |
| Role rỗng | vẫn render org, không tự gán OWNER hoặc ẩn membership |
| Chuyển user/logout lúc create đang chờ | không điều hướng/cập nhật cache của user mới; kết quả server có thể đã commit |
| Broker tắt | API tạo được nếu DB/API sẵn sàng; không hiển thị yêu cầu bật broker để tạo org |

## 6. Checklist nghiệm thu

- [ ] User không tổ chức thấy empty state, vẫn tạo được tổ chức.
- [ ] Validate name/slug theo schema, không lấy giới hạn mock làm authority.
- [ ] Create thật trả201 → Profile có membership OWNER → mở đúng org UUID.
- [ ] Slug trùng, invalid input, LOCKED403,401,429,502/504/network đều có nhánh UI.
- [ ] Double click và retry cùng snapshot/key không tạo tổ chức thứ hai.
- [ ] Timeout không tự đổi key/body; đóng/reload không đưa ra kết luận sai về commit.
- [ ] Không gọi `/organizations/{id}/events`, internal endpoints hoặc GET list chưa tồn tại.
- [ ] Không thêm sửa/xóa org, tìm tất cả org hoặc chuyển OWNER bằng API mới.
- [ ] Keyboard/mobile/theme được kiểm; khi test thật tạo `docs/ui/reports/07-organizations.md`. Browser integration hiện **NOT RUN**.
