# Kế hoạch triển khai Identity và API Gateway

Cập nhật 15/11/2026 — yêu cầu mới sau P8: organization slug tự sinh khi chỉ gửi name, giữ slug explicit tùy chọn để tương thích client cũ. HTTP canonical hiện tại1.3.0, ADR0006/[báo cáo](report/REPORT_ORGANIZATION_AUTO_SLUG_01.md). Không đổi event schema v1 hoặc migration/dữ liệu cũ; các phiên bản1.2.0 bên dưới lưu evidence lịch sử M2/P8.

Trạng thái cập nhật 14/11/2026: **M2 COMPLETE / ACCEPTED: P5/P6 đã triển khai, gate tự động PASS và manual Swagger/DOC-01 PASS theo xác nhận người dùng**. Ngày lập kế hoạch gốc: 12/11/2026.

**P8 COMPLETE — chuẩn bị bàn giao, 14/11/2026:** [báo cáo P8](report/REPORT_P8_INTEGRATION_HANDOFF_01.md) ghi lượt mới full127/127, coverage, broker/lifecycle/Compose và target Compose P6; mapping API/event/frontend và H01–H05 ở [handoff §7–§10](../../docs/integration/identity-handoff.md). [Event HTTP resolver 0.1.0 DRAFT](../../shared/contracts/http/event-context.draft.openapi.json) máy kiểm được, không ACCEPTED/không adapter/provider thật. M4 NOT_STARTED; chờ chốt D09, browser/nhiều tab và owner/reviewer bên nhận. Không commit hoặc sửa frontend.

**M3/P7 COMPLETE trong phạm vi local A–E đã duyệt:** full127 tests/broker thật/lifecycle PASS và Compose offline/reconnect/shutdown PASS; [báo cáo P7](report/REPORT_M3_P7_OUTBOX_DELIVERY_01.md). Contract A–E ACCEPTED theo xác nhận riêng người dùng; không tự gán nghiệm thu consumer M4 hoặc manual M3. Không commit.

Tiến độ hiện tại: [P5](report/REPORT_M2_P5_ORGANIZATION_RBAC_01.md), [P6 contract](report/REPORT_M2_P6_CONTRACT_01.md), [P6 evidence](report/REPORT_M2_P6_INVITATION_01.md), ADR 0003/0004. Người dùng duyệt riêng toàn bộ A–E P6 ngày 14/11/2026. Những đoạn “đề xuất/chưa triển khai/NOT RUN” trong nội dung revision 2 bên dưới lưu baseline kế hoạch; đọc cùng báo cáo theo từng gate, không dùng thay evidence mới. Manual được người dùng xác nhận riêng sau khi tái hiện hướng dẫn; xem [nghiệm thu M2](report/REPORT_M2_ACCEPTANCE_01.md). Không nâng Event thật/worker từ kết quả M2.

P7/M3 ngày 14/11/2026: người dùng xác nhận riêng toàn bộ A–E trong [M3/P0](report/REPORT_M3_P0_MESSAGING_CONTRACT_01.md), D10/D11/delivery D12 ACCEPTED theo ADR0005/[messaging v1](../../docs/api/messaging.md). Worker/migration/audit/replay/storage đã triển khai; regression127 và RabbitMQ thật/lifecycle có evidence. Trạng thái gate cuối ở [báo cáo P7](report/REPORT_M3_P7_OUTBOX_DELIVERY_01.md); không thay acceptance M2 hoặc mở phạm vi M4.

Revision 2 — 13/11/2026: tích hợp F01–F14 từ review vào thiết kế và nghiệm thu. Chỉ cập nhật kế hoạch; toàn bộ kiểm chứng runtime vẫn **NOT RUN**. Không suy phát hiện đã đóng từ việc sửa tài liệu.

Tài liệu tổng hợp quyết định trong phiên trao đổi và mô tả toàn bộ quá trình từ chuẩn bị đến kiểm thử, đánh giá và bàn giao. Phiên lập kế hoạch chỉ chỉnh tài liệu; không tạo mã nguồn, migration thực thi hoặc thay đổi cấu hình chạy.

Đường dẫn chính thức: `services/identity-service/MASTER_PLAN.md`, tương ứng file đang mở trong IDE. Tên `identity-services/MASTER_PLAN.md` trong yêu cầu được hiểu là file này; không tạo thêm thư mục service trùng chức năng.

## 1. Nguồn và cách đọc kế hoạch

