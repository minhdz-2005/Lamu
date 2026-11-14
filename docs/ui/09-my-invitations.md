# 09. Lời mời của tôi

**Route:** `/me/invitations` · **Cần đăng nhập:** Bắt buộc, không cần membership trước · **Ưu tiên:** M4 Identity — 5 · **API:** `GET /api/users/me/invitations`, `POST /api/users/me/invitations/{id}/accept`, `POST /api/users/me/invitations/{id}/decline`, `GET /api/users/me`

Mục tiêu: user mới có thể tham gia tổ chức bằng lời mời trong ứng dụng, không phụ thuộc email hoặc Event. **Trạng thái: thiết kế M4, chưa triển khai/chưa nghiệm thu.** Authority: [Identity OpenAPI v1.2.0](../../shared/contracts/http/identity.openapi.json), schemas `Invitations`, `Invitation`, `InvitationAction`, `InvitationAccepted`, `InvitationDeclined`; [00](00-conventions.md). Không dùng Notification API hoặc lời mời theo token URL.

## 1. Layout

```text
+----------------------------------------------------------------+
| Lamu   Tài khoản   Tổ chức   Lời mời          [Tên] [Đăng xuất]  |
+----------------------------------------------------------------+
| Lời mời của tôi                                    [Tải lại]    |
|                                                                |
| Nhóm nghiên cứu · nhom-nghien-cuu                               |
| Vai trò được mời: ADMIN · Phạm vi: Tổ chức                     |
| Được mời: 14/11/2026  · Hết hạn: 21/11/2026  · Đang chờ        |
| [Xem chi tiết]                      [Từ chối] [Chấp nhận]       |
|                                                                |
| Cộng đồng                           Đã chấp nhận               |
| Vai trò tại thời điểm mời: OWNER          [Mở tổ chức]          |
|                                                                |
| Hiển thị 1–20 / total        Mỗi trang [20 v] [Trước] [Sau]      |
+----------------------------------------------------------------+
| Dialog xác nhận: Tham gia “Nhóm nghiên cứu” với role ADMIN?     |
|                                       [Quay lại] [Chấp nhận]   |
+----------------------------------------------------------------+
```

Không cần bộ lọc server trạng thái vì API chỉ nhận limit/offset. All states có badge bằng chữ; không chỉ dùng màu. Mobile dùng card; nút chấp nhận/từ chối tách rõ, có xác nhận và focus trả về card sau đóng modal.

| Component | Props | Ghi chú |
|---|---|---|
| `MyInvitationsPage` | — | pagination/list/error, session guard |
| `InvitationCard` | `invitation`, `actionState`, `onAction` | hiển thị snapshot role, timestamps và badge |
| `InvitationStatusBadge` | `status` | PENDING/ACCEPTED/DECLINED/REVOKED/EXPIRED từ canonical |
| `InvitationActionDialog` | `invitation`, `action`, `onConfirm` | mỗi operation có snapshot/key riêng |
| `MembershipRefreshNotice` | `organizationId`, `onReload` | accept đã thành công nhưng Profile chưa reload được |

## 2. Trường và validate

| Field | Nguồn/tên gửi | Luật UI |
|---|---|---|
| Tổ chức | `organization_name`, `organization_slug` | text hiển thị, org ID làm route; không gọi public event để lấy tên |
| Role được mời | `roles[]` | hiển thị nguyên snapshot code/type/id, không form sửa role |
| Trạng thái | `status` | nhãn tiếng Việt theo bảng state; không tự gửi status lên server |
| Ngày tạo/hết hạn/xử lý | `created_at`, `expires_at`, `processed_at` | RFC3339 → định dạng vi-VN/GMT+7; processed_at=null hiện “Chưa xử lý” |
| Người mời | `inviter_user_id` | nếu cần chỉ hiện UUID ở chi tiết mở rộng; chưa có tên/email trong contract, không gọi internal profile từ browser |
| Phân trang | `limit`, `offset` | default20/max100, sort server created_at/id DESC |
| Action body | schema `InvitationAction` | `{}` hoặc không body; không email/roles/org/sid trong body |
| Header key | `Idempotency-Key` | mới cho một ý định accept hoặc decline, giữ nguyên cho retry ý định đó |

Snapshot lời mời không nhất thiết là role hiện tại sau khi đã accept và được OWNER sửa tiếp. Không hiển thị snapshot như bằng chứng quyền hiện tại.

## 3. Hành vi theo API

### 3.1 Load inbox

GET self inbox bằng access, limit/offset; không truyền user_id của người khác. Render all states, `items=[]` là empty hợp lệ. Không poll tự động; tải lại khi user yêu cầu và sau action; bảo vệ response theo user/generation/page hiện tại.

### 3.2 Chấp nhận và từ chối

1. PENDING còn hạn theo dữ liệu đã nhận mới có nút fresh accept/decline. Đồng hồ client chỉ hỗ trợ hiển thị: backend quyết định expiry; đến mốc refetch một lần, không tự ghi trạng thái đã commit.
2. Mở xác nhận, nêu organization và role snapshot. Action chỉ gửi body rỗng/access/key; không yêu cầu người dùng đã thuộc organization.
3. Accept **200 InvitationAccepted**: thông báo “Bạn đã tham gia tổ chức”; refetch inbox và Profile; Mở tổ chức dùng organization_id từ invitation. Membership_id dùng theo response, không dựng membership/roles trên client.
4. Decline **200 InvitationDeclined**: thông báo từ chối, refetch inbox; không thêm membership. Inviter đã mất OWNER không tự làm UI cấm decline; server quyết định điều kiện từng action.
5. Fresh accept cần inviter còn OWNER ACTIVE và membership chưa tồn tại. **Replay cùng key đã thành công có policy riêng**: không tự chặn retry vì snapshot expiry/inviter đã đổi; retry dùng nguyên operation/key/body để server xử lý. Key khác trên terminal có thể409, không đổi key để thử accept lại.
6. Unknown outcome do network/502/504 giữ operation snapshot/key; không mở đồng thời accept/decline cho cùng invitation trong tab. Nếu Profile refetch lỗi sau accept200, giữ receipt thành công và cho tải lại Profile, không resend fresh accept.

