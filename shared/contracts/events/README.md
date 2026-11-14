# Event schemas

Mười bốn event cần schema, mỗi schema có envelope `event_id`, `event_type`, `version`, `occurred_at`, `aggregate_type`, `aggregate_id`, `producer`, `payload`. Envelope giống nhau cho mọi event; bảng dưới đây chỉ liệt kê `payload`.

Quy tắc: `message_id` trên broker chính là `event_id` envelope, nên consumer dedupe bằng `processed_messages` mà không cần field riêng. Mọi ID là UUID string, thời gian RFC3339 UTC, field `snake_case` — Same rule với REST ở [danh mục API](../../../docs/api/catalog.md).

## Payload bắt buộc theo event

| Event | Producer | `payload` bắt buộc | Consumer ở MUST |
|---|---|---|---|
| `UserRegistered` | Identity | `user_id`, `email`, `display_name` | chưa có |
| `OrganizationCreated` | Identity | `organization_id`, `slug`, `created_by` | chưa có |
| `MembershipChanged` | Identity | **v1 P5 đã duyệt:** `membership_id`, `organization_id`, `user_id`, `status`, `membership_revision`, `change_type`, `roles[{code, resource_type, resource_id}]`; [chi tiết và trạng thái freeze](#membership-changed-f10) | chưa có; không tự thêm consumer MUST |
| `EventPublished` | Event | `event_id`, `organization_id`, `slug`, `title`, `status`, `starts_at`, `ends_at` | Registration |
| `EventUpdated` | Event | `event_id`, `slug`, `title`, `status`, `starts_at`, `ends_at` | Registration |
| `EventCancelled` | Event | `event_id`, `organization_id`, `slug`, `title`, `status`, `starts_at`, `ends_at`, `cancelled_reason` | Registration, Payment |
| `ReservationCreated` | Registration | `reservation_id`, `event_id`, `user_id`, `total_amount`, `currency`, `expires_at` | Payment |
| `ReservationReleased` | Registration | `reservation_id`, `event_id`, `recipient_email`, `event_title`, `event_starts_at`, `reason` (`EXPIRED`/`CANCELLED`/`PAYMENT_FAILED`/`EVENT_CANCELLED`) | Notification |
| `RegistrationConfirmed` | Registration | `registration_id`, `reservation_id`, `event_id`, `recipient_email`, `event_title`, `event_starts_at`, `total_amount` | Notification |
| `TicketIssued` | Registration | `ticket_id`, `code`, `registration_id`, `event_id`, `ticket_type_name`, `recipient_email`, `event_title`, `event_starts_at` | Notification |
| `BookingCancelled` | Registration | `registration_id`, `event_id`, `recipient_email`, `event_title`, `cancelled_reason` | Notification |
| `PaymentSucceeded` | Payment | `payment_id`, `reservation_id`, `event_id`, `amount`, `currency` | Registration |
| `PaymentFailed` | Payment | `payment_id`, `reservation_id`, `event_id`, `failure_reason` | Registration |
| `RefundCompleted` | Payment | `refund_id`, `payment_id`, `reservation_id`, `event_id`, `amount` | chưa có |

## Vì sao payload phải đủ ngay từ đầu

- Ba event của Notification phải tự mang `event_title` và `event_starts_at`: email "vé của bạn" không thể gọi REST sang Registration hay Event để lấy tên sự kiện (nguyên tắc service-autonomy, §7 kiến trúc).
- `ReservationCreated` phải mang `reservation_id` + `total_amount` + `currency`: Payment tạo giao dịch chỉ từ message, không hỏi lại ai. Thiếu một trong ba field là phải gọi REST ngược chiều.
- `PaymentSucceeded`/`PaymentFailed` phải mang `reservation_id`: đó là khóa duy nhất Registration dùng để confirm hoặc giải phóng quota.
- `EventPublished`/`EventUpdated`/`EventCancelled` phải mang `title` và `slug`: đó là nguồn duy nhất của `event_snapshot.title`/`slug`, thứ mà trang "Vé của tôi" hiển thị.
- `RefundCompleted` và ba event Identity chưa có consumer ở MUST, vẫn cần schema để producer không đổi shape tùy tiện.

Nguồn schema JSON là thư mục này; tên queue và routing key ghi trong `docs/api/messaging.md` khi freeze hợp đồng.

## UserRegistered v1 — M1

Ngày 13/11/2026, người dùng đã chốt đề xuất P0 M1 theo [ADR 0002](../../../docs/adr/0002-m1-auth-gateway.md). Schema chuẩn là [user-registered.v1.schema.json](user-registered.v1.schema.json), fixture tổng hợp tại [fixtures/user-registered.v1.json](fixtures/user-registered.v1.json). Producer Identity, consumer MUST hiện chưa có. `aggregate_type=user`, aggregate_id bằng payload.user_id; event_id và occurred_at được sinh một lần rồi lưu cùng user trong transaction. Không có credential trong event. JSON Schema kiểm shape; producer test kiểm thêm quan hệ aggregate_id/user_id. Seed demo không phát event. Worker RabbitMQ M3 sẽ gửi backlog đã lưu; M1 không tạo queue/consumer hoặc hứa delivery broker đã được kiểm chứng.

<a id="membership-changed-f10"></a>

## MembershipChanged v1: P5 đã duyệt, delivery M3 chưa triển khai

**Cập nhật 14/11/2026 — người dùng chốt A–E/P0 M2 cho P5, theo [ADR 0003](../../../docs/adr/0003-m2-p5-organization-rbac.md).** Schema canonical máy kiểm được: [OrganizationCreated v1](organization-created.v1.schema.json), [MembershipChanged v1](membership-changed.v1.schema.json), fixture tổng hợp trong fixtures/. Payload runtime không lấy từ ví dụ Markdown. Giao nhận broker/consumer projection M3 và Event thật M4 vẫn NOT RUN; không suy đã có consumer review/integration. Tham chiếu [review F10](../../../services/identity-service/report/REVIEW_MASTER_PLAN01.md#f10). Bổ sung này làm rõ dòng MembershipChanged trong bảng; không thay shape của 13 event còn lại hoặc OpenAPI `/users/me`. Producer/consumer không tự suy payload mới đã được phê duyệt từ tên event cũ.

### Ngữ nghĩa và envelope

MembershipChanged là **snapshot đầy đủ của một membership sau mutation**. Consumer dựng projection thay toàn bộ state/roles bằng snapshot mới hơn; không hiểu roles là danh sách role cần cộng thêm. Thu hồi OWNER rồi nhận ADMIN phải bỏ OWNER cũ khỏi projection.

| Field | Quy định producer P5 đã duyệt |
|---|---|
| `event_id` | UUID duy nhất cho một event đã lưu outbox; broker message_id bằng event_id; retry không sinh ID mới |
| `event_type` | `MembershipChanged` |
| `version` | Integer `1`, phiên bản schema; không dùng làm số lần cập nhật membership |
| `occurred_at` | RFC3339 UTC, thời điểm mutation được ghi nhận; retry giữ giá trị gốc, không dùng làm khóa ordering |
| `aggregate_type` | `membership` |
| `aggregate_id` | UUID bằng payload.membership_id |
| `producer` | `identity-service` |
| `payload` | Snapshot theo bảng dưới; không chứa password/hash password, session, access/refresh token |

### Payload và mapping scope

| Field | Kiểu / ý nghĩa |
|---|---|
| `membership_id` | UUID ổn định của membership |
| `organization_id`, `user_id` | UUID tổ chức và user của membership; thay owner không đồng nghĩa thay identity của aggregate |
| `status` | Contract P5 chỉ có `ACTIVE`; thêm trạng thái/lifecycle khác cần review contract và trigger trước khi producer phát |
| `membership_revision` | Integer dương, khởi đầu 1; tăng theo mutation có thay đổi state trên cùng membership, độc lập với version schema |
| `change_type` | `CREATED` hoặc `ROLES_REPLACED` trong phạm vi hiện tại |
| `roles[]` | Toàn bộ assignment sau mutation, không duplicate; thứ tự array không mang ý nghĩa nghiệp vụ. Array rỗng là snapshot không có role nếu policy cho phép, không phải “không cập nhật role” |
| `roles[].code` | Một trong OWNER, ADMIN, SPEAKER, ATTENDEE; không tự thêm custom role ngoài contract |
| `roles[].resource_type` | OWNER/ADMIN có ORG, SPEAKER/ATTENDEE có EVENT theo bộ role hiện tại |
| `roles[].resource_id` | UUID org nếu ORG, UUID event nếu EVENT; không bỏ/null field này trong event |

Nếu persistence Identity lưu resource_id NULL cho assignment ORG theo F07, producer ánh xạ sang organization_id khi serialize. Đây không phải thay đổi DB bắt buộc từ shape JSON. EVENT assignment phải đã qua xác minh F05; consumer không tự suy event/org từ role code. API `/users/me` hiện trả roles code phục vụ hiển thị vẫn là contract riêng.

**Ví dụ snapshot hợp lệ về hình thức cho user là SPEAKER của E1, dữ liệu hoàn toàn tổng hợp:**

```json
{
  "event_id": "10000000-0000-4000-8000-000000000006",
  "event_type": "MembershipChanged",
  "version": 1,
  "occurred_at": "2026-11-13T02:00:00Z",
  "aggregate_type": "membership",
  "aggregate_id": "20000000-0000-4000-8000-000000000001",
  "producer": "identity-service",
  "payload": {
    "membership_id": "20000000-0000-4000-8000-000000000001",
    "organization_id": "30000000-0000-4000-8000-000000000001",
    "user_id": "40000000-0000-4000-8000-000000000001",
    "status": "ACTIVE",
    "membership_revision": 6,
    "change_type": "ROLES_REPLACED",
    "roles": [
      {
        "code": "SPEAKER",
        "resource_type": "EVENT",
        "resource_id": "50000000-0000-4000-8000-000000000001"
      }
    ]
  }
}
```

Nếu chuyển role sang E2 thì snapshot mới có revision 7, event ID mới và resource_id E2; assignment E1 không còn nếu không nằm trong snapshot đó. Với OWNER/ADMIN, resource_id phải bằng organization_id. Không dùng event ID mới để biểu diễn retry cùng mutation.

### Producer: trigger và transaction

| Hành vi | MembershipChanged cần phát |
|---|---|
| Tạo organization cùng membership OWNER | Một CREATED revision 1 cho membership, bên cạnh OrganizationCreated cho org |
| Accept invitation tạo membership mới | Một CREATED revision 1 |
| Role replacement làm đổi tập assignment | Một ROLES_REPLACED, revision tăng 1, payload là toàn bộ assignment mới |
| Tạo/decline/revoke/expire invitation chưa đổi membership | Không phát MembershipChanged |
| Rollback, idempotency replay hoặc replacement không đổi state | Không phát event mới, không tăng revision vì retry/no-op |
| Seed demo | Không phát trừ kịch bản test chỉ định theo F02 |

Identity cập nhật state, membership_revision và ghi outbox cùng transaction/giao thức khóa F06. Revision cần có trong thiết kế migration từ khi producer bắt đầu ghi MembershipChanged ở M2; worker M3 chỉ gửi payload đã lưu, không dựng lại snapshot từ DB hiện tại. Ngăn hai tầng application cùng phát event cho một mutation. Khoá tài khoản user không tự được hiểu thành MembershipChanged; nếu cần phản ánh trạng thái đó bằng event phải thiết kế contract riêng hoặc mở rộng được review.

### Consumer tương lai: dedupe, ordering và lỗi contract

- Validate schema version, UUID/enum, ORG scope và aggregate_id khớp membership_id trước xử lý. Shape không hợp lệ hoặc version chưa hỗ trợ đi vào luồng lỗi/quarantine được định nghĩa, không ACK rồi bỏ qua âm thầm.
- Trong cùng transaction DB local của consumer, dedupe event ID, khóa/upsert projection theo membership ID, so revision và đánh dấu processed. ACK delivery sau commit; rollback phải cho phép retry. Các delivery cạnh tranh không được làm projection lùi revision.
- Revision mới lớn hơn revision đã lưu: thay toàn bộ snapshot. Revision cũ hơn: không ghi đè state mới. Cùng revision/cùng snapshot: không lặp side effect. Cùng revision nhưng snapshot khác hoặc cùng event ID nhưng nội dung khác: báo vi phạm contract; không chọn bản cuối đến một cách tùy ý.
- Snapshot revision 6 đến trước 5 có thể dùng dựng trạng thái hiện tại; revision 5 sau đó không khôi phục role cũ. Nhảy revision không chứng minh đã nhận đủ lịch sử; consumer cần side effect theo từng mutation phải có ordering/gap policy riêng.
- Không dùng schema version, occurred_at hoặc thứ tự nhận broker thay membership_revision. Không biến projection membership thành nguồn quyết định quyền runtime thay Identity check khi chưa có quyết định kiến trúc mới.

### Bàn giao cho các service và tiêu chí freeze

| Bên liên quan | Việc cần cập nhật |
|---|---|
| Identity | Migration revision, mapping scope, bảng trigger, transaction/outbox, test rollback/no-op/retry và JSON Schema của producer |
| Event | Tiếp tục resolver F05 và gọi Identity check; không tự thêm consumer MembershipChanged hoặc suy quyền từ event này |
| Registration / Payment | Tiếp tục contract xác thực/phân quyền hiện có; nếu sau này dùng projection thì đăng ký nhu cầu và implement schema/revision/dedupe trước khi consume |
| Notification | Hiện chưa có consumer MUST cho event này; không tự suy người nhận/email hoặc gửi thông báo từ payload thiếu contact |
| Người quản lý contract/broker | Chốt schema v1 và routing dự kiến `identity.membership.changed.v1`, binding/queue khi có consumer; cập nhật messaging contract/catalog và ghi nhận bên review |

- [ ] Có JSON Schema máy kiểm được, fixture đúng/sai và validation; ví dụ Markdown không thay schema validator.
- [ ] Trigger tạo org/accept/replace được test; rollback/no-op/replay không tăng revision hoặc nhân event; retry giữ payload gốc.
- [ ] Projection test nhận revision mới trước cũ, duplicate, delivery đồng thời và xung đột cùng revision; state không lùi và lỗi được phát hiện.
- [ ] Mapping ORG NULL trong DB sang org UUID trong payload, EVENT E1/E2 và array roles rỗng được mô tả/test rõ.
- [ ] Consumer/schema version không tương thích có policy chuyển phiên bản; bản v1 chưa freeze không được coi là contract production đã ổn định.

Chưa thay các event Identity khác hoặc bổ sung event lifecycle ngoài phạm vi M2. Checklist trên bao gồm cả consumer/projection chưa triển khai; P6 accept đã được duyệt riêng theo ADR 0004 và kiểm chứng producer trong [báo cáo P6](../../../services/identity-service/report/REPORT_M2_P6_INVITATION_01.md); xem [báo cáo P5](../../../services/identity-service/report/REPORT_M2_P5_ORGANIZATION_RBAC_01.md) cho bằng chứng producer/schema/transaction thực tế. Không đánh dấu consumer projection/delivery hoặc invitation PASS từ producer tests P5.

<a id="identity-event-f05"></a>

## Phối hợp Identity–Event: xử lý F05

**Trạng thái: ghi chú bàn giao và contract đề xuất, chưa triển khai/chưa freeze.** Nguồn: [MASTER_PLAN.md §7.2 và M4](../../../services/identity-service/MASTER_PLAN.md), [review F05](../../../services/identity-service/report/REVIEW_MASTER_PLAN01.md#f05). Mục này được đặt tại đây để người làm Event Service nhận biết phụ thuộc tích hợp. Nó mô tả truy vấn REST nội bộ phục vụ gán role EVENT, không thêm domain event, consumer hoặc thay đổi payload trong bảng trên.

### Vấn đề cần phối hợp

Identity sở hữu membership/role; Event Service sở hữu event và quan hệ `event_id → organization_id`. Trước khi gán role SPEAKER/ATTENDEE theo EVENT hoặc tạo/accept invitation mang EVENT assignment, Identity cần nguồn tin cậy để xác nhận event thuộc đúng org đích. Không đọc trực tiếp database Event và không dùng org do client tự khai làm bằng chứng.

| Mốc | Trách nhiệm / giới hạn |
|---|---|
| M2 Identity | ORG assignment chạy bằng API thật; EVENT scope chỉ chứng minh bằng fixture/test resolver. Thiếu resolver trong cấu hình chạy bình thường thì từ chối mutation đòi xác minh event, không cấp quyền hoặc tạo membership một phần. |
| Chuẩn bị M4 | Người làm Identity và Event thống nhất endpoint resolver, shape, lỗi, quyền gọi, timeout và test tích hợp; cập nhật catalog/OpenAPI trước freeze. Không cần đưa triển khai Event thật vào M2 nếu giữ phạm vi hiện tại. |
| M4 Event | Cung cấp metadata event/org từ dữ liệu thật qua API nội bộ; không dùng public event API vì cần xác minh được cả event DRAFT. |
| M4 Identity | Dùng adapter thật, đối chiếu org đích, rồi kiểm local policy và ghi mutation nguyên tử; không fallback sang fixture khi Event lỗi. |

### API nội bộ Event đề xuất

```http
GET /internal/events/{eventId}/authorization-context
```

- `eventId`: UUID bắt buộc, Event kiểm tra định dạng.
- `200`: `{event_id, organization_id}`, cả hai là UUID string; `event_id` phải trùng ID được yêu cầu. Chỉ trả metadata cần thiết, không kèm token hoặc thông tin người mua.
- `400 VALIDATION_FAILED`: event ID sai định dạng; `404 NOT_FOUND`: không tồn tại; lỗi dịch vụ dùng envelope `{error: {code, message, request_id}}` theo catalog.
- Identity phân biệt response không hợp lệ, không tìm thấy và timeout; chỉ coi xác minh thành công khi response hợp lệ và org khớp org đích.
- API chỉ dành cho service nội bộ được phép; không thêm public route ở Gateway. Local giữ mô hình network tin cậy đã chọn; khi triển khai ngoài local phải thống nhất xác thực service-to-service. Có request ID, timeout hữu hạn và không log token.
- Handler đọc event từ database Event và trả metadata, **không gọi lại authorization/check của Identity**. Nếu gọi ngược để bảo vệ chính resolver này sẽ tạo vòng Identity → Event → Identity; quyền gọi service nội bộ cần cơ chế riêng theo trust model đã chốt.
- API này chỉ xác nhận quan hệ event/org; không trả quyết định `allowed` thay Identity. Event Service khi xử lý API nghiệp vụ vẫn resolve org từ tài nguyên thật rồi gọi Identity check với user, permission và scope tương ứng.

Tên endpoint và các error code mới ở review là đề xuất; người làm hai service phải cập nhật [API catalog](../../../docs/api/catalog.md) và OpenAPI khi chốt, không triển khai khác nhau dựa trên suy đoán. Nếu cần EVENT assignment thật ngay M2, cập nhật mốc và dependency được chấp nhận trước khi kéo phần M4 lên.

### Event payload không thay thế resolver hiện tại

`EventPublished`/`EventCancelled` có `organization_id`, nhưng DRAFT chưa phát `EventPublished`; bảng hiện tại cũng chưa có projection Identity tiêu các event này. Vì vậy chỉ dùng event đã nhận để xác minh mọi assignment sẽ thiếu event hoặc có dữ liệu trễ. Giữ nguyên bảng producer/consumer và payload hiện tại; nếu sau này chọn projection thay REST resolver, cần contract bootstrap, event lifecycle, độ trễ và xử lý khi chưa xác minh được trước khi thay đổi kiến trúc.

Resolver không tạo transaction phân tán. Identity nên gọi trước transaction DB local, rồi kiểm lại quyền/trạng thái local trong transaction. Nếu sau này bổ sung chuyển event giữa org hoặc xóa event, hai service phải chốt version/lifecycle và xử lý assignment cũ; ghi chú này chưa cam kết tính nhất quán cho các tính năng đó.

### Checklist bàn giao và kiểm thử M4

- [ ] Catalog/OpenAPI đã có resolver, schema response, quyền gọi nội bộ và mapping lỗi; không có route Gateway public cho resolver.
- [ ] E1 thuộc A, E2 thuộc B: gán E1 trong A được phép khi actor có quyền; gán E2 trong A bị từ chối, không ghi assignment.
- [ ] Event DRAFT vẫn resolve được qua API nội bộ; event không tồn tại trả 404; response thiếu field hoặc ID không khớp bị Identity từ chối.
- [ ] Mất kết nối/timeout Event không làm Identity cấp quyền từ dữ liệu client hoặc fixture; transaction invitation không tạo membership một phần.
- [ ] Role replacement, tạo invitation và accept invitation đều dùng đường xác minh theo contract; replay mutation thành công tuân thủ idempotency, không tự accept lại.
- [ ] Handler resolver không gọi ngược Identity check; test tích hợp dùng Event thật, tách kết quả khỏi test fixture M2.

P6 trigger ACCEPTED riêng theo ADR 0004: fresh accept tạo membership ACTIVE mới phát đúng một MembershipChanged CREATED/revision1 cùng transaction snapshot assignments/invitation/result. Create/decline/revoke/expire/replay/rollback không MembershipChanged/revision mới. Schema v1 giữ nguyên, không invitation event/consumer mới. EVENT resolver ở create/accept chỉ fixture test; runtime thiếu resolver fail closed, replay thành công không resolve lại. Không dùng bằng chứng producer làm PASS worker/consumer M3/M4.