- [Kiến trúc](../../docs/architecture.md), đặc biệt §3.1, §3.1.1, §4 và §7.
- [API catalog](../../docs/api/catalog.md).
- [Luồng RBAC](../../docs/diagrams/rbac-flow.md).
- [Event contracts](../../shared/contracts/events/README.md).
- [Review F01–F14](report/REVIEW_MASTER_PLAN01.md).
- [Bàn giao H01–H05 và sổ quyết định D00–D13](../../docs/integration/identity-handoff.md#p0-decisions).
- [Compose](../../docker-compose.yml).
- Mock tham chiếu: `frontend/src/mock/store.ts`, `frontend/src/app/api/[...path]/route.ts` và `frontend/src/lib/apiClient.ts`.

Quyết định người dùng đã chốt được ưu tiên khi khác tài liệu cũ. Các lựa chọn ghi **đề xuất kỹ thuật** là phương án để review, chưa tự trở thành contract được duyệt. Phải đóng quyết định ảnh hưởng trước công đoạn phụ thuộc; không cần đóng mọi quyết định M4 trước M1. Checklist là công việc tương lai; chưa có mục nào được tính là đã nghiệm thu.

**Baseline revision 2 trước implementation (giữ lịch sử):** catalog khi đó còn khác header phiên/idempotency/authorization/invitation; F05/F10 còn draft và D04 chưa có evidence. Cập nhật P8 14/11/2026: M1/P5/P6/M3 đã đồng bộ HTTP canonical1.2.0, ba schema Identity v1 và messaging v1/ADR0002–0005. F10 producer/delivery đã được duyệt, F05 chỉ interface được duyệt; HTTP/lifecycle M4 vẫn DRAFT. Đọc trạng thái hiện tại ở đầu file/handoff/P8, không dùng baseline này thay evidence mới.

## 2. Quyết định và phạm vi

### 2.1 Đã chốt

| Nội dung | Quyết định |
|---|---|
| Backend | TypeScript + NestJS cho Identity và Gateway |
| Dữ liệu | PostgreSQL riêng `identity_db`; service khác không đọc/ghi trực tiếp |
| Xác thực | JWT HS256; Identity ký, Gateway xác thực |
| Mật khẩu | Argon2id theo hướng lựa chọn đã trao đổi |
| Access token | 15 phút |
| Refresh token | 7 ngày, hỗ trợ nhiều thiết bị |
| Logout | Thu hồi phiên hiện tại, không đăng xuất mọi thiết bị |
| Tổ chức | Cho phép nhiều OWNER; không được bỏ OWNER cuối cùng |
| Lời mời | OWNER nhập email của user đã tồn tại; Identity lưu lời mời; người nhận đăng nhập và chấp nhận trong “Lời mời của tôi” |
| Seed | Hai tổ chức, OWNER/ADMIN/SPEAKER và khách; demo chỉ cho local |
| Mốc đầu | Compose + migration → register/login → JWT qua Gateway → `/users/me`; có refresh/logout |
| Kiểm thử thủ công | Swagger; chưa nối frontend trong giai đoạn này |
| Bảo đảm lưu event (F02/D04) | Outbox từ mutation nghiệp vụ đầu tiên M1; M2 thêm event org/membership; M3 bật worker. Seed demo không phát event trừ kịch bản test chỉ định |

### 2.2 Đề xuất kỹ thuật để triển khai

- Prisma cho truy cập database và quản lý migration; xác minh phiên bản tương thích NestJS/Node.js trước khi cài, khóa dependency bằng lockfile.
- Refresh token ngẫu nhiên, chỉ lưu hash; rotation mỗi lần refresh, giữ nguyên hạn tuyệt đối 7 ngày kể từ login.
- Argon2id bắt đầu với memory 19456 KiB, iterations 2, parallelism 1; đo trên container trước khi chốt cấu hình chạy.
- Lời mời hết hạn sau 7 ngày; có chấp nhận, từ chối và OWNER thu hồi. Chưa mời email chưa có tài khoản, chưa gửi email.
- Backend kiểm tra trạng thái user/membership từ nguồn dữ liệu hiện tại; JWT không chứa toàn bộ quyền để tránh quyền cũ còn hiệu lực sau thay đổi role.
- Không cần tách microservice cho từng module của Identity. Identity và Gateway là hai ứng dụng có build, cấu hình và container độc lập.

### 2.3 Các mốc bàn giao tách biệt

| Mốc | Phạm vi | Điều kiện |
|---|---|---|
| M1: Auth nền tảng | Hạ tầng, schema/seed, auth/session, Gateway, `/users/me`, Swagger; lưu UserRegistered vào outbox cùng register | Các kiểm thử M1 đạt; có hướng dẫn tái hiện; không cần broker để commit register |
| M2: Tổ chức và quyền | Tổ chức, membership, role, authorization check, lời mời trong ứng dụng ở cấp API | Kiểm thử phân quyền, cạnh tranh dữ liệu và lời mời đạt |
| M3: Messaging và hoàn thiện Identity | Worker phát backlog outbox M1/M2 và event mới, confirm/return/retry, storage và tài liệu tích hợp | Event contracts và kiểm thử RabbitMQ đạt; không phải mốc bắt đầu lưu event |
| M4: Tích hợp tương lai | Frontend, Event và các service nghiệp vụ sử dụng Identity/Gateway | Triển khai ở công đoạn sau; cần nghiệm thu riêng |

M1 không được báo cáo là hoàn tất toàn bộ Identity. Giao diện “Lời mời của tôi” thuộc M4; M2 cung cấp API tương ứng để thử qua Swagger. Notification chưa cần tham gia M1/M2.

## 3. Hiện trạng và khoảng cách

- Identity và Gateway hiện có khung thư mục/tài liệu; chưa có backend độc lập.
- Mock Next.js lưu RAM, mật khẩu rõ, access token dạng `at_<userId>`; đây chỉ là tài liệu tham chiếu hành vi.
- Mock có rotation refresh nhưng chưa có thời hạn phiên thực; không sao chép cơ chế này nguyên trạng sang backend.
- Mock gán SPEAKER ở membership tổ chức, chưa giới hạn event; phải sửa mô hình ở backend thật.
- Compose hiện có 5 PostgreSQL và RabbitMQ; cần bổ sung Identity/Gateway và chế độ chạy riêng cho M1.
- Catalog hiện quy định idempotency cho mọi endpoint ghi nhưng chưa phân biệt auth; cần chốt ngoại lệ cụ thể ở bước P0.
- Catalog có gán role nhưng thiếu luồng tạo membership cho user khác; lời mời được chấp nhận sẽ giải quyết khoảng trống này.
- Invitations trong tài liệu cũ là STRETCH mời user chưa đăng ký. Yêu cầu mới là mời user đã đăng ký, thuộc M2 của kế hoạch này.

## 4. Kiến trúc và ranh giới tin cậy

```text
Swagger / API client
       │ HTTP :8080/api
       ▼
Gateway (NestJS) ── REST nội bộ ── Identity (NestJS) ── identity_db
                                          │
                                          └─ Outbox (ghi M1/M2) → worker → RabbitMQ (M3)
```

- Gateway: route allowlist, JWT, chuẩn hóa lỗi upstream, request ID, timeout và Swagger public.
- Identity: user/password, session, tổ chức, membership, permission, invitation, quyết định authorization.
- Gateway không truy cập database Identity; không sở hữu nghiệp vụ tổ chức hoặc role.
- Identity/PostgreSQL chỉ ở network nội bộ. Chỉ Gateway expose cổng ứng dụng ra host.
- Đề xuất F01/D02: Gateway dùng allowlist header upstream, bỏ toàn bộ header danh tính client không phân biệt hoa/thường, kể cả header trùng/dạng danh sách; từ chối nhiều `Authorization`. Sau verify chữ ký HS256, issuer/audience/expiry và định dạng claims, tự gán duy nhất `X-User-Id = sub`, `X-Session-Id = sid`. Public auth route cũng không forward context client tự khai.
- `X-Request-Id` là correlation ID đã chuẩn hóa hoặc tạo mới, không phải claim danh tính; chốt quy tắc định dạng/độ dài và xử lý trùng tại P0. Không dùng request ID để xác thực user/session.
- Identity nhận một user ID/session ID hợp lệ từ context nội bộ; không lấy sid từ body hoặc decode JWT chưa verify. Header không tự chứng minh nguồn gửi: phương án chỉ áp dụng network local được chấp nhận. Nếu đổi sang Identity tự verify JWT phải sửa catalog/ADR, không thực hiện ngầm.
- Endpoint `/internal/...` không có route public trên Gateway. Swagger public không được mở đường thực thi endpoint internal.
- Network nội bộ là ranh giới tin cậy theo kiến trúc local hiện tại; phải kiểm thử truy cập trực tiếp bị chặn từ host. Triển khai ngoài local cần đánh giá thêm xác thực service-to-service, không coi network là bằng chứng đầy đủ cho mọi môi trường.
- Request ID được giữ xuyên suốt; không log password, bearer token, refresh token hoặc secret.

## 5. Hợp đồng API dự kiến

Đường dẫn trong bảng là của Identity; Gateway thêm tiền tố `/api`. Giữ JSON `snake_case`, UUID, thời gian RFC3339 UTC; phân trang mặc định 20, tối đa 100. Swagger phải mô tả DTO, response, lỗi và yêu cầu auth/idempotency theo từng endpoint.

### 5.1 M1

| Method/path | Truy cập | Kết quả chính |
|---|---|---|
| `GET /healthz` | Nội bộ/healthcheck | Trạng thái dịch vụ; không lộ cấu hình |
| `GET /readyz` (đề xuất F11/D03) | Nội bộ/readiness | 200 khi truy cập DB được, 503 khi DB down; `/healthz` vẫn 200 nếu process sống |
| `POST /auth/register` | Public | `{user_id}`; email trùng 409 |
| `POST /auth/login` | Public | `{access_token, refresh_token, expires_in: 900}` |
| `POST /auth/refresh` | Public, xác thực bằng refresh token | Bộ token mới; token cũ mất hiệu lực |
| `POST /auth/logout` | Access JWT + refresh token của cùng phiên | `{status: "OK"}`; phiên khác không bị thu hồi |
| `GET /users/me` | JWT | `{id, email, display_name, memberships[]}` |

Đề xuất JWT gồm `sub`, `sid`, `iss`, `aud`, `iat`, `exp`, `jti`. Gateway cố định HS256 và kiểm tra claims; không tin thuật toán do token tự lựa chọn. Secret lấy từ môi trường, kiểm tra đủ mạnh lúc khởi động; giá trị mẫu hiện tại không dùng làm secret thực.

Logout kiểm tra `sub`/`sid` khớp session sở hữu refresh token. Nếu access hết hạn, client refresh trước rồi logout. Logout lặp lại cùng phiên trả OK nếu vẫn chứng minh được phiên; phải ghi rõ hành vi trong contract. Logout thu hồi khả năng refresh; access JWT đã cấp có thể còn hiệu lực tối đa 15 phút. Thu hồi access tức thời chưa thuộc M1.

Đề xuất chi tiết F01/F11: `sub = users.id`, `sid = refresh_sessions.id`; rotation giữ sid và hạn tuyệt đối. Logout tìm/khóa session theo hash refresh token, đối chiếu cả user và session từ context đã verify trước revoke. Cặp access A/refresh B dù cùng user trả `401 UNAUTHENTICATED`, không thay A/B. Retry đúng cặp đã revoke, access còn hạn, trả `200 {status:"OK"}` và giữ revoked_at lần đầu; phải giữ hash/record đủ lâu để chứng minh retry trong thời hạn được freeze, không nhận token cũ đã rotation như token hiện hành. Chính sách retention bằng chứng retry còn mở tại D03.

Đề xuất F11/D03: cả bốn auth POST thành công trả 200 với body trong bảng (refresh giống login); không để NestJS mặc định 201. Refresh credential hợp lệ nhưng user LOCKED và `/users/me` với access hợp lệ của user LOCKED trả `403 FORBIDDEN`, không cấp token/profile; token sai/hết hạn vẫn 401. Thiếu env/secret không đạt validation phải dừng startup với exit khác 0; DB down sau startup thể hiện qua readiness, không nhập nhằng hai ca. `/readyz`, status/code và healthcheck tương ứng phải được ghi vào catalog/OpenAPI trước triển khai.

`memberships[]` giữ các field catalog: organization ID, name, slug, `roles[]`. M2 bổ sung assignments có scope nếu cần; không suy quyền từng event chỉ từ `roles[]`.

### 5.2 M2

| Method/path | Quyền/đối tượng |
|---|---|
| `POST /organizations` | User đã đăng nhập; tự tạo membership OWNER |
| `GET /organizations/{orgId}` | Thành viên hợp lệ hoặc quyền tương ứng theo catalog |
| `GET /public/organizations/{slug}` | Công khai, chỉ thông tin công khai |
| `GET /organizations/{orgId}/members` | `org.member.read` |
| `PUT /organizations/{orgId}/members/{userId}/roles` | `org.member.manage`; kiểm tra OWNER cuối cùng |
| `POST /internal/authorization/check` | Chỉ service nội bộ |
| `GET /internal/users/{userId}/public-profile` | Nội bộ; không email, password hoặc session |
| `POST /organizations/{orgId}/members/invitations` | OWNER / `org.member.manage`; email tài khoản tồn tại |
| `GET /users/me/invitations` | Chỉ lời mời của user đăng nhập |
| `POST /users/me/invitations/{id}/accept` | Đúng người nhận |
| `POST /users/me/invitations/{id}/decline` | Đúng người nhận |
| `POST /organizations/{orgId}/members/invitations/{id}/revoke` | OWNER của đúng tổ chức |

Các endpoint invitation là đề xuất bổ sung cần được ghi vào catalog ở P0/M2. Body tạo lời mời gồm email và role assignments. Chưa cần API xóa user/tổ chức hoặc logout mọi thiết bị.

### 5.3 Lỗi và idempotency

- Envelope thống nhất: `{error: {code, message, request_id}}`.
- 400: dữ liệu sai; 401: thiếu/sai/hết hạn chứng thực; 403: không có quyền; 404: không tồn tại; 409: xung đột nghiệp vụ; 502/504: lỗi/timeout upstream được quy định rõ.
- Đề xuất mã bổ sung: `LAST_OWNER_REQUIRED`, `INVITATION_EXPIRED`, `INVITATION_NOT_PENDING`, `ALREADY_MEMBER`; chốt mã/status trong contract trước khi viết handler.
- Đề xuất ngoại lệ idempotency: login tạo phiên mới mỗi lần; refresh dùng rotation nguyên tử; logout có hành vi lặp an toàn. Register dùng email unique. Các lệnh organization/role/invitation dùng `Idempotency-Key`.
- Khóa idempotency gắn actor tin cậy + operation + key; hash phải gồm tài nguyên đích, không chỉ body. Thiết kế F04 dưới đây còn là đề xuất D06.
- Việc ngoại lệ auth khác quy định chung catalog phải được cập nhật tài liệu, không tự thay đổi hợp đồng ngầm.

| Thành phần F04 | Thiết kế đề xuất để freeze trước mutation M2 |
|---|---|
| Operation | Tách CREATE_ORGANIZATION, REPLACE_MEMBER_ROLES, CREATE/ACCEPT/DECLINE/REVOKE_INVITATION; unique `(actor_user_id, operation, idempotency_key)` |
| Hash/target | SHA-256 của method, operation, path params và body đã validate/chuẩn hóa; thêm query/header có nghĩa nghiệp vụ. Replace gồm org/user đích, create invitation gồm org, accept/decline gồm invitation, revoke gồm org/invitation; không chứa token/request ID |
| Chuẩn hóa | JSON key ổn định, UUID/enum/default theo contract; không tự sort array hay normalize mọi string khi chưa định nghĩa semantics |
| Record | Success status/body, target metadata kiểm quyền, created/completed/expires_at; không credentials; đề xuất TTL 24 giờ từ commit, không gia hạn khi replay |
| Transaction | Record + mutation + outbox + success result commit cùng nhau; unique/lock serialize cạnh tranh, không cần commit riêng IN_PROGRESS. Lỗi trước commit rollback toàn bộ; commit mất response thì replay |
| Replay | Còn TTL, cùng target/body và quyền hiện tại hợp lệ: trả success cũ, không mutation/event/revision mới; request ID là của lần gọi mới. Kiểm quyền nhận kết quả, không đòi trạng thái PENDING đã bị lần accept trước đổi |
| Conflict/timeout | Cùng key khác target/body: 409 CONFLICT; đề xuất chờ khóa quá hạn trả 409 IDEMPOTENCY_IN_PROGRESS, retry cùng key. Chốt thời hạn chờ/code trước freeze |
| Quyền/expiry | Actor mất quyền/bị khóa không được nhận cache trái phép. Cleanup/xóa-thay record hết TTL phải serialize theo khóa; sau TTL có thể là request mới nhưng vẫn giữ constraint nghiệp vụ; không hứa exactly-once vĩnh viễn |

Đề xuất F11: Gateway không kết nối Identity trả `502 UPSTREAM_UNAVAILABLE`; quá timeout cấu hình trả `504 UPSTREAM_TIMEOUT` (code mới chưa freeze). Không tự retry mutation bằng key mới, không coi timeout là bằng chứng transaction chưa commit. Success DTO/status M2 và các lỗi invitation còn phải freeze từng endpoint; bảng §5.2 chưa là OpenAPI hoàn chỉnh.

## 6. Schema, migration và seed

### 6.1 Schema nghiệp vụ

| Bảng | Yêu cầu |
|---|---|
| `users` | UUID, email unique không phân biệt hoa thường, display_name, password_hash, status, timestamps |
| `organizations` | UUID, name, slug unique, created_by |
| `memberships` | Unique `(organization_id,user_id)`, status, joined_at; đề xuất membership_revision dương từ M2 trước mutation phát MembershipChanged |
| `roles` | Code và scope ORG/EVENT; seed role hệ thống; giữ khả năng organization_id nullable theo kiến trúc |
| `permissions` | Code unique, đúng 10 permission đã định nghĩa |
| `role_permissions` | Unique role/permission |
| `membership_roles` | Membership, role, resource_type/resource_id; ràng buộc scope và chống assignment trùng |
| `refresh_sessions` | Session ID, user ID, hash token hiện tại, created_at, expires_at, revoked_at; metadata thiết bị tối thiểu nếu cần |
| `organization_invitations` (M2) | Org, inviter, invitee user ID, role assignments, status, expires_at, accepted_at/processed_at |
| `idempotency_records` (M2) | User/operation/key, request hash, response/status, thời điểm hết hạn |
| `outbox_events` (M1 bắt buộc theo F02) | Event ID/type/schema version, aggregate, payload và occurred_at cố định; trạng thái pending/sent. Đề xuất thêm attempt count, next_attempt_at, last_error, sent_at và claim/lease trước worker M3 |

M1 tạo 8 bảng nền tảng **cộng outbox** và index cần thiết. M2 thêm invitation/idempotency và revision membership trước mutation đầu tiên liên quan; M3 chỉ bổ sung metadata worker nếu chưa có. Không chia sẻ Prisma model persistence với Gateway hoặc service khác.

- Dùng `TIMESTAMPTZ`; xác minh xử lý `CITEXT`/email normalization và migration extension PostgreSQL.
- Unique assignment có resource nullable phải xử lý đúng NULL của PostgreSQL; kiểm thử không có role bị gán trùng do NULL.
- Không FK sang database Event. ID event trong assignment là tham chiếu logic.
- Migration chạy được trên database mới và database có dữ liệu; không tự reset hoặc drop dữ liệu để vượt lỗi migration.
- Prisma migration sinh SQL cần review; không dùng `db push` thay lịch sử migration bàn giao.

**Thiết kế migration F07/D07 — đề xuất, chưa có DDL được duyệt:**

| Invariant / mốc | Phương án cần review | Kiểm chứng dự kiến |
|---|---|---|
| Email / M1 | CITEXT NOT NULL UNIQUE, extension tạo trước cột; app trim thống nhất, không normalize password | Khác case/race chỉ một user; lỗi 409 |
| Quan hệ nội bộ / M1 | UUID PK, FK user/org/member/role/permission/session, delete hạn chế mặc định; unique member `(organization_id,user_id)` | Từ chối orphan/trùng, không FK Event |
| Role/permission / M1 | `UNIQUE NULLS NOT DISTINCT (organization_id,code)` cho role hệ thống; unique permission code và role-permission | Seed hai lần vẫn 4 role/10 permission đúng ma trận; báo lệch, không xóa dữ liệu ngầm |
| Assignment / M1 | NOT NULL resource_type; CHECK ORG + resource_id NULL hoặc EVENT + UUID không NULL; `UNIQUE NULLS NOT DISTINCT (membership_id,role_id,resource_type,resource_id)` | DB chặn tổ hợp sai/trùng kể cả ORG NULL; E1/E2 phân biệt |
| Mapping/tenant / M1–M2 | DTO check ORG và event payload dùng org UUID, persistence ORG dùng NULL theo đề xuất; roles.scope/org kiểm trong transaction, không giả CHECK một row kiểm quan hệ nhiều bảng | Mapping và cross-org/scope test; không mở custom-role API |
| Session / M1 | Hash NOT NULL UNIQUE, FK user, TIMESTAMPTZ, CHECK expires_at > created_at; rotation có điều kiện chưa revoke/expire | Một winner, không hồi sinh phiên revoked, giữ sid/hạn |
| Outbox / M1 | Event ID unique, metadata/schema version/payload lưu cùng mutation; không phụ thuộc broker trong transaction | Commit user có UserRegistered; rollback không có cả hai |
| Invitation / M2 | JSONB server-side code/type/id đã normalize, FK org/inviter/invitee, CHECK status/expiry, partial unique `(organization_id,invitee_user_id) WHERE status='PENDING'` | DTO/domain kiểm shape; race chỉ một PENDING, không partial membership |
| Invitation expiry / M2 | Chuyển PENDING hết hạn sang EXPIRED dưới khóa trước tạo mới; không index predicate `expires_at > now()` | Tạo mới sau expiry; không hai PENDING hữu hiệu |
| Idempotency / M2 | Unique actor/operation/key, target/hash/result và timestamps, index expiry theo §5.3 | Race/rollback/replay/TTL trên DB thật |
| OWNER / M2 | Giao thức khóa §7.2, đếm lại OWNER; không CHECK đơn giản một assignment | Hai OWNER hạ quyền vẫn còn một |
| Revision / M2 | Field membership_revision trước ghi MembershipChanged, khởi đầu 1 khi tạo; state/revision/outbox nguyên tử | No-op/replay/rollback không tăng; seed cũ cần khởi tạo revision có quy tắc, không phát lịch sử giả |
| Upgrade / M1→M2→M3 | Lịch sử migration, tiền kiểm dữ liệu trước constraint, backup/phục hồi khi có dữ liệu; dừng/review dữ liệu vi phạm, không reset | Giữ ID/hash/session/org và backlog outbox; migration exit 0, auth còn hoạt động |

CITEXT, NULLS NOT DISTINCT, ORG NULL và JSONB cần kiểm khả năng Prisma/version P0. SQL tùy chỉnh phải nằm trong migration có tên constraint/index và mapping review được. JSONB không tự xác thực mọi field/quan hệ. Dữ liệu có trước bảo đảm outbox cần ghi khoảng trống; snapshot/backfill nếu cần là quy trình riêng, không tái dựng lịch sử mutation từ state hiện tại.

### 6.2 Seed local

- Hai tổ chức A/B với ID ổn định, ít nhất hai OWNER ở A để test hạ role và một OWNER cuối cùng ở B.
- Có ADMIN, SPEAKER và khách không membership; thêm một user mang role khác nhau ở A/B để kiểm tra cách ly phạm vi.
- SPEAKER được gán event ID cụ thể; fixture event scope ghi rõ là dữ liệu kiểm thử, chưa chứng minh tích hợp Event thật.
- Seed 4 role, 10 permission; ADMIN thiếu `org.member.manage`, SPEAKER chỉ `event.read`, ATTENDEE không permission quản trị.
- Seed demo chỉ chạy bằng lệnh/flag local rõ ràng; từ chối ngoài môi trường local. Seed lại không nhân bản và không ghi đè dữ liệu người dùng không thuộc seed.
- Theo F02, seed demo không ghi event; chỉ kịch bản test được chỉ định mới phát. Seed membership trước M2 không được diễn giải là đã có lịch sử MembershipChanged.
- Password demo được băm Argon2id; tài khoản/password demo ghi trong hướng dẫn local, không dùng cho triển khai thật.

## 7. Auth/session và RBAC cần bảo toàn

### 7.1 Auth/session

- Password chỉ xử lý tại Identity, hash bằng thư viện đã kiểm chứng; không tự viết thuật toán.
- Mỗi login tạo một session riêng. Refresh cùng session không gia hạn vượt 7 ngày từ login.
- Rotation thực hiện atomically bằng transaction hoặc conditional update; hai request dùng cùng refresh token chỉ một request thành công.
- Refresh token đã thay/hết hạn/thu hồi trả 401; không trả lại token mới cho request replay. Phát hiện reuse để thu hồi toàn bộ token family vẫn là phần nâng cao ngoài mốc này.
- Tài khoản LOCKED bị chặn login/refresh; endpoint Identity được bảo vệ kiểm tra trạng thái user hiện tại. Hiệu lực khóa tài khoản trên các service khác phải được nghiệm thu khi tích hợp M4.
- Không suy thiết bị từ địa chỉ IP làm căn cứ xác thực; thiết bị là phiên login độc lập.

### 7.2 RBAC

Đánh giá theo user → membership ACTIVE → assignment → permission → scope. Không tìm được quyền phù hợp thì từ chối.

| Role | Phạm vi | Quyền |
|---|---|---|
| OWNER | ORG | Toàn bộ 10 permission trong tổ chức đó |
| ADMIN | ORG | Toàn bộ trừ `org.member.manage` |
| SPEAKER | EVENT | `event.read` đúng event được gán |
| ATTENDEE | EVENT | Không quyền quản trị |

- Service sở hữu tài nguyên phải xác định event thuộc org nào từ dữ liệu thật trước khi gọi check; client không được tự khai org để vượt quyền.
- Authorization check nhận `user_id`, `organization_id`, `resource_type`, `resource_id`, `permission`; không được mở qua Gateway public.
- M2 kiểm thử event scope bằng fixture/service client tin cậy; việc xác minh event thực sự thuộc org khi gán role cần adapter/contract với Event ở M4. Không coi fixture là cơ chế production; khi chưa có nguồn xác thực event thì từ chối assignment event không xác minh được.
- Gán role theo resource không được biến thành quyền đọc toàn bộ org. `/users/me` trả role phục vụ hiển thị, không thay thế check phía server.
- Quyền sở hữu reservation/ticket thuộc service nghiệp vụ, không giải quyết bằng gán ATTENDEE cho mọi khách vào tổ chức.
- Mọi đường có thể làm mất OWNER hợp lệ phải dùng cùng quy tắc: thay role, vô hiệu membership, xóa membership hoặc khóa owner nếu bổ sung sau này. Khóa row organization trong transaction, đếm lại OWNER còn hiệu lực trước khi commit; không chỉ check ở UI.

**Contract authorization/check F03/D05 — đề xuất chưa freeze:**

| Input | ORG | EVENT |
|---|---|---|
| user_id / organization_id | UUID bắt buộc; org đích | UUID bắt buộc; org do service sở hữu event resolve tin cậy |
| resource_type / resource_id | `ORG`; UUID bằng organization_id, bắt buộc | `EVENT`; event UUID bắt buộc |
| permission | Mã trong 10 permission và hợp lệ trên ORG | Mã trong 10 permission và hợp lệ trên EVENT |

| Điều kiện (đánh giá theo thứ tự) | Kết quả đề xuất |
|---|---|
| Thiếu field/UUID sai/scope lạ/ORG ID lệch/EVENT thiếu ID/permission lạ hoặc sai loại resource | 400 VALIDATION_FAILED; không fallback sang scope rộng hơn |
| User không tồn tại hoặc LOCKED | 200 `{allowed:false, reason: USER_NOT_FOUND / USER_LOCKED}` |
| Không có membership ACTIVE tại org đích | 200 `{allowed:false, reason: NO_ACTIVE_MEMBERSHIP}` |
| Có permission phù hợp scope | 200 `{allowed:true, reason: PERMISSION_GRANTED}` |
| Membership có nhưng thiếu permission/scope, kể cả ATTENDEE quản trị | 200 `{allowed:false, reason: PERMISSION_DENIED}` |
| DB/service lỗi hoặc timeout | Lỗi hạ tầng, không trả allow hoặc giả deny thành công; caller không mutation |

Reason trên chưa được duyệt. Trước handler phải freeze ma trận đủ 10 permission → loại resource: ví dụ org.member.read/event.create trên ORG, event.read trên ORG hoặc EVENT theo use case; không suy mọi permission dùng được trên mọi resource. Service nghiệp vụ chuyển deny hợp lệ thành 403. Identity check không tự chứng minh org/event client khai; nguồn resolve vẫn thuộc service tin cậy. `/users/me.roles[]` hiển thị là contract riêng, không thay authorization.

**Phạm vi gán EVENT F05/D09:** M2 gán ORG qua API thật; EVENT chỉ kiểm bằng fixture/test resolver tách cấu hình chạy bình thường. Khi thiếu resolver, đề xuất `409 EVENT_SCOPE_UNVERIFIED` cho role replacement hoặc invitation có EVENT; không tạo assignment/membership một phần. Tạo và accept đều xác minh scope; replay thành công theo §5.3. M4 mới tích hợp Event thật, kể cả DRAFT, theo [contract resolver F05](../../shared/contracts/events/README.md#identity-event-f05). Endpoint, response và lỗi chi tiết giữ ở nguồn đó, chưa freeze. Đề xuất mapping: không tồn tại 404, sai org 403, response sai/mất kết nối 502, timeout 504; mã lỗi phải chốt trước tích hợp. Không fallback fixture khi Event lỗi, không đọc DB chéo hoặc dùng event RabbitMQ thiếu DRAFT/projection để thay resolver. Resolver không gọi ngược Identity check; đây là truy vấn đồng bộ phục vụ lệnh, không thêm REST ngược từ consumer. Nếu mở rộng chuyển org/xóa event phải chốt lifecycle/version, không coi resolve là transaction phân tán.

**Giao thức khóa F06/D07 — đề xuất thống nhất:**

1. Validate/xác thực và resolve Event trước transaction; không gọi HTTP/broker dưới khóa.
2. Bắt đầu transaction, giành khóa idempotency nếu áp dụng, rồi khóa row organization đích bằng `SELECT ... FOR UPDATE`. Tạo org mới không khóa row chưa tồn tại; vẫn commit org/member/OWNER/outbox cùng nhau.
3. Sau khi lấy khóa, đọc lại quyền actor/inviter và membership ACTIVE từ DB hiện tại; không tái dùng kết quả check trước chờ khóa.
4. Khóa invitation rồi membership/assignment liên quan theo thứ tự ID ổn định; kiểm lại org, trạng thái và expiry sau khi chờ.
5. Kiểm policy/scope/OWNER còn lại; ghi mutation, revision, outbox và success idempotency trong cùng transaction rồi commit, lỗi thì rollback toàn bộ.

Mọi đường thay role và create/accept/decline/revoke invitation liên quan phải dùng cùng thứ tự. Hạ quyền commit trước thì lệnh chờ phải thấy quyền mới và bị từ chối; mutation/accept commit trước hạ quyền thì giữ kết quả hợp lệ, không rollback ngược. Retry deadlock/timeout hữu hạn bằng transaction mới, cùng key và kiểm quyền lại; không báo success giả. Khóa org không tự serialize LOCKED user toàn cục hoặc lifecycle Event: API mới cho các thao tác này cần thiết kế riêng, không mở rộng cam kết race hiện tại.

### 7.3 Lời mời

Trạng thái đề xuất: `PENDING → ACCEPTED | DECLINED | REVOKED | EXPIRED`.

- Chỉ OWNER của org tạo/thu hồi; user đích được xác định bằng email tồn tại rồi lưu `invitee_user_id`.
- Membership chưa tồn tại cho đến khi accept. Accept kiểm tra người nhận theo user ID từ JWT, trạng thái, hạn, quyền còn hiệu lực của người mời và role/scope hợp lệ.
- Lưu invitation cùng assignments phía server; accept không cho client gửi role mới.
- Transaction accept theo §7.2: idempotency → organization → invitation → membership/assignments; đọc lại quyền inviter và expiry sau khóa, tạo membership/revision/outbox và đổi trạng thái cùng transaction; rollback toàn bộ nếu lỗi.
- User đã là member không bị lời mời cũ ghi đè role; trả conflict hoặc kết quả đã hoàn tất theo contract. Không có hai lời mời PENDING hữu hiệu cho cùng user/org; xử lý lời mời hết hạn trước khi tạo mới.
- Accept lặp cùng user không tạo membership thứ hai; accept/decline/revoke chạy đồng thời phải chỉ có một kết quả cuối hợp lệ.
- Đề xuất F11: accept cùng key/target/body trong TTL và quyền nhận kết quả hợp lệ replay success cũ; key mới khi đã ACCEPTED trả `409 INVITATION_NOT_PENDING`. Không để điều kiện PENDING của mutation mới chặn replay; không phát event hoặc tăng revision khi replay.
- Notification/email chưa là điều kiện để lời mời xuất hiện; `GET /users/me/invitations` đọc Identity trực tiếp.

## 8. Trình tự triển khai xen kẽ

Mỗi giai đoạn: Identity hoàn thiện hợp đồng và hành vi trước một bước → Gateway nối route → kiểm thử qua Gateway → cập nhật bằng chứng. Không đợi toàn bộ Identity xong mới thử Gateway.

### P0 — Chuẩn bị và đóng băng hợp đồng cho mốc đang làm

- [ ] Đọc quy tắc repository, kiểm tra thay đổi có sẵn và phiên bản công cụ.
- [ ] Ghi quyết định stack, thời hạn token, invitation và nhiều OWNER vào ADR/kiến trúc ở phiên triển khai.
- [ ] Chốt DTO/status/error, JWT claims, quy tắc logout/rotation, ngoại lệ idempotency và Swagger routes.
- [ ] Chốt phiên bản Node/NestJS/Prisma/Argon2 tương thích, dependency lock và scripts.
- [ ] Thiết kế migration, seed, Docker network và cấu hình môi trường; không commit secret.
- [ ] Ghi rõ phần khác catalog cũ, cập nhật trước khi coi API là contract ổn định.
- [ ] Dùng [sổ quyết định D00–D13](../../docs/integration/identity-handoff.md#p0-decisions) làm nguồn theo dõi duy nhất: D00 giữ nguyên; D04 đã chọn outbox M1. Đóng D02/D03 trước auth/logout, D05–D08/D12 trước mutation M2, D10/D11 trước worker M3, D09 trước tích hợp M4; D01/D07/D13 theo phần phụ thuộc M1.
- [ ] Freeze envelope/UserRegistered và trigger, kèm JSON Schema máy kiểm được trước register M1; làm tương tự OrganizationCreated/MembershipChanged trước ghi M2. Chốt shape để lưu payload không đồng nghĩa phải bật worker sớm.

Đầu ra: hợp đồng M1 có thể viết test; danh sách cấu hình và schema có thể review. Không cần đóng băng API mọi service khác.

### P1 — Compose, database và bộ khung hai ứng dụng

- [ ] Khởi tạo Identity: config validation, ORM đã chốt (đề xuất Prisma), health/readiness theo D03, error envelope, request ID, shutdown.
- [ ] Migration 8 bảng nền cộng outbox từ M1; seed local không event, kiểm constraint §6.1 và dữ liệu tồn tại sau restart. Worker chưa bật; DB commit không phụ thuộc RabbitMQ.
- [ ] Khởi tạo Gateway: health, cấu hình Identity URL, timeout, route allowlist, request ID.
- [ ] Dockerfile độc lập, build có lockfile; Compose dependency health/migration; hướng dẫn chạy riêng M1.
- [ ] Xử lý migration như bước chạy một lần có exit code rõ ràng, không để nhiều replica tranh chạy migration không kiểm soát.

Gate: cả hai ứng dụng healthy, DB readiness đúng, không expose Identity/DB, migration lỗi làm deployment dừng rõ ràng.

### P2 — Register/login từ Identity ra Gateway

- [ ] Identity: DTO validation, normalize email, unique constraint, Argon2id, kiểm tra account status, tạo session và JWT.
- [ ] Register ghi user + UserRegistered cùng transaction theo schema đã freeze; lỗi giữa hai bước rollback cả hai, event pending giữ nguyên để M3 gửi. Không ghi credentials vào payload.
- [ ] Gateway: public routes auth, forward body/status hợp đồng, lỗi upstream và timeout.
- [ ] Swagger login/register có request/response examples, dữ liệu nhạy cảm không được log.
- [ ] Test trực tiếp Identity trong môi trường test, sau đó test cùng ca qua Gateway.

Gate: đăng ký → login → token thật; email trùng kể cả hai request đồng thời không tạo user thứ hai; DB không có password rõ.

### P3 — JWT và `/users/me`

- [ ] Identity: đọc user/membership/role từ DB; response không lộ hash/session.
- [ ] Gateway: guard JWT, issuer/audience/expiry/algorithm, ghi đè header danh tính; public allowlist rõ ràng.
- [ ] Swagger Bearer Authorize gọi `/api/users/me`; các route internal bị chặn.
- [ ] Test token thiếu/sửa payload/sai secret/sai issuer/sai audience/hết hạn và giả header user khác.

Gate: chỉ token hợp lệ truy cập đúng hồ sơ; frontend mock chưa thay đổi.

### P4 — Refresh/logout và bàn giao M1

- [ ] Rotation refresh nguyên tử, hạn tuyệt đối, nhiều phiên độc lập.
- [ ] Logout xác minh phiên đúng user/sid, thu hồi phiên hiện tại; retry có hành vi được tài liệu hóa.
- [ ] Test hai phiên A/B; logout A, B vẫn refresh được; refresh A thất bại.
- [ ] Test race refresh và rollback transaction; dùng clock injection/test config để test expiry, không phải chờ 7 ngày.
- [ ] Hoàn thiện README, Swagger, collection HTTP/curl và báo cáo M1.

Gate: toàn bộ ma trận M1 đạt, tái hiện trên database mới và sau restart; đánh giá hạn chế access JWT sau logout được ghi rõ.

### P5 — Organization và RBAC, rồi nối Gateway

- [x] Migration idempotency và membership_revision trước mutation M2. Tạo org + membership + OWNER + event tương ứng trong transaction; freeze trigger F10 trước ghi.
- [x] Đọc org/members, profile công khai, role replacement và internal authorization check.
- [x] Triển khai bảng input/result §7.2 sau freeze; khóa org và đọc lại quyền theo F06, bảo vệ OWNER cuối cùng, idempotency bao gồm target và vòng đời record.
- [x] Gateway thêm route được bảo vệ; Swagger role/scope và lỗi permission.
- [x] Test org A/B, role matrix, assignment nhiều role, cạnh tranh hạ hai OWNER và idempotency.

Gate: không thao tác chéo org, không còn zero OWNER sau mutation được hỗ trợ; ORG assignment API thật, EVENT fixture tách biệt và fail closed khi thiếu resolver; outbox/revision nguyên tử. Chưa phải Event E2E M4.

### P6 — Lời mời trong ứng dụng ở cấp API, bàn giao M2

- [x] Migration invitation; tạo/list/accept/decline/revoke; expiry và uniqueness.
- [x] Accept tạo membership/role nguyên tử, không tự nâng quyền từ body client.
- [x] Gateway/Swagger hỗ trợ luồng OWNER tạo → đổi tài khoản → xem lời mời → accept → `/users/me` thấy membership.
- [x] Test người nhận sai, org sai, role sai, token thiếu, invitation hết hạn/thu hồi, inviter mất quyền, race accept/revoke.
- [x] Ghi contract dành cho giao diện “Lời mời của tôi” về sau.

Gate tự động P6: xem báo cáo P6 (PostgreSQL/coverage/Compose). **M2 đã nghiệm thu: manual Swagger/DOC-01 PASS — USER-CONFIRMED**, xem [báo cáo nghiệm thu](report/REPORT_M2_ACCEPTANCE_01.md). Không cần mail hoặc Notification để demo.

### P7 — Worker outbox và delivery event Identity, bàn giao M3

- [x] JSON Schema v1 giữ nguyên; validate backlog trước publish, không dựng snapshot từ DB nghiệp vụ hiện tại.
- [x] Worker gửi backlog/event mới, giữ event ID/payload/occurred_at microseconds/revision gốc; transaction mutation/outbox M1/M2 giữ nguyên.
- [x] Chốt exchange/routing/queue tại messaging v1 và ADR0005 trước implementation phụ thuộc.
- [x] `message_id = event_id`, persistent/mandatory/confirm theo attempt; at-least-once, consumer tương lai cần dedupe.
- [x] Queue local durable và queue lifecycle test riêng; verify đúng queue, không coi exchange lưu message hoặc ACK chứng minh mọi queue đích nhận.
- [x] Không thêm invitation event/Notification/email vì chưa có nhu cầu tích hợp được duyệt trong M3.
- [x] Broker retry/reconnect/crash/duplicate/lease/stale owner/DB finalize failure và restart/recreate/down-up có evidence riêng; xem P7 cho gate Compose/API offline và coverage cuối.

Gate: có bằng chứng publish và retry, schema validation, tài liệu queue/routing; không tuyên bố có Notification thật.

Cập nhật M3: các đoạn “đề xuất/còn mở” F08–F10 bên dưới lưu baseline revision2. Quyết định delivery/storage đã được thay bằng ADR0005 và messaging v1 sau xác nhận A–E; dùng P7 cho evidence actual. Consumer projection vẫn tương lai, không phải gate có consumer thật của M3.

**F08/D10 — thiết kế delivery đề xuất cần freeze trước worker:** confirm channel + persistent + `mandatory: true`; đăng ký return/confirm/channel error trước publish. Tương quan từng attempt bằng event ID, channel sequence và return correlation; không dùng biến return toàn cục. Chỉ mark SENT khi cùng attempt ACK, không return theo thứ tự protocol/library đã kiểm chứng và topology đúng. Return dù sau đó ACK, NACK, channel error, timeout/mất kết nối đều không SENT; retry/backoff giữ ID. Không dùng timer tùy ý để suy không return, không nhầm publisher confirm với consumer ACK.

Mark SENT bằng transaction DB ngắn có điều kiện ownership attempt/claim. Nếu nhiều worker, claim/lease phải reclaim sau crash; không giữ DB lock lúc chờ broker. Crash sau confirm trước SENT hoặc DB lỗi có thể tạo duplicate; at-least-once, không đổi event ID. Thời hạn chờ/backoff/ngưỡng cảnh báo còn mở; failed/parked vẫn giữ event để replay, không xóa hoặc coi quá số lần thử là SENT. Mandatory chỉ bảo đảm có route, không chứng minh mọi queue đích đã nhận: test topology phải xác minh binding và delivery tới đúng queue, kể cả khi một queue khác nhận được. Không tự thêm alternate exchange.

**F09/D11 — lưu trữ local đề xuất:** named volume `rabbitmq-data:/var/lib/rabbitmq`, hostname/node identity ổn định (đề xuất hostname `rabbitmq`), image đã kiểm thử/pin; giữ cùng Compose project/volume khi recreate hoặc down/up không `-v`. Exchange/queue durable, queue giữ backlog không exclusive/auto-delete, persistent message và F08 vẫn cần. Review mount/node/backlog cũ trước thay storage; volume mới trống không tự chuyển dữ liệu từ container/anonymous volume. Nếu có dữ liệu cần giữ, phải có quy trình backup/chuyển được review, không xóa nguồn cũ để vượt lỗi. Named volume không thay backup/replication; mất volume/host hoặc nâng image ngoài kiểm thử không thuộc bảo đảm. Event đã SENT không tự replay khi broker mất storage; phục hồi cần quy trình riêng giữ ID/kiểm duplicate.

**F10/D12 — semantics/trigger đề xuất:** dùng [MembershipChanged v1](../../shared/contracts/events/README.md#membership-changed-f10) làm nguồn shape/ví dụ thống nhất; không sao chép payload thành contract thứ hai. Snapshot đầy đủ sau mutation, schema `version` tách `membership_revision`; revision khởi đầu 1 và tăng chỉ khi state đổi, aggregate là membership. Tạo org ghi OrganizationCreated và một MembershipChanged CREATED; accept tạo membership ghi một CREATED; replace thực sự đổi ghi ROLES_REPLACED tăng 1. Invitation chưa đổi membership, rollback, no-op và replay không event/revision mới. DB ORG NULL ánh xạ org UUID khi serialize; thiết kế revision có từ M2. Consumer/projection tương lai dedupe và so revision trong transaction local: mới hơn thay toàn bộ, cũ không ghi đè; cùng revision khác state/cùng event ID khác payload là vi phạm cần quarantine. Snapshot nhảy revision không chứng minh đầy đủ lịch sử; side effect theo từng mutation cần ordering/gap contract riêng. Không thêm consumer MUST và không dùng projection thay check quyền runtime.

### P8 — Chuẩn bị tích hợp và đánh giá toàn phần

- [x] Đối chiếu API/schema với catalog, kiến trúc, event contracts và Swagger; ma trận implementation/test/consumer ở handoff §7.
- [x] Review mock/API client/session/logout, ghi mapping/checklist M4 ở handoff §8; không sửa frontend.
- [x] Chuẩn bị Event resolver OpenAPI/types/checks DRAFT, nguồn event/org đáng tin và đề xuất D09 ở handoff §9. **Freeze HTTP/timeout/lifecycle còn chờ người dùng và bên nhận trước implementation M4**; không tự đánh ACCEPTED.
- [x] Tổng hợp mốc/evidence mới/giới hạn/runbook trong báo cáo P8 và handoff §10.
- [x] M4 giữ NOT_STARTED; Event thật/frontend/business consumer NOT RUN, không suy E2E từ contract/fixture.
- [x] H01/H02 sẵn gói bàn giao độc lập; H03 interface/fixture đã có, HTTP DRAFT/provider thật vẫn M4; H04/H05 có bằng chứng mới. Consumer acceptance/owner/reviewer chưa gán là dependency rõ ở handoff, không tự đặt lịch.

Gate P8 hoàn thành **đầu ra chuẩn bị** theo [REPORT_P8_INTEGRATION_HANDOFF_01.md](report/REPORT_P8_INTEGRATION_HANDOFF_01.md), không phải nghiệm thu consumer M4. Manual M2 giữ PASS — USER-CONFIRMED, Codex không trực tiếp chạy Swagger manual trong P8.

**Tác vụ M4/F12 cần bàn giao:** frontend hiện logout anonymous, khác hợp đồng M1. Khi tích hợp, sửa useSession/apiClient/auth và cache/profile, mock/UI docs/contract test để logout gửi access + refresh hiện hành cùng phiên. Dùng session coordinator: logging-out/single-flight, chặn tác vụ mới, chờ refresh đang chạy trong timeout hữu hạn rồi lấy cặp mới; access hết hạn thì refresh tối đa một lần và retry logout tối đa một lần. Không auto-refresh đệ quy mọi auth endpoint. Generation guard ngăn response token/profile cũ hồi sinh phiên sau cleanup; nhiều tab cần chính sách/kiểm thử riêng, một promise không giải quyết liên tab.

Đề xuất UI vẫn xóa token/profile local và về `/auth` khi kết thúc; chỉ xác nhận server thu hồi khi có response logout thành công đúng contract. Lỗi mạng/5xx/timeout hiển thị “Đã xóa phiên trên trình duyệt; chưa xác nhận được thu hồi phiên trên máy chủ.” Không giữ refresh để retry ngầm sau khi thông báo xóa phiên. Rotation có thể commit nhưng mất response nên không hứa luôn revoke được; không thêm logout-all để che giới hạn. Phân biệt auth failure với network failure, không coi redirect/mock 200 là bằng chứng revoke. Các thay đổi frontend/Event này chỉ là kế hoạch M4, không là gate M1–M3.

## 9. Chiến lược kiểm thử

### 9.1 Các lớp

1. Static: format/lint/typecheck/build cho từng ứng dụng.
2. Unit: policy role/scope, expiry, mapping lỗi; không chỉ test getter hoặc lặp lại implementation.
3. Integration với PostgreSQL thật: unique, transaction, rotation, lock OWNER, invitation races, idempotency, migration.
4. E2E qua Gateway: JWT/header trust, route, DTO, lỗi upstream và auth flows.
5. Contract/OpenAPI: shape/status/error/schema khớp spec; Swagger Try it out thực sự đi qua Gateway.
6. Messaging M3 với RabbitMQ thật: retry/replay/dedupe expectation.
7. Manual Swagger: người kiểm thử theo checklist, lưu bằng chứng đã che token/password.

Database test và Compose project test phải tách local demo, không reset volume người dùng. Không dùng mock DB để kết luận lock/transaction đúng. Unit time tests dùng clock điều khiển; cấu hình production vẫn giữ 15 phút/7 ngày.

### 9.2 Ma trận nghiệm thu

| ID | Mốc | Ca kiểm thử | Kết quả mong đợi |
|---|---|---|---|
| INF-01 | M1 | Compose trên môi trường sạch | Migrate thành công; DB, Identity, Gateway healthy |
| INF-02 | M1 | Restart không xóa volume | User/session/org vẫn còn |
| INF-03 | M1 | Seed chạy hai lần / chạy ngoài local | Không nhân bản / bị chặn |
| INF-04 | M1 | Env thiếu/secret không đạt validation lúc startup; riêng DB down sau startup | Đề xuất: startup exit khác 0 cho config sai; DB down thì readyz 503, healthz 200 khi process sống, DB hồi phục readyz 200; xem F11-INF-02/03 |
| AUTH-01 | M1 | Register hợp lệ | User mới; password_hash Argon2id |
| AUTH-02 | M1 | Email trùng khác hoa/thường và race register | Một user; request còn lại 409 |
| AUTH-03 | M1 | Login đúng/sai/user khóa | Token / 401 / 403 theo contract |
| AUTH-04 | M1 | Dữ liệu sai, field dư, JSON hỏng | 400 đúng envelope, không stack trace |
| JWT-01 | M1 | JWT hợp lệ gọi `/users/me` | Hồ sơ đúng user, memberships seed đúng |
| JWT-02 | M1 | Token bị sửa, sai claims/algorithm, hết hạn | 401; không gọi handler bảo vệ |
| JWT-03 | M1 | Client giả/trùng/lệch hoa thường header user/session, nhiều Authorization | Identity chỉ nhận sub/sid Gateway verify, không context giả/danh sách; nhiều Authorization bị từ chối trước handler (status cần freeze D02) |
| GW-01 | M1 | Gọi internal/path ngoài allowlist | Không proxy đến endpoint internal |
| GW-02 | M1 | Identity tắt/timeout | 502/504 và request ID đúng contract |
| SES-01 | M1 | Refresh rồi dùng lại token cũ | Token mới dùng được; token cũ 401 |
| SES-02 | M1 | Hai refresh đồng thời cùng token | Chỉ một thành công |
| SES-03 | M1 | Refresh sau hạn tuyệt đối | 401; rotation không kéo dài phiên |
| SES-04 | M1 | Login A/B, logout A | A không refresh được, B vẫn được |
| SES-05 | M1 | Logout bằng token phiên/user khác | Từ chối, không thu hồi phiên nạn nhân |
| SES-06 | M1 | Dùng access đã cấp sau logout | Hành vi đúng giới hạn đã tài liệu hóa, tối đa đến exp |
| ORG-01 | M2 | Tạo org, lỗi giữa transaction | Hoặc đủ org/member/OWNER, hoặc rollback toàn bộ |
| RBAC-01 | M2 | OWNER/ADMIN A thao tác B | 403 |
| RBAC-02 | M2 | ADMIN gán role | 403 |
| RBAC-03 | M2 | SPEAKER E1 đọc E1/E2 trong fixture | Allow E1, deny E2; không quyền ghi |
| RBAC-04 | M2 | Membership không ACTIVE; riêng permission lạ | Đề xuất: 200 allowed:false/NO_ACTIVE_MEMBERSHIP cho input hợp lệ; permission lạ 400 VALIDATION_FAILED, không allow |
| OWN-01 | M2 | Bỏ OWNER cuối cùng | 409, role giữ nguyên |
| OWN-02 | M2 | Hai OWNER đồng thời tự bỏ quyền | Sau commit vẫn còn ít nhất một OWNER |
| IDEM-01 | M2 | Retry cùng key/payload hoặc khác payload | Kết quả cũ không nhân bản / conflict |
| INV-01 | M2 | OWNER mời user tồn tại rồi user accept | Membership/assignment xuất hiện đúng một lần |
| INV-02 | M2 | Email chưa tồn tại/user đã là member | Lỗi đã định nghĩa, không tạo membership |
| INV-03 | M2 | User khác list/accept invitation | Không thấy lời mời người khác; accept bị từ chối |
| INV-04 | M2 | Invitation hết hạn/declined/revoked | Không tạo membership |
| INV-05 | M2 | Accept hai lần hoặc đồng thời revoke | Cùng key replay success; key mới sau ACCEPTED đề xuất 409 INVITATION_NOT_PENDING; race chỉ một trạng thái cuối, không duplicate/event mới khi replay |
| INV-06 | M2 | Inviter mất quyền, role/scope không hợp lệ | Accept bị từ chối |
| EVT-01 | M1/M2 | Commit/rollback register, create org, accept, replace theo trigger đã freeze | State và outbox/revision nguyên tử từ mutation đầu tiên; rollback không event, seed không event ngoài test chỉ định |
| EVT-02 | M3 | Broker down rồi up | Outbox còn, gửi lại được |
| EVT-03 | M3 | Crash sau publish trước mark sent | Có thể trùng cùng event ID; không tạo event ID mới |
| DOC-01 | Mỗi mốc | Người khác làm theo README/Swagger | Tái hiện được các luồng đã bàn giao |

**Trạng thái hiện tại:** M2 đã nghiệm thu theo [báo cáo tổng](report/REPORT_M2_ACCEPTANCE_01.md): tự động99 tests PASS; manual Swagger/DOC-01 PASS — USER-CONFIRMED. Các dòng trạng thái revision 2 dưới đây được cập nhật theo phần M2 có bằng chứng; phần M3/M4 vẫn NOT RUN.

**Quy ước tại thời điểm lập revision 2 (lịch sử):** mọi ca ở §9.2, kể cả bảng gốc trên, ban đầu NOT RUN; chưa có evidence runtime. Các bảng là tiêu chí REQUIRED của mốc tương ứng sau khi quyết định liên quan được freeze; ca nhiều tab M4 chỉ required nếu được đưa vào cam kết. Status/reason/code gắn “đề xuất” trong §5/§7 và bảng bổ sung chưa phải yêu cầu đã duyệt. Ca còn ghi “lỗi đã định nghĩa/theo contract” phải được điền status/body cụ thể trong OpenAPI trước gate; không chọn expected theo implementation tình cờ trả về.

Phương pháp cho bảng gốc: INF dùng process/Compose và PostgreSQL thật; AUTH/SES dùng integration PostgreSQL + E2E Gateway và clock điều khiển; JWT/GW dùng HTTP E2E với upstream ghi nhận context; ORG/RBAC/OWN/IDEM/INV dùng DB thật, hai connection/barrier cho race và E2E; EVT dùng DB transaction/worker/broker test tùy mốc; DOC do người nhận tái hiện runbook. Mỗi ca phải ghi input/fixture, expected/actual, snapshot DB hoặc HTTP/log đã che nhạy cảm, version, môi trường và lệnh/bước; tất cả đều NOT RUN cho tới khi có kết quả. Mọi mutation bị từ chối/rollback không được để lại thay đổi nghiệp vụ, success idempotency hoặc outbox không tương ứng. Fault injection chỉ trên project/volume test riêng khi được giao triển khai, không chạy trong phiên sửa tài liệu.

**Ca bổ sung F01–F14** (AC-xxx dưới đây giữ liên kết tới cùng ID trong review, không thay thế các ca gốc):

| ID / mốc | Điều kiện và trigger | Expected / tác động bị cấm | Phương pháp và bằng chứng | Trạng thái |
|---|---|---|---|---|
| AC-001 / M1 / F01 | A/B cùng user; access A + refresh B; giả/trùng header | Đề xuất 401 cho cặp lệch, A/B không đổi; header client không đổi verified context; access A + refresh A revoke chỉ A | E2E Gateway + upstream capture an toàn + session DB trước/sau | NOT RUN |
| AC-002 / M1→M3 / F02 | Register M1, org/member M2 khi worker tắt; nâng cấp rồi bật worker M3; lỗi giữa transaction | Pending đủ event từ commit đầu tiên, rollback không event; upgrade giữ backlog, M3 phát payload gốc cùng ID; seed không phát ngoài test chỉ định | DB integration, fault injection transaction, migration upgrade và worker/broker test cô lập | PASS phần DB/outbox M1/M2; worker M3 NOT RUN |
| AC-003 / M2 / F03 | Duyệt từng dòng input/result §7.2; OWNER A/E1, org B/E2, SPEAKER E1, ATTENDEE | 400 validation tách 200 deny; allow đúng permission/scope; E1 không lan E2/toàn org; outage không allow | Table-driven contract test + DB fixture + caller stub không mutation khi deny/outage | PASS tự động — báo cáo P5/P6 |
| AC-004 / M2 / F04 | Cùng key/target/body; đổi target/body; khác actor/operation; race; crash trước/sau commit; mất quyền; TTL/cleanup | Replay success đúng trong TTL khi được phép; khác target/body 409, không success giả; một mutation commit với đúng tập event theo trigger; rollback sạch; không cache trái phép; expiry theo policy freeze | Hai connection PostgreSQL/barrier, clock điều khiển, fault injection trước/sau commit; đếm record/state/outbox | PASS tự động — báo cáo P5/P6 |
| AC-005 / M2 và M4 / F05 | ORG thật; EVENT thiếu resolver, wrong org/not found/response sai/timeout; DRAFT hợp lệ | Fail closed không partial assignment/invitation accept; đề xuất 409/403/404/502/504 theo §7.2; M4 đúng org + quyền mới ghi | M2 fixture adapter tách config; M4 provider Event thật + trace không vòng gọi; báo cáo riêng hai phạm vi | PASS M2 fixture/fail closed; Event thật M4 NOT RUN |
| AC-006 / M2 / F06 | Ép cả hai thứ tự hạ actor/gán role, hạ inviter/accept; hai OWNER tự hạ; accept/revoke/decline; expiry khi chờ | Quyền bị hạ trước thì từ chối, mutation commit trước được giữ; không zero OWNER/duplicate; hết hạn sau chờ không accept; rollback không event | Hai connection PostgreSQL + barrier; đối chiếu quyền, invitation, revision, idempotency/outbox sau commit | PASS tự động — báo cáo P5/P6 |
| AC-007 / M1/M2 / F07 | DB sạch; insert orphan/trùng email/role/ORG NULL/EVENT; seed hai lần; upgrade DB có dữ liệu | Constraint chặn sai/trùng; 4 role/10 permission; scope mapping đúng, seed không nhân; upgrade không reset user/session/org | Integration PostgreSQL thật + kiểm migration SQL/index/FK có tên + dữ liệu trước/sau | PASS tự động — báo cáo P5/P6 |
| AC-008 / M3 / F08 | Đúng binding; không còn binding; queue khác nhận; restore; NACK/timeout/channel lỗi; crash sau confirm; hai attempt song song một return | Chỉ SENT đúng điều kiện §P7; return+ACK không SENT; phát hiện thiếu queue đích dù ACK; retry cùng ID; không ghép nhầm attempt | Broker test riêng, assert queue đích, return/confirm trace và outbox; reclaim/DB lỗi mark SENT test | NOT RUN |
| AC-009 / M3 / F09 | Baseline persistent đã confirm chưa consume; lần lượt restart/recreate/down-up giữ volume/node/image; publish sau phục hồi | Đọc được cùng event ID và queue/binding; không chỉ healthy/queue rỗng; event mới route được; pending retry giữ ID | Compose project/volume riêng, fixture mới từng ca, ghi mount/node/image/project và message IDs; không xóa volume | NOT RUN |
| AC-010 / M2/M3 / F10 | Create org/accept/replace/no-op/replay/rollback; schema thiếu/sai field; delivery revision 6 trước 5, duplicate/conflict | Trigger/revision đúng contract F10; schema validator từ chối payload sai; không role cũ hồi sinh; cùng revision khác state/cùng ID khác payload bị phát hiện | M2 DB + schema test; M3 broker + test projection harness, không thêm consumer MUST; schema version không tăng theo mutation | PASS producer/schema/transaction M2; delivery/projection M3 NOT RUN |
| AC-011 / M1/M2 / F11 | Chạy từng trường hợp F11 bên dưới | HTTP/body và invariant cụ thể như bảng, không gộp config fail với readiness hoặc replay với lệnh mới | Integration/contract/E2E theo từng dòng; không coi mock là backend | PASS tự động — báo cáo P5/P6 |
| AC-012 / M4 / F12 | Logout access còn/hết hạn, refresh đang chạy, bấm lặp/request 401, lỗi mạng/5xx/mismatch, mất response sau commit | Một refresh tối đa/một retry logout; cặp mới cùng sid; không hồi sinh local session; A revoked khi server xác nhận, B còn dùng; lỗi chỉ báo chưa xác nhận | Browser + API E2E backend thật, response delay/fault và DB/session API; kiểm UI cleanup/generation/retry count; nhiều tab theo phạm vi đã chốt | NOT RUN |
| HANDOFF-01 / mỗi mốc / F13 | Bên nhận lấy H01–H05 và tái hiện phần được bàn giao | Tìm được version contract/runbook hoặc stub có giới hạn; provider thật và fixture tách biệt; thiếu chủ/lịch ghi chưa chốt, không giả đã hoàn tất | Review artifact/liên kết + bên nhận thực hiện runbook ở mốc có backend; evidence tại handoff | PASS M2 người dùng tái hiện; service integration M4 NOT RUN |
| DEC-01 / P0 mỗi mốc / F14 | Kiểm D tương ứng trước công đoạn phụ thuộc | Có nguồn quyết định, artifact/version và test/evidence; đề xuất chưa ACCEPTED/FROZEN ngầm; số đo Argon2 chỉ baseline khi chưa SLA | Review sổ D00–D13 và evidence, đối chiếu catalog/spec/ADR theo mốc | PASS quyết định M2 ADR 0003/0004; các mốc sau xét riêng |

**Chi tiết F11 — các giá trị mới là đề xuất D03/D08:**

| ID / mốc | Điều kiện và trigger | Expected cụ thể và invariant | Phương pháp | Trạng thái |
|---|---|---|---|---|
| F11-AUTH-01 / M1 | User đã login, fixture chuyển LOCKED; refresh còn hạn | 403 FORBIDDEN; không cấp token/rotation hash. Token invalid vẫn 401 | DB fixture + Gateway E2E | NOT RUN |
| F11-AUTH-02 / M1 | User LOCKED sau cấp access, gọi users/me | 403 FORBIDDEN; không profile/memberships; chỉ cam kết Identity M1 | DB fixture + Gateway E2E | NOT RUN |
| F11-SES-01 / M1 | A/B cùng user, access A + refresh B logout | 401 UNAUTHENTICATED, không đổi session, B vẫn refresh được | E2E và DB trước/sau | NOT RUN |
| F11-SES-02 / M1 | Logout A rồi lặp cùng cặp chứng minh phiên, access còn hạn | 200 `{status:"OK"}`, giữ revoked_at đầu tiên; không chấp nhận refresh tùy ý/token đã rotation | E2E + so session/hash/revoked_at | NOT RUN |
| F11-SES-03 / M1 | Access hết hạn, refresh còn hạn; logout→refresh→logout cặp mới | 401 lần đầu không mutate; refresh 200, logout 200 OK; giữ sid/hạn tuyệt đối, refresh cũ không dùng lại | Clock điều khiển + E2E/session DB | NOT RUN |
| F11-INV-01 / M2 | Accept commit, retry cùng key/target/body còn TTL và quyền hợp lệ | Replay success status/body đã lưu; một membership/tập event, revision không tăng | HTTP + DB/idempotency/outbox | PASS tự động — báo cáo P5/P6 |
| F11-INV-02 / M2 | Accept commit rồi accept bằng key mới | 409 INVITATION_NOT_PENDING; không đổi role/member/event | HTTP + DB | PASS tự động — báo cáo P5/P6 |
| F11-INF-01 / M1→M2 | User/session còn hạn/org seed trên schema M1, migrate M2 | Exit 0, schema đúng version; ID/count/hash/status/hạn giữ nguyên, refresh phiên cũ hoạt động | Upgrade PostgreSQL test riêng; snapshot trước/sau, không reset | PASS tự động — báo cáo P5/P6 |
| F11-INF-02 / M1 | Start thiếu env hoặc secret sai validation | Exit khác 0, không ready; log chỉ tên cấu hình lỗi không secret | Process/config test dữ liệu giả | NOT RUN |
| F11-INF-03 / M1 | Sau startup, DB down rồi phục hồi | healthz 200 khi process sống; readyz 503→200; không lộ DSN, không giả depends_on tự restart ứng dụng | DB fault riêng, probe hữu hạn theo config ghi trong evidence | NOT RUN |
| F11-GW-01 / M1 | Access hợp lệ, Identity mất kết nối | 502 UPSTREAM_UNAVAILABLE với request ID; không lộ stack/DSN, không biến thành deny | HTTP E2E/upstream fixture | NOT RUN |
| F11-GW-02 / M1 | Upstream trả chậm hơn timeout cấu hình | 504 UPSTREAM_TIMEOUT; chờ hữu hạn, cùng request ID, không retry key mới/khẳng định chưa commit | Slow upstream fixture + đo timeout theo config | NOT RUN |
| F11-API-01 / M1 | Bốn auth POST hợp lệ qua Gateway | 200; register user_id, login/refresh token pair + expires_in 900, logout status OK; đúng schema, không hash/password | OpenAPI contract test + E2E provider thật | NOT RUN |

Success status/body M2 chưa đủ để freeze: create org, create invitation, list, accept, decline, revoke, replace phải được hoàn thiện trong OpenAPI theo D05/D08 trước handler. Các ca INV-02/03/04/06 phải cụ thể hóa lỗi tương ứng khi đó; trạng thái hiện là NOT RUN, không biến khoảng trống contract thành PASS. Kiểm F11-SES-02 phải chốt thời hạn giữ bằng chứng retry session trước khi test purge/expiry.

### 9.3 Kiểm tra hiệu năng và độ ổn định

- Đo login/verify Argon2 theo batch tuần tự và đồng thời; ghi CPU/RAM container, p50/p95, error rate và cấu hình máy.
- Kiểm tra refresh/logout/org mutations dưới tải vừa phải và race có chủ đích; ưu tiên invariant hơn số request/giây.
- Chưa có SLA hiệu năng được người dùng chốt; không tự tuyên bố đạt production từ một số đo local. Ghi baseline và vấn đề blocking nếu lỗi/timeout có thể tái hiện ở tải demo dự kiến.

## 10. Swagger và kịch bản kiểm thử thủ công

Đề xuất Gateway cung cấp `/docs` và `/docs-json` ở local. Swagger public mô tả route `/api/...`; internal API kiểm thử trong mạng test hoặc tài liệu riêng, không expose qua public proxy. Bật Swagger bằng cấu hình môi trường rõ ràng.

Kịch bản M1:

1. Khởi động theo README; xem health và migration status.
2. Register user mới; thử đăng ký lại để thấy 409.
3. Login lấy token, nhập access token vào Authorize.
4. Gọi `/api/users/me`, đối chiếu user vừa tạo.
5. Login lần nữa để có phiên B, lưu token tạm trong API client riêng.
6. Refresh phiên A, xác nhận refresh cũ không dùng lại được.
7. Logout A bằng access/refresh hiện tại, kiểm tra B vẫn refresh được.
8. Gọi bằng access sai/hết hạn và giả header user khác; đối chiếu lỗi.
9. Restart container giữ volume, login và kiểm tra dữ liệu còn.

Kịch bản M2: OWNER A mời khách → đăng nhập khách → list invitations → accept → `/users/me` có org A → thử quyền được gán; thử OWNER A truy cập B; hạ một trong hai OWNER rồi thử hạ OWNER cuối cùng.

Không ghi token thật vào báo cáo/commit. Chụp hoặc trích response đã che dữ liệu nhạy cảm, lưu request ID khi có lỗi.

## 11. Đánh giá kết quả trước bàn giao

### 11.1 Quy tắc đánh giá

- Mỗi ca đánh dấu **PASS / FAIL / BLOCKED / NOT RUN**, kèm commit, môi trường, lệnh/bước chạy và bằng chứng.
- NOT RUN và BLOCKED không được tính là PASS; build pass không thay thế integration/E2E.
- Lỗi giả mạo danh tính, truy cập chéo org, lộ password/token, mất OWNER cuối cùng, nhân bản membership/session do race là lỗi chặn bàn giao mốc liên quan.
- M1 cần toàn bộ ca M1 bắt buộc PASS; M2/M3 tương tự. Ca M4 chưa chạy phải nằm trong danh sách trì hoãn, không làm sai phạm vi M1.
- Event scope test bằng fixture chỉ chứng minh thuật toán scope; E2E Event thật là gate bổ sung ở M4.
- Kết luận chỉ dùng “đạt mốc Mx” khi đủ bằng chứng; không ước lượng phần trăm từ số file tạo ra.

### 11.2 Mẫu báo cáo

```text
Mốc / commit:
Ngày, người kiểm thử:
Phiên bản công cụ và cấu hình môi trường:
Migration/seed đã chạy:
PASS / FAIL / BLOCKED / NOT RUN:
Các ca thất bại và bước tái hiện:
Bằng chứng test tự động, Swagger, container health:
Số đo hiệu năng và giới hạn:
Thay đổi contract:
Rủi ro, công việc hoãn:
Kết luận: đạt / chưa đạt mốc, lý do:
```

## 12. Checklist bàn giao

Checklist dưới đây đã đạt cho phạm vi **M2 local API**, nguồn [nghiệm thu M2](report/REPORT_M2_ACCEPTANCE_01.md). Hướng dẫn recovery không đồng nghĩa đã chạy production backup/restore; integration Event/frontend/worker ở mốc sau.

**F13/F14 — nơi cập nhật:** tiến độ/chủ việc/người nhận/ngày hẹn/version/PR và dependency cập nhật duy nhất tại [identity-handoff](../../docs/integration/identity-handoff.md), H01–H05 ở §2; quyết định D00–D13 và evidence ở [§6](../../docs/integration/identity-handoff.md#p0-decisions). Kế hoạch chỉ định phạm vi và gate, không sao chép bảng tiến độ. H01 auth/context giao Gateway/frontend theo M1; H02 authorization giao Event và service cần check trước handler M2, không đợi M3; H03 resolver giao Identity–Event trước M4; H04 schema ghi event theo M1/M2, delivery M3; H05 runbook/API thật/evidence giao từng mốc.

Contract API M2 cập nhật catalog và canonical `shared/contracts/http/identity.openapi.json` v1.2.0; Gateway `shared/contracts/http/gateway.openapi.json` là projection, types sinh trong `shared/contracts/http/generated/identity.d.ts`. Các path OpenAPI trong `docs/api/` ở kế hoạch gốc không phải artifact authority hiện tại; Event spec thật vẫn thuộc M4. Shape event nằm ở [event contracts](../../shared/contracts/events/README.md); JSON Schema versioned và `docs/api/messaging.md` cần tạo khi freeze. Runbook ở README service; kết quả thực thi ở báo cáo mốc rồi liên kết vào handoff. Tách contract DRAFT/IN_REVIEW/FROZEN, implementation NOT_STARTED/IN_PROGRESS/IMPLEMENTED, integration NOT_RUN/PASS/FAIL/BLOCKED; cập nhật tài liệu không tự nâng hai trục sau. Không tự gán người/deadline hoặc biến mốc thành tuần chung của nhóm.

- [x] Source Identity/Gateway có build, format/typecheck và test scripts tái lập.
- [x] Migration có lịch sử, seed local rõ ràng; không cần sửa DB bằng tay.
- [x] Compose chạy mốc tương ứng; env example không chứa secret thật; không xóa volume để khởi động lại.
- [x] README có cài đặt, build, start/stop/restart, migration, seed, test và xử lý lỗi thường gặp.
- [x] Swagger/OpenAPI đúng với API thực, có Bearer auth và ví dụ lỗi.
- [x] Bộ test và kết quả theo ma trận, bao gồm negative/race cases.
- [x] Contract API, role/scope, token/session, invitation và event đã cập nhật theo mốc.
- [x] Tài liệu nêu rõ logout không thu hồi JWT tức thời, fixture event scope và phần chưa tích hợp.
- [x] Hướng dẫn khôi phục: backup trước migration có dữ liệu, rollback image nếu schema tương thích hoặc forward-fix; không mặc định migration down an toàn.
- [x] Không chứa secret, token, password rõ của user thật hoặc thay đổi frontend ngoài phạm vi.
- [x] Báo cáo đánh giá chỉ rõ mốc hoàn thành và tồn đọng, người dùng xác nhận tái hiện hướng dẫn (DOC-01); không tự gán tester khác.

## 13. Công việc để sau và quyết định mở

- Frontend dùng API thật, giao diện lời mời, xử lý refresh đồng thời từ trình duyệt: M4.
- Event Service xác thực quan hệ event/org và sử dụng authorization check: M4.
- Email invitation cho user chưa có tài khoản, thông báo trong ứng dụng qua Notification: mở rộng sau.
- Logout mọi thiết bị, thu hồi access tức thời, token-family reuse detection, MFA, reset password và verification email: chưa thuộc các mốc đã chốt.
- Organization custom roles, xóa tổ chức/thành viên, chuyển quyền OWNER bằng luồng riêng: chưa yêu cầu; nếu thêm phải giữ invariant OWNER.
- Quyết định kỹ thuật P0 còn mở theo [D00–D13](../../docs/integration/identity-handoff.md#p0-decisions): D01/D13 phiên bản và baseline Argon2; D02/D03 context/session retention/status/health; D05 permission-resource và input/result; D06 TTL/replay/timeout; D07 DDL/mapping/khóa; D08 invitation expiry/DTO/lỗi; D09 resolver; D10/D11 delivery/storage; D12 event snapshot/trigger/revision. D00 không hỏi lại; D04 outbox M1 đã ghi vào kế hoạch revision này nhưng catalog/artifact triển khai còn phải đồng bộ.

Không cần hỏi lại các quyết định người dùng đã chốt. Nếu trong triển khai xuất hiện lựa chọn làm thay đổi nghiệp vụ/phạm vi, nêu tác động và xác minh riêng; các chi tiết kỹ thuật thông thường được xử lý trong phạm vi được giao. Đề xuất ở kế hoạch phải có nguồn chốt/artifact tương ứng trước freeze, không chuyển thành yêu cầu đã duyệt chỉ vì đã bổ sung ma trận test. Sẵn sàng hiện tại: M2 COMPLETE theo báo cáo nghiệm thu; P7/M3 là bước tiếp theo, cần chốt contract delivery/storage trước implementation phụ thuộc. Event thật/frontend thuộc M4; không tự bắt đầu các mốc này.