| Tình huống | API | UI |
|---|---|---|
| Không đúng recipient / user khóa / điều kiện quyền thay đổi | 403 FORBIDDEN | dừng action, banner và tải lại inbox/session phù hợp; không suy “đã hết hạn” |
| Lời mời không tồn tại | 404 NOT_FOUND | thông báo không còn tìm thấy và reload list |
| Hết hạn | 409 INVITATION_EXPIRED | thông báo hết hạn, refetch; không hiển thị accept thành công |
| Đã xử lý | 409 INVITATION_NOT_PENDING | trạng thái đã đổi, refetch; không tự gán ACCEPTED nếu server không xác nhận |
| Có membership ACTIVE hoặc INACTIVE | 409 ALREADY_MEMBER | không ghi đè/reactivate; cho về Tổ chức của tôi, tải lại dữ liệu |
| EVENT cần resolver | 409 EVENT_SCOPE_UNVERIFIED | giải thích EVENT chưa tích hợp; không fallback fixture hoặc sửa snapshot |
| Key/input/transport | 400/409 IN_PROGRESS/CONFLICT,401/429/502/504/network | theo00, retry chỉ nguyên snapshot/key |

### 3.3 Scope EVENT và terminal states

Đợt Gateway/Identity này thiết kế fresh accept cho snapshot chỉ ORG (bao gồm roles rỗng). Invitation chứa EVENT vẫn hiển thị đủ; fresh accept disabled với lý do chưa tích hợp Event, **decline vẫn được phép** nếu PENDING/còn hạn. Backend mặc định thiếu resolver sẽ fail closed; không nhận fixture làm provider thật. Retry một action đã gửi có kết quả chưa rõ vẫn tuân thủ key cũ/policy server, không áp nút fresh để xóa dấu vết thao tác.

ACCEPTED có link Mở tổ chức nhưng backend vẫn kiểm membership hiện tại khi truy cập; DECLINED/REVOKED/EXPIRED không có nút action fresh. Không có nút thu hồi ở inbox recipient; revoke thuộc OWNER/receipt ở08.

## 4. State màn hình

| State | Khi nào | Nội dung |
|---|---|---|
| Loading / Error | request chờ/thất bại | skeleton hoặc message/request_id/Tải lại |
| Empty | 200 items rỗng | “Bạn chưa có lời mời nào”; link Tổ chức của tôi/Tạo tổ chức |
| PENDING | server trả chờ | “Đang chờ”, expiry và actions theo scope |
| ACCEPTED | server xác nhận | “Đã chấp nhận”, link Mở tổ chức; snapshot role có nhãn lịch sử |
| DECLINED / REVOKED / EXPIRED | terminal/effective expiry | “Đã từ chối” / “Đã thu hồi” / “Đã hết hạn”, không fresh action |
| Action submitting / Unknown outcome | request đang chờ/mất response | khóa hai nút trên card, giữ operation/key, retry nguyên request |

## 5. Edge cases phải xử lý

| Case | Xử lý |
|---|---|
| User không membership | inbox vẫn mở, không dùng guard organizer để chặn |
| Accept vs revoke/decline từ nơi khác | conflict/actual server là quyết định cuối, không optimistic membership |
| Đồng hồ máy lệch | thời gian UI chỉ tham khảo; reload server, không tự kết luận action đã thành công/thất bại |
| processed_at null / EXPIRED đọc hiệu lực | hiển thị dữ liệu server, không coi list GET đã mutation DB |
| Hai tab accept cùng lời mời/key khác | terminal conflict có thể xảy ra; chỉ refetch, không tạo key mới vô hạn |
| Role đổi sau accept | inbox vẫn giữ snapshot lịch sử; Profile/members mới là dữ liệu hiển thị hiện tại |
| Logout/chuyển user khi action/list đang bay | không cập nhật inbox/profile/session của generation mới |
| Reload khi action chưa rõ kết quả | reload inbox/Profile để đối chiếu; không hứa resume operation nếu key chỉ giữ memory |

## 6. Checklist nghiệm thu

- [ ] Existing user chưa có org vẫn thấy inbox thật qua Gateway; user khác không thấy lời mời của họ.
- [ ] All states, processed_at null, pagination/order/empty đúng schema; không gọi query filter/internal endpoint chưa hỗ trợ.
- [ ] ORG invitation accept200 → reload Profile có membership; decline200 không tạo membership.
- [ ] Request accept/decline body rỗng, key riêng và giữ nguyên khi retry; double click không tạo action mới.
- [ ] Expiry/terminal/wrong recipient/inviter mất quyền/ALREADY_MEMBER có nhánh đúng, không reactivation giả.
- [ ] Unknown outcome được giữ riêng; success replay cùng key không bị UI biến thành fresh action.
- [ ] EVENT snapshot chỉ đọc/disable fresh accept có lý do; decline không bị cấm theo inviter/EVENT resolver.
- [ ] Receipt accept200 không bị xóa vì Profile reload lỗi; không hồi sinh session sau logout.
- [ ] Keyboard/modal focus/mobile/theme và request_id an toàn được kiểm.
- [ ] Khi test thật tạo `docs/ui/reports/09-my-invitations.md`; browser/Event provider integration hiện **NOT RUN**.
