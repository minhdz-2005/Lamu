# Rà soát MASTER_PLANT.md — REVIEW_MASTER_PLAN01

- Ngày: 12/11/2026, múi giờ Asia/Saigon.
- Cập nhật đề xuất F01–F08: 13/11/2026; rà lại nội dung thực tế trong file và bổ sung các bảng/luồng chi tiết còn thiếu. Báo cáo đánh số từ F01, không có F00 riêng.
- Phương pháp: `ecc:intent-driven-development`, nhánh Existing Specification Review; bổ sung tiêu chí nghiệm thu theo Full Acceptance Brief.
- Trạng thái: hoàn tất rà soát tĩnh; các tiêu chí bổ sung là đề xuất, chưa được thực thi hoặc nghiệm thu.
- Đối tượng: toàn bộ 440 dòng của [MASTER_PLANT.md](../MASTER_PLANT.md).
- Mốc Git tham chiếu: `cf58fa39aeef45be0e6085c51d23cc9fc8b4ee37`. Kế hoạch đang là file chưa được Git theo dõi tại thời điểm kiểm tra; nội dung review là bản trong working tree, không phải nội dung đã có trong commit này.
- Thay đổi được phép: chỉ tạo báo cáo này. Không chỉnh kế hoạch, cấu hình, source, dependency hoặc migration.

## 1. Kết luận đánh giá

Kế hoạch đủ cơ sở để bắt đầu P0 và thiết kế bộ khung. Chưa đủ để đóng băng toàn bộ contract hoặc nghiệm thu bất kỳ mốc chạy thực tế nào. Identity/Gateway hiện chỉ có tài liệu và thư mục; chưa có ứng dụng backend, migration, Dockerfile hay bộ test thực thi tại hai khu vực này.

Phát hiện **14 vấn đề: 2 blocker theo mốc, 10 cần sửa, 2 đề xuất**. “Blocker” ở đây là quyết định/hợp đồng phải đóng trước công đoạn phụ thuộc; không có nghĩa phải dừng mọi việc chuẩn bị. Các phát hiện về triển khai được diễn đạt là rủi ro hoặc khoảng trống đặc tả, không phải lỗi runtime đã tái hiện.

| Mốc | Sẵn sàng triển khai | Điều kiện trước phần việc phụ thuộc | Sẵn sàng nghiệm thu |
|---|---|---|---|
| M1 | Có điều kiện: bắt đầu P0/bộ khung được | Đóng F01 về nguồn `sid` tin cậy; cụ thể hóa contract và các ca bổ sung F07/F11 | Chưa; không có backend hoặc bằng chứng chạy test |
| M2 | Có điều kiện, phụ thuộc M1 | Chốt contract RBAC, phạm vi event fixture, idempotency và thứ tự khóa tại F03–F07 | Chưa; chỉ được tuyên bố phạm vi local/fixture đã kiểm chứng, không phải tích hợp Event thật |
| M3 | Chưa nên đóng băng thiết kế phát sự kiện | Đóng F02 về thời điểm bắt đầu bảo đảm event; xử lý F08–F10 về delivery, lưu trữ và schema | Chưa; broker/outbox/schema validation chưa có bằng chứng thực thi |
| M4 | Chỉ có định hướng | Contract với Event và kế hoạch chuyển frontend còn phải hoàn thiện; lưu ý F12–F13 | Ngoài đợt triển khai Identity/Gateway hiện tại |

## 2. Phạm vi, nguồn và giới hạn bằng chứng

### 2.1 Nguồn đã đối chiếu

- [Kế hoạch](../MASTER_PLANT.md), đủ §1–§13.
- [Kiến trúc](../../../docs/architecture.md), gồm quyết định, MUST/STRETCH, schema, RBAC, lộ trình và nghiệm thu; [ADR database-per-service](../../../docs/adr/0001-database-per-service.md).
- [API catalog](../../../docs/api/catalog.md), gồm quy ước danh tính/idempotency và API Identity; [RBAC flow](../../../docs/diagrams/rbac-flow.md).
- [Event contracts](../../../shared/contracts/events/README.md), [hợp đồng tích hợp](../../../shared/contracts/README.md), tài liệu messaging Identity và RabbitMQ.
- [Compose](../../../docker-compose.yml), `.env.example` và tài liệu Gateway/Identity về source, auth, config, tests, migrations.
- Phần Identity của [mock route](../../../frontend/src/app/api/[...path]/route.ts), auth/session/RBAC trong [mock store](../../../frontend/src/mock/store.ts).
- [API client](../../../frontend/src/lib/apiClient.ts), [session hook](../../../frontend/src/lib/useSession.ts), [auth storage](../../../frontend/src/lib/auth.ts), types và quy ước UI/auth.

Đây là kiểm tra tài liệu, cây file và source liên quan. Không chạy build/test backend, Compose, migration, HTTP probe, test bảo mật hay tải; không có môi trường backend để tuyên bố PASS. Không đánh giá toàn bộ nghiệp vụ Event/Payment/Registration ngoài các ranh giới tích hợp liên quan Identity.

### 2.2 Sự thật kỹ thuật và yêu cầu nghiệp vụ

**Sự thật từ repo:** Compose có năm PostgreSQL và RabbitMQ; chưa khai báo ứng dụng Identity/Gateway; Identity/Gateway hiện là scaffold tài liệu. Mock lưu user trong RAM, so sánh password trực tiếp, access token không phải JWT; các cơ chế này không phải backend thật. `docs/api/messaging.md` chưa tồn tại; thư mục event contract được kiểm tra chỉ có README, chưa có JSON Schema thực thi.

**Yêu cầu do tài liệu kế hoạch cung cấp:** NestJS/TypeScript, HS256, access 15 phút, refresh 7 ngày, logout phiên hiện tại, nhiều OWNER và không mất OWNER cuối cùng, lời mời user đã tồn tại, Swagger trước frontend. Review giữ nguyên các quyết định này, không suy lại nghiệp vụ từ mock.

**Chưa phải quyết định đã chốt:** Prisma, tham số Argon2id khởi điểm, expiry lời mời 7 ngày, tên routing/exchange và một số error code đều được kế hoạch ghi là đề xuất. Không coi chúng là yêu cầu đã được người dùng duyệt. Phiên bản dependency tương thích và hiệu năng vẫn phải xác minh tại P0; review không xác nhận một bộ phiên bản cụ thể.

## 3. Những phần hợp lý nên giữ

- Tách M1–M4 và không đánh đồng M1 với toàn bộ Identity; giao diện lời mời và Event thật được hoãn rõ.
- Giữ database riêng, không FK chéo service, Gateway không sở hữu nghiệp vụ.
- Auth có refresh rotation nguyên tử, hạn tuyệt đối và nhiều phiên; ghi rõ giới hạn JWT sau logout.
- RBAC kiểm tra membership ACTIVE và resource scope; có quy tắc khóa organization để bảo vệ OWNER cuối cùng.
- Invitation accept có transaction, dữ liệu role lấy từ server, đã xét wrong recipient và accept/revoke race.
- Kiểm thử PostgreSQL/RabbitMQ thật, phân biệt fixture với tích hợp, không tính NOT RUN/BLOCKED là PASS.
- Seed local có guard, migration không reset dữ liệu và bằng chứng bàn giao phải che token/password.

Thiếu ứng dụng, lockfile backend, OpenAPI và migration ở hiện trạng là công việc tương lai đã được kế hoạch thừa nhận; không tự coi mỗi artifact chưa có là một phát hiện blocker riêng.

## 4. Phát hiện chi tiết

### F01 — Blocker M1: chưa có hợp đồng truyền `sid` tin cậy tới Identity

- **Vị trí:** kế hoạch §4 dòng 85, §5.1 dòng 102–107, P4 dòng 261; API catalog §0 dòng 12 và logout dòng 30.
- **Bằng chứng:** logout phải đối chiếu cả `sub` và `sid`; Gateway được mô tả chỉ tự gán `X-User-Id`. Catalog nói service không tự verify chữ ký và chỉ nêu chuyển tiếp `Authorization`, `X-User-Id`, `X-Request-Id`; chưa có field phiên do Gateway xác minh.
- **Tác động:** kiểm tra user ID không phân biệt được hai phiên của cùng user. Nếu Identity chỉ decode JWT hoặc tin header phiên client cung cấp thì chưa đáp ứng ranh giới tin cậy. Đây là thiếu contract, chưa phải bằng chứng handler đang sai.
- **Đề xuất sửa:** tại P0 chọn và ghi rõ một cách lấy verified session context. Phù hợp kiến trúc hiện tại là Gateway ghi đè một header phiên nội bộ từ `sid` đã verify, Identity chỉ dùng context đó trong network local được chấp nhận. Nếu chọn Identity tự verify JWT, phải cập nhật quyết định catalog thay vì thực hiện ngầm. Quy định cả header trùng/lệch hoa thường và không forward giá trị danh tính do client đặt.

**Luồng thực hiện đề xuất F01:**

| Bước | Trách nhiệm / kết quả |
|---|---|
| Login tại Identity | Tạo refresh session; access JWT có `sub = users.id`, `sid = refresh_sessions.id`. Rotation giữ session ID và hạn tuyệt đối, thay token hash. |
| Gateway verify | Kiểm chữ ký, HS256, issuer/audience/expiry và định dạng sub/sid; sai thì 401, không forward route bảo vệ. |
| Tạo request upstream | Dùng allowlist header; tự gán `X-User-Id = sub`, `X-Session-Id = sid`, `X-Request-Id` đã chuẩn hóa. Không copy header danh tính client, bất kể hoa/thường; không chuyển giá trị trùng/danh sách. Từ chối nhiều Authorization; public auth route không forward context client tự khai. |
| Identity logout | Context nội bộ phải có một user ID và một session ID hợp lệ. Trong transaction tìm/khóa session theo hash refresh token, đối chiếu cả user ID và session ID rồi mới revoke. Không lấy sid từ body hoặc chỉ decode JWT chưa verify. |
| Giới hạn tin cậy | Chỉ Gateway expose cổng ứng dụng ra host; Identity ở network local được tin cậy. Header không tự xác thực nguồn gửi; khi ra ngoài local phải thiết kế xác thực service-to-service. |

Kiểm chứng: access A + refresh A thành công, access A + refresh B cùng user bị từ chối và B còn dùng được; header giả/trùng không đổi context; JWT sai/hết hạn bị chặn. Tên header là đề xuất cần đưa vào catalog/OpenAPI, không phải endpoint đã triển khai.

- **Điều kiện đóng:** access A + refresh B của cùng user bị từ chối, B không bị thu hồi; giả header phiên không đổi được kết quả. Liên kết AC-001.

### F02 — Blocker trước khi freeze M3: chưa chốt phạm vi sự kiện trước lúc bật outbox

- **Vị trí:** kế hoạch §6.1 dòng 155–157, P7 dòng 290–296; catalog dòng 27, 32, 35.
- **Bằng chứng:** M1 tạo user và M2 tạo org/thay membership, trong khi outbox có thể tới M3 mới thêm. Catalog đã gắn ba thao tác với ba event Identity; P7 lại yêu cầu không mất sự kiện đã commit nhưng chưa xác định mốc bắt đầu bảo đảm.
- **Tác động:** row outbox thêm sau không tự tái tạo được lịch sử role đã bị thay thế. Không rõ M3 chỉ bảo đảm mutation mới hay còn phải tái hiện dữ liệu M1/M2. Chưa có consumer MUST không tự giải quyết câu hỏi lịch sử/replay này.
- **Đề xuất sửa:** chốt phạm vi bảo đảm. Nếu cần giữ event ngay từ mutation đầu tiên, thêm outbox và ghi transaction từ mốc tạo mutation, worker có thể bật M3. Nếu chỉ bảo đảm từ M3, ghi thời điểm/cutover rõ trong catalog và nghiệm thu; dữ liệu cũ nếu cần thì có quy trình snapshot/backfill riêng, không giả là lịch sử event gốc. Chốt phương án sau đây Outbox được tạo và ghi cùng transaction nghiệp vụ từ M1. M2 bổ sung các event organization/membership. M3 triển khai worker publish, confirm, retry và kiểm thử RabbitMQ. Bảo đảm lưu event áp dụng từ mutation nghiệp vụ đầu tiên; seed demo không phát event, trừ khi chạy kịch bản kiểm thử được chỉ định.

**Phân bổ thực hiện theo phương án đã ghi trong file:**

| Mốc | Công việc / bảo đảm |
|---|---|
| M1 | Migration tạo outbox; register ghi user và `UserRegistered` trong cùng transaction. Rollback không để lại một trong hai; event chưa publish nằm chờ. |
| M2 | Ghi `OrganizationCreated`/`MembershipChanged` cùng transaction mutation tương ứng; freeze bảng trigger để tránh event thiếu/trùng khi tạo org và accept invitation. |
| M3 | Worker publish backlog và event mới, xử lý confirm/return/retry theo F08, storage theo F09. Retry giữ event ID/message ID. |
| Seed / dữ liệu cũ | Seed demo không phát event ngoài kịch bản chỉ định. Không tái tạo lịch sử role từ trạng thái hiện tại; nếu trước lúc áp dụng đã có dữ liệu không outbox thì ghi rõ khoảng trống và quyết định snapshot/backfill riêng khi cần. |

Đây là quyết định được ghi ở báo cáo, chưa tự cập nhật MASTER_PLANT/catalog hoặc tạo migration. Cần đồng bộ §6.1/P1/P2 của kế hoạch với phương án outbox từ M1 trước triển khai. Test upgrade M1→M2→M3 không reset dữ liệu, mutation commit có event trong phạm vi bảo đảm và rollback không có event.

- **Điều kiện đóng:** có quyết định bằng văn bản, test upgrade giữ dữ liệu và test mutation qua ranh giới cutover; không bắt buộc hồi tố nếu phạm vi đã chọn không yêu cầu. Liên kết AC-002.

### F03 — Cần sửa M2: thiếu bảng đầu vào hợp lệ và kết quả của authorization/check

- **Vị trí:** kế hoạch §7.2 dòng 187–198; catalog dòng 36; RBAC flow.
- **Bằng chứng:** catalog cho phép thiếu `organization_id`, `resource_type`, `resource_id`; kế hoạch liệt kê các field nhưng chưa quy định trường bắt buộc theo ORG/EVENT, biểu diễn ORG assignment hoặc tổ hợp bị từ chối.
- **Tác động:** consumer và Identity có thể hiểu khác nhau về quyền kế thừa, thiếu scope, permission lạ, hoặc trả 400 so với `{allowed:false}`. Đây là đặc tả điểm chốt quyền, cần ổn định trước khi Event tích hợp.
- **Đề xuất sửa:** bảng quyết định cho ORG/EVENT, field bắt buộc, nguồn org tin cậy, trạng thái user/membership và kết quả khi input sai. Tách validation lỗi cấu trúc với deny hợp lệ. Không cho thiếu event ID rơi về quyền đọc toàn org.

**Đầu vào đề xuất — chưa freeze contract:**

| Field | Scope ORG | Scope EVENT |
|---|---|---|
| `user_id` | UUID bắt buộc | UUID bắt buộc |
| `organization_id` | UUID org đích, bắt buộc | UUID org sở hữu event do service tin cậy resolve, bắt buộc |
| `resource_type` | Bắt buộc `ORG` | Bắt buộc `EVENT` |
| `resource_id` | Bắt buộc bằng organization_id | Bắt buộc là event UUID |
| `permission` | Một trong 10 mã seed, hợp lệ trên ORG | Một trong 10 mã seed, hợp lệ trên EVENT |

Cần freeze bảng permission → loại resource: ví dụ `org.member.read` và `event.create` trên ORG; `event.read` có thể trên ORG hoặc EVENT theo use case. DTO kiểm quyền ORG có resource ID không bắt buộc cách lưu assignment trong DB cũng giống hệt DTO; mapping tại F07.

| Trường hợp | HTTP / kết quả đề xuất | Yêu cầu |
|---|---|---|
| Thiếu field, UUID sai, scope lạ, ORG resource_id lệch org, EVENT thiếu ID | `400 VALIDATION_FAILED` theo error envelope | Không fallback mở rộng scope |
| Permission lạ hoặc không hợp lệ với loại resource | `400 VALIDATION_FAILED` | Không tự định nghĩa permission mới |
| User không tồn tại / LOCKED | `200 {allowed:false, reason: USER_NOT_FOUND / USER_LOCKED}` | Không cấp quyền từ dữ liệu role cũ |
| Không có membership ACTIVE ở org đích | `200 {allowed:false, reason: NO_ACTIVE_MEMBERSHIP}` | Không lấy quyền ở org khác |
| OWNER/ADMIN có quyền trên org/resource đích | `200 {allowed:true, reason: PERMISSION_GRANTED}` | ADMIN không có org.member.manage |
| Có membership nhưng thiếu permission/scope | `200 {allowed:false, reason: PERMISSION_DENIED}` | OWNER A không tự có quyền B; SPEAKER E1 không đọc E2/toàn org hoặc ghi event |
| ATTENDEE không có permission quản trị | `200 {allowed:false, reason: PERMISSION_DENIED}` | Không suy quyền từ sở hữu vé |
| Identity/DB lỗi hoặc caller timeout | Lỗi hạ tầng theo contract, không phải allow | Caller không thực hiện mutation khi chưa có allow hợp lệ |

Reason là tên đề xuất, không phải error code đã duyệt. Thứ tự đánh giá: validation → trạng thái user → membership ACTIVE → permission/scope. Service nghiệp vụ chuyển deny hợp lệ thành 403; lỗi hạ tầng không bị trình bày thành kiểm quyền thành công. Event Service phải resolve org từ dữ liệu thật trước khi gọi check; Identity không tự chứng minh được cặp org/event nếu chưa có resolver/projection tin cậy.

- **Điều kiện đóng:** fixture E1/org A, E2/org B; OWNER A được thao tác E1, bị deny E2; SPEAKER E1 chỉ đọc E1; thiếu scope, sai enum, permission lạ có kết quả chính xác đã chốt. Liên kết AC-003.

### F04 — Cần sửa M2: `operation` trong idempotency chưa định nghĩa tài nguyên đích và vòng đời record

- **Vị trí:** kế hoạch §5.3 dòng 135–136, §6.1 dòng 154, IDEM-01 dòng 352.
- **Bằng chứng:** khóa là user + operation + key, hash payload; chưa nói operation có chứa org/user/invitation đích trong URL, TTL cụ thể hay xử lý replay sau khi actor mất quyền.
- **Tác động:** nếu operation chỉ là tên handler, hai lệnh thay role cùng body nhưng khác target có thể trả lại response của lệnh trước. Nếu scope/hash đã bao gồm target thì tránh được, nhưng hiện tài liệu chưa bảo đảm điều đó. TTL cũng xác định retry được bảo đảm trong bao lâu.
- **Đề xuất sửa:** định nghĩa request identity gồm method, operation, target/path params và body chuẩn hóa; chỉ rõ phạm vi key, response conflict, thời hạn lưu và replay authorization. Giá trị TTL là quyết định kỹ thuật cần ghi rõ, không được review tự coi là yêu cầu nghiệp vụ đã chốt.

**Thiết kế record đề xuất — chưa chốt TTL/error code:**

| Thành phần | Quy tắc |
|---|---|
| Khóa unique | `(actor_user_id, operation, idempotency_key)`; actor từ context tin cậy. Operation riêng cho CREATE_ORGANIZATION, REPLACE_MEMBER_ROLES, CREATE/ACCEPT/DECLINE/REVOKE_INVITATION. |
| Request hash | SHA-256 của method, operation, path params target và body sau validate/chuẩn hóa; thêm query/header ảnh hưởng nghiệp vụ nếu có. Không chỉ hash body, không chứa token/request ID. |
| Target | Đổi role gồm org + user đích; tạo invitation gồm org; accept/decline gồm invitation ID; revoke gồm org + invitation ID. |
| Canonicalization | Thứ tự key JSON ổn định, UUID/enum/default theo contract. Không tự sort array hoặc đổi mọi string nếu chưa định nghĩa semantics. |
| Result | Lưu success HTTP status/body nghiệp vụ, target metadata cho kiểm quyền, created/completed/expires_at; không lưu credentials. |
| TTL | Đề xuất 24 giờ từ commit thành công, không kéo dài khi replay; hết hạn không còn cam kết trả kết quả cũ. |

| Trường hợp | Xử lý đề xuất |
|---|---|
| Cùng key, target và body, còn TTL, quyền hiện tại hợp lệ | Replay success đã lưu; không lặp mutation/outbox event |
| Cùng key nhưng body/target khác | `409 CONFLICT`, không báo success của target cũ |
| Hai request giống nhau đồng thời | DB unique/transaction chỉ cho một mutation commit; request sau đọc result đã commit. Không dùng check-then-insert riêng ở application làm bảo đảm. |
| Chờ khóa quá thời hạn | Không chạy mutation thứ hai; đề xuất `409 IDEMPOTENCY_IN_PROGRESS`, retry cùng key. Giới hạn chờ/code cần freeze. |
| Lỗi trước commit / crash trước commit | Rollback mutation và record chưa commit; M2 đề xuất chỉ cache success, không cache mọi lỗi |
| Commit nhưng mất response | Retry đọc result đã lưu; không nhân bản side effect |
| Actor mất quyền / bị khóa / token sai | Kiểm quyền hiện tại, không trả cache trái phép hoặc chạy lại mutation |
| Hết TTL / cleanup cạnh tranh | Serialize xóa/thay record theo cùng khóa; có thể xử lý như request mới sau expiry, vẫn giữ constraint nghiệp vụ; không hứa exactly-once vĩnh viễn |

Record, mutation, outbox trong phạm vi F02 và success result cùng transaction. Không cần commit riêng một record IN_PROGRESS trong phương án này. Replay kiểm quyền nhận kết quả nhưng không kiểm lại mọi điều kiện nghiệp vụ đã thay đổi do lần thành công trước, ví dụ không đòi invitation đã ACCEPTED quay lại PENDING. Request ID của lần gọi mới không lấy từ cache cũ. Nếu mutation tự làm actor mất quyền thì retry có thể bị deny, không có nghĩa lần commit trước thất bại.

Ví dụ cùng actor/key/body ADMIN nhưng target user-B và user-C phải có hash khác, request sau nhận conflict. AC-004 cần test khác target/body, cùng khóa đồng thời, actor/operation khác, rollback, commit mất response, mất quyền, TTL và cleanup bằng clock/DB test riêng.

- **Điều kiện đóng:** cùng target/body/key không nhân bản; khác target hoặc body được tách hoặc conflict theo contract, không báo thành công cho mutation chưa chạy; race tạo record chỉ một mutation. Liên kết AC-004.

<a id="f05"></a>

### F05 — Cần sửa phạm vi M2: role EVENT chưa có đường gán qua API được xác minh độc lập

- **Vị trí:** kế hoạch §6.2 dòng 169, §7.2 dòng 198, P5 dòng 276, §13 dòng 434.
- **Bằng chứng:** M2 dùng fixture, còn adapter xác minh event/org ở M4; khi chưa có nguồn xác minh thì phải từ chối assignment EVENT. Đặc điểm này được kế hoạch nhận diện đúng, nhưng chưa chỉ rõ API role/invitation ở M2 hỗ trợ những scope nào và trả gì khi không xác minh được.
- **Tác động:** seed chứng minh phép kiểm quyền, không chứng minh OWNER có thể gán SPEAKER cho event mới. Không thể mô tả M2 là hoàn thành mọi đường gán role EVENT bằng API thật.
- **Đề xuất sửa:** ghi ma trận khả năng M2: ORG assignment chạy thật; EVENT assignment chỉ fixture/test adapter tách khỏi cấu hình chạy bình thường, hoặc bị từ chối với lỗi đã định nghĩa. Giữ xác minh Event thật ở M4 như phạm vi đã chốt; không mở rộng scope ngầm.

**Xử lý và bàn giao đề xuất:** [contract phối hợp Identity–Event](../../../shared/contracts/events/README.md#identity-event-f05) vẫn có ghi chú bàn giao; endpoint là đề xuất chưa freeze.

| Hành vi | M2 | M4 |
|---|---|---|
| Gán OWNER/ADMIN ORG | API thật theo quyền Identity | Giữ invariant |
| Gán role EVENT | Fixture/test resolver; cấu hình thông thường thiếu resolver thì từ chối | Resolver Event thật, đối chiếu org rồi ghi |
| Invitation có EVENT assignment | Không xác minh được thì từ chối tạo/accept, không ghi membership một phần | Kiểm khi tạo và accept; replay theo F04 |
| Authorization EVENT | Policy test với fixture tin cậy | Service sở hữu tài nguyên resolve org thật trước check |

Đề xuất Event cung cấp `GET /internal/events/{eventId}/authorization-context` trả `{event_id, organization_id}` từ DB Event, kể cả DRAFT. Không đọc chéo DB, không route public, không gọi ngược Identity check trong resolver để tránh vòng Identity → Event → Identity. Trust local/service-to-service, timeout và OpenAPI cần freeze trước M4.

| Kết quả resolver | Xử lý Identity đề xuất |
|---|---|
| Chưa cấu hình resolver M2 | `409 EVENT_SCOPE_UNVERIFIED` — code mới đề xuất |
| Event không tồn tại | `404 NOT_FOUND` |
| Event thuộc org khác target | `403 FORBIDDEN` |
| Response thiếu/sai ID hoặc mất kết nối | `502 UPSTREAM_UNAVAILABLE` |
| Timeout | `504`, code timeout cần freeze |
| Event/org khớp, quyền hợp lệ | Tiếp tục transaction, không mặc nhiên cho phép chỉ vì event tồn tại |

Mọi ca thất bại không tạo assignment/membership hoặc chuyển invitation thành ACCEPTED. Gọi resolver trước transaction local, rồi kiểm quyền local theo F06; không giữ khóa khi gọi mạng. Nếu sau này thêm chuyển org/xóa event phải chốt version/lifecycle, không coi resolver là transaction phân tán. Không fallback fixture khi Event lỗi; event RabbitMQ hiện tại không thay resolver vì thiếu DRAFT/projection và có độ trễ. AC-005 kiểm cả E1/A, E2/B, không tồn tại, response lỗi, timeout, cấu hình thiếu adapter và test M4 với Event thật.

- **Điều kiện đóng:** fixture không hoạt động như nguồn production; event không xác minh được không tạo assignment/membership từ invitation. Liên kết AC-005.

### F06 — Cần sửa M2: quyền người thao tác có thể thay đổi giữa check và commit

- **Vị trí:** kế hoạch §7.2 dòng 201, §7.3 dòng 208–210, P5/P6, OWN-02 và INV-06.
- **Bằng chứng:** có khóa organization để đếm OWNER, có khóa invitation khi accept và kiểm inviter còn quyền; chưa nói check quyền actor/inviter nằm ở đâu trong thứ tự khóa chung với mutation thay role.
- **Tác động:** nếu chỉ check trước transaction/lock, request cũ có thể commit sau khi actor bị hạ quyền. Khóa invitation riêng không tự serialize với việc hạ OWNER. Không kết luận chắc chắn có race, vì implementation chưa có.
- **Đề xuất sửa:** mô tả thứ tự khóa thống nhất và đọc lại quyền trong vùng transaction bảo vệ mutation. Với race hạ inviter/accept, chốt điểm tuyến tính hóa: giao dịch nào được serialize trước quyết định kết quả; không đòi rollback một accept đã commit trước lúc hạ quyền.

**Giao thức khóa đề xuất cho các mutation quyền cùng org:**

1. Xác thực/validate và resolve Event nếu cần trước transaction; guard chỉ chặn sớm, không thay kiểm lại quyền.
2. Bắt đầu transaction, giành khóa idempotency theo F04 nếu áp dụng.
3. Khóa row organization đích bằng `SELECT ... FOR UPDATE`; không có org thì rollback. Tạo org mới giữ transaction org/member/OWNER nguyên tử, không khóa row chưa tồn tại.
4. Sau khi lấy được khóa, đọc lại quyền actor/inviter và membership ACTIVE bằng dữ liệu hiện tại trong transaction; không dùng kết quả cache trước khi chờ khóa.
5. Khóa invitation rồi membership/assignment liên quan theo thứ tự cố định; nhiều row cùng loại sắp ID. Đọc lại trạng thái/expiry sau khi chờ. Nếu đọc trước invitation để resolve org, kiểm lại quan hệ đó dưới khóa.
6. Kiểm policy, scope, số OWNER còn hiệu lực sau thay đổi; ghi mutation, idempotency và outbox theo F02 cùng transaction; commit hoặc rollback toàn bộ.

Mọi đường sửa role/membership/create/accept/revoke/decline invitation liên quan phải cùng tuân thủ thứ tự khóa. Replay success theo F04 không chạy mutation lại. Transaction ngắn, không gọi HTTP/broker dưới khóa; lock timeout/deadlock không trả success giả. Nếu retry lỗi phục hồi được thì dùng transaction mới, cùng key, kiểm quyền lại và số lần hữu hạn.

| Race | Kết quả phải quan sát được |
|---|---|
| Gán role commit trước hạ quyền actor | Mutation hợp lệ được giữ; không rollback ngược khi quyền đổi sau đó |
| Hạ quyền commit trước gán role | Actor đọc quyền mới, trả 403 và không ghi role |
| Accept commit trước hạ quyền inviter | Membership được giữ theo quyền tại điểm serialize |
| Hạ quyền inviter commit trước accept | Accept bị từ chối theo lỗi contract, không tạo membership/assignment |
| Hai OWNER đồng thời bỏ quyền | Transaction sau đếm lại, không commit zero OWNER |
| Accept/revoke/decline cùng invitation | Một kết quả cuối hợp lệ, không duplicate membership |

Khóa organization không tự serialize với thao tác LOCKED user toàn cục hoặc thay đổi bên Event. Khi bổ sung API khóa user phải thiết kế giao thức khóa riêng; không tuyên bố đã giải quyết mọi race. AC-006 dùng hai connection PostgreSQL + barrier để ép cả hai thứ tự, kiểm trạng thái DB, expiry trong lúc chờ, rollback, idempotency/outbox trên DB test riêng.

- **Điều kiện đóng:** kiểm thử hai thứ tự commit cho hạ OWNER/gán role và hạ inviter/accept, không cấp quyền từ actor đã mất quyền tại điểm quyết định. Liên kết AC-006.

### F07 — Cần sửa M1/M2: schema đã nêu invariant nhưng thiếu thiết kế migration có thể kiểm chứng

- **Vị trí:** kế hoạch §6.1 dòng 145–163, seed dòng 170–171, invitation dòng 211.
- **Bằng chứng:** đã nhận diện CITEXT và unique nullable nhưng chưa chọn cách thực hiện; roles có `organization_id NULL`, invitation lưu role assignments chưa có shape. Migration/test hiện chỉ là README.
- **Tác động:** dễ khác cách biểu diễn scope giữa DTO/DB, nhân đôi role seed hoặc assignment ORG có NULL; membership có thể trỏ role không đúng org nếu sau này bật role riêng. Unique lời mời PENDING còn phải đi cùng quy trình chuyển lời mời hết hạn.
- **Đề xuất sửa:** P0 đưa DDL/Prisma design để review: khóa/FK nội bộ, enum/check trạng thái, representation ORG/EVENT, uniqueness role hệ thống và assignment nullable, email normalization, shape invitation assignments. Không triển khai custom-role API ngoài phạm vi. Với PostgreSQL 16 có thể xem xét `NULLS NOT DISTINCT` hoặc partial indexes phù hợp; không coi composite UNIQUE nullable mặc định là đủ. [Tài liệu PostgreSQL 16](https://www.postgresql.org/docs/16/ddl-constraints.html#DDL-CONSTRAINTS-UNIQUE-CONSTRAINTS).

**Bảng thiết kế sửa F07 — đề xuất chưa freeze:**

| Mốc / invariant | Schema hoặc migration đề xuất | Kiểm chứng PostgreSQL thật |
|---|---|---|
| M1: email không trùng khác case | CITEXT NOT NULL UNIQUE; tạo extension trước cột; trim email tại app và dùng normalization thống nhất, không normalize password | Register khác case/race chỉ một user, request thua 409 |
| M1: FK nội bộ | UUID PK, FK user/org/member/role/permission/session trong Identity; delete hạn chế mặc định, không cascade ngầm; không FK Event | Row mồ côi bị chặn, không FK chéo DB |
| M1: một membership/user/org | Unique `(organization_id,user_id)`, NOT NULL và tập status đã chốt | Insert trùng/race bị chặn; inactive không được dùng cấp quyền |
| M1: role hệ thống không trùng khi org NULL | Đề xuất `UNIQUE NULLS NOT DISTINCT (organization_id,code)`; seed khóa nghiệp vụ ổn định, không mở custom-role API | Seed hai lần vẫn bốn role hệ thống, scope đúng |
| M1: permission/cặp role-permission không trùng | Unique permission code, unique/PK ghép role/permission + FK; seed đúng bộ, báo lệch thay vì xóa dữ liệu âm thầm | OWNER đủ 10; ADMIN thiếu member.manage; SPEAKER chỉ event.read; ATTENDEE không quyền quản trị |
| M1: scope assignment rõ ràng | resource_type NOT NULL; ORG resource_id NULL, EVENT UUID NOT NULL; CHECK hai tổ hợp. F03 DTO ORG dùng ID tổ chức, adapter ánh xạ rõ sang assignment ORG NULL | Scope sai bị chặn; contract test kế thừa org/event đúng |
| M1: assignment nullable không trùng | Đề xuất `UNIQUE NULLS NOT DISTINCT (membership_id,role_id,resource_type,resource_id)` trong SQL migration review được | Trùng ORG NULL hoặc trùng EVENT bị chặn; E1/E2 phân biệt |
| M1/M2: role đúng scope/tenant | Kiểm roles.scope và org của role riêng nếu có trong transaction; Event/org theo F05; không coi CHECK một row thay kiểm quan hệ nhiều bảng | Role scope sai/cross-org bị chặn, event không xác minh không ghi |
| M1: refresh session | Hash token NOT NULL UNIQUE, FK user, TIMESTAMPTZ, CHECK expires_at > created_at; giữ sid/hạn khi rotation, cập nhật nguyên tử chỉ khi chưa revoke/expire | Race một winner; token cũ fail; revoke không bị ghi đè; upgrade không reset phiên |
| M2: invitation assignments và PENDING | JSONB assignments server-side với shape code/type/id đã normalize; FK org/inviter/invitee; CHECK status/expiry; partial unique org/invitee WHERE status=PENDING | Validation shape/scope; create race một PENDING; accept không role từ client/không ghi một phần |
| M2: invitation hết hạn | Dưới giao thức khóa F06, chuyển PENDING hết hạn sang EXPIRED trước tạo mới; không dùng predicate index thời gian động `expires_at > now()` | Tạo mới sau expiry thành công, không hai PENDING hữu hiệu |
| M2: idempotency | Unique actor/operation/key, request hash/result/target và TIMESTAMPTZ; index expiry; TTL policy theo F04 | Retry/race/crash/TTL theo AC-004, rollback không success record |
| M2: OWNER cuối cùng | Transaction/khóa org/đếm lại ở F06; không CHECK đơn giản trên một assignment | Hai OWNER đồng thời hạ quyền vẫn còn một OWNER |
| M1→M2: upgrade giữ dữ liệu | Migration có lịch sử; kiểm dữ liệu trước thêm constraint, dừng hoặc review sửa dữ liệu vi phạm; seed riêng/local guard; backup/phục hồi cho volume có dữ liệu | DB sạch và DB M1 có dữ liệu đều migrate được; so ID/hash/session/org, không reset/nhân bản |

CITEXT, ORG NULL, NULLS NOT DISTINCT và JSONB là lựa chọn đề xuất cần kiểm khả năng Prisma ở phiên bản P0; SQL tùy chỉnh phải nằm trong lịch sử migration. JSONB không tự validate mọi field hoặc quan hệ role; DTO/domain/constraint bổ sung phải bảo vệ shape. Đầu ra F07 gồm schema/DDL, index/constraint có tên, mapping DTO-persistence, seed ổn định và test AC-007 trên DB cô lập. Không dùng `db push` hoặc xóa dữ liệu để vượt lỗi.

- **Điều kiện đóng:** DB thật từ chối email/role/assignment trùng theo chuẩn đã chọn; seed hai lần không nhân bản; upgrade M1→M2 giữ nguyên user/session/org. Liên kết AC-007.

### F08 — Cần sửa M3: broker confirm chưa đủ làm điều kiện mark sent khi message không route được

- **Vị trí:** kế hoạch P7 dòng 291–298, EVT-02/03 dòng 360–361.
- **Bằng chứng:** kế hoạch đã yêu cầu queue test durable và nhận diện exchange không giữ message, nhưng chưa có xử lý return/unroutable và ca thiếu binding. RabbitMQ có thể confirm cả message không route tới queue; với `mandatory`, broker trả message trước confirm. [Tài liệu RabbitMQ](https://www.rabbitmq.com/docs/confirms#when-publishes-are-confirmed).
- **Tác động:** nếu worker mark sent chỉ dựa vào confirm, routing key sai hoặc binding chưa tạo vẫn có thể mất event khỏi đường retry.
- **Đề xuất sửa:** xác định topology trước publish, điều kiện sent và xử lý unroutable, ví dụ mandatory + return handling hoặc topology/alternate-exchange có kiểm chứng. Không coi consumer ACK là publisher confirm.

**Thiết kế xử lý F08 — đề xuất, chưa triển khai worker:**

1. Khai báo và kiểm chứng exchange `lamu.events`, queue durable kiểm thử và binding đúng routing key trước khi worker gửi. Trong M3 chưa có consumer thật vẫn phải có queue bind để giữ message; không coi exchange là nơi lưu backlog.
2. Dùng publisher confirm channel, message persistent, `mandatory: true`, `message_id = event_id`. Đăng ký xử lý return/confirm/lỗi channel trước publish; chưa chọn thư viện AMQP cụ thể ở báo cáo.
3. Theo dõi **từng lần publish**: event ID, publish sequence của channel và correlation của return/confirm. Nhiều lần retry giữ cùng event ID nhưng cần ánh xạ attempt rõ ràng; không dùng một biến return toàn cục cho mọi message hoặc chỉ gọi API chờ confirm mà bỏ qua return.
4. Với cùng attempt, return làm lần publish thất bại dù sau đó nhận ACK. Chỉ mark sent khi nhận ACK và đã xử lý việc message không bị return theo thứ tự protocol/library. Không dùng timer ngắn tùy ý để suy “không có return”; phải kiểm chứng hành vi callback/event của thư viện được chọn. RabbitMQ gửi return trước ACK cho message mandatory không route được. [Tài liệu RabbitMQ 3.13](https://www.rabbitmq.com/docs/3.13/confirms#when-publishes-are-confirmed).
5. Mark sent trong transaction DB ngắn, có điều kiện attempt/worker đang sở hữu record nếu có nhiều worker. Không giữ transaction nghiệp vụ hoặc DB lock trong lúc chờ broker; nếu claim record, dùng cơ chế lease/claim có hồi phục khi worker crash.

| Tín hiệu của lần publish | Trạng thái / hành vi outbox đề xuất |
|---|---|
| ACK, không return, topology đạt yêu cầu | Mark SENT, lưu sent_at; nghĩa là đã bàn giao broker theo contract, chưa phải consumer đã xử lý |
| Return/unroutable, kể cả sau đó ACK | Không mark SENT; giữ payload/event ID, lưu lỗi routing và lên lịch retry/backoff sau khi sửa topology |
| NACK / channel error / exchange không tồn tại | Không mark SENT; lưu lỗi, reconnect/khai báo lại topology theo policy trước retry |
| Hết thời gian chờ confirm hoặc mất kết nối | Kết quả chưa chắc chắn; không mark SENT, retry cùng event ID và chấp nhận duplicate |
| Publish được confirm nhưng crash trước mark SENT | Record được khôi phục/reclaim rồi gửi lại cùng event ID; consumer dedupe, không tạo event ID mới |
| DB lỗi khi cập nhật SENT | Không báo đã đánh dấu thành công; giữ khả năng phục hồi/retry, có thể phát trùng |

Đề xuất record có attempt count, next_attempt_at, last_error và thông tin claim khi cần; backoff/thời hạn chờ/cảnh báo cần freeze ở contract vận hành, không tự xóa event hoặc coi hết số lần retry là SENT. Nếu có trạng thái failed/parked sau ngưỡng, event vẫn lưu để sửa lỗi và replay có kiểm soát. Không lưu token/credentials trong lỗi.

**Giới hạn bảo đảm:** mandatory + confirm chứng minh có route, không bảo đảm đúng tất cả queue dự kiến khi chỉ một queue khác bind nhầm cũng nhận được message. Cần topology test kiểm tên queue, routing/binding và payload ở queue đích. M3 dùng queue test rõ ràng; không suy đã có Notification thật. Nếu dùng alternate exchange thì cần contract và kiểm thử đường đi riêng, không thêm ngầm vào phương án mandatory hiện tại. Lưu trữ broker qua recreate theo F09 vẫn phải xử lý riêng.

**Ca kiểm chứng bổ sung EVT-02/03 và AC-008:**

| Kịch bản test cô lập | Kết quả bắt buộc |
|---|---|
| Publish với đúng queue/binding | Queue đích nhận event đúng schema/ID, outbox chỉ SENT sau điều kiện confirm hợp lệ |
| Gỡ binding để không còn queue nhận | Có return (dù có ACK), outbox không SENT; không mất event khỏi đường retry |
| Khôi phục binding sau lỗi | Retry cùng event ID tới queue đích, sau đó mark SENT; ghi nhận số attempt |
| Routing sai nhưng queue khác vẫn nhận | Topology test phát hiện thiếu delivery ở queue đích; không dùng ACK/no-return để kết luận topology đúng |
| Mất kết nối/timeout/NACK/channel đóng | Không success giả; retry/reconnect hữu hạn mỗi attempt, giữ event ID |
| Crash sau confirm trước mark SENT | Có thể duplicate cùng event ID, không bỏ record vĩnh viễn hoặc tạo ID mới |
| Hai event publish song song, chỉ một event bị return | Return/ACK được ghép đúng attempt; không mark SENT nhầm event lỗi hoặc quy lỗi sang event khác |

Chỉ chạy các ca fault injection khi triển khai môi trường RabbitMQ/DB test riêng; không gỡ binding trên broker demo/shared trong phiên sửa tài liệu. Tất cả ca hiện NOT RUN, không chuyển đề xuất thành bằng chứng nghiệm thu.

- **Điều kiện đóng:** thiếu queue/binding không tạo trạng thái sent thành công giả; sau khôi phục topology, cùng event ID có thể được gửi lại theo policy đã chọn. Liên kết AC-008.

### F09 — Cần sửa M3/local: chưa bảo đảm lưu dữ liệu broker qua việc tạo lại container

- **Vị trí:** [Compose](../../../docker-compose.yml) dòng 68–93; kế hoạch P7 dòng 293–296 và EVT-02.
- **Bằng chứng:** service RabbitMQ không cấu hình named volume dữ liệu; danh sách volume chỉ có năm database. Test “broker down rồi up” không phân biệt restart cùng container và down/up hoặc recreate container.
- **Tác động:** durable queue/persistent message không tự tạo chính sách tái sử dụng storage qua lifecycle Compose. Không có test chứng minh backlog còn sau việc tạo lại container. Không khẳng định restart cùng container chắc chắn mất dữ liệu.
- **Đề xuất sửa:** lên kế hoạch volume dữ liệu broker rõ ràng, kiểm tra node identity/hostname phù hợp lưu trữ được chọn và ghi giới hạn môi trường local một node. Tách ca restart process/container khỏi ca recreate có giữ storage.

**Cấu hình lưu trữ đề xuất F09 — chưa chỉnh Compose hoặc vận hành broker:**

```yaml
# Các field cần bổ sung vào Compose hiện có, không thay thế toàn bộ file.
services:
  rabbitmq:
    hostname: rabbitmq
    volumes:
      - rabbitmq-data:/var/lib/rabbitmq

volumes:
  rabbitmq-data:
```

Giữ nguyên environment, healthcheck, network và các volume PostgreSQL khi tích hợp đoạn trên. Named volume lưu dữ liệu broker tách vòng đời container; hostname ổn định giúp giữ node identity tương ứng. Cần kiểm chứng đường dẫn dữ liệu và node name thực tế với phiên bản image đã chọn; pin image ở phiên bản đã kiểm thử và xử lý nâng cấp broker thành công việc riêng, không dùng recreate để nâng phiên bản ngầm.

| Phần việc | Xử lý đề xuất | Điều kiện cần kiểm tra |
|---|---|---|
| Storage | Mount named volume `rabbitmq-data` vào `/var/lib/rabbitmq`; giữ cùng Compose project/volume và node identity khi dựng lại | Container mới dùng lại đúng volume, không tự tạo một volume trống vì đổi project/name |
| Topology | Exchange/queue durable; queue giữ backlog không exclusive/auto-delete; khai báo topology bằng code/config có phiên bản | Dựng lại được topology, không phụ thuộc thao tác thủ công trên management UI |
| Message/outbox | Persistent message, publisher confirm + mandatory/return theo F08; chỉ mark SENT khi đủ điều kiện | Storage không thay thế xử lý unroutable hoặc bảo đảm consumer đã xử lý |
| Lifecycle thông thường | Dừng/chạy lại hoặc tạo lại container có giữ named volume; ghi rõ cùng project và cấu hình được dùng | Không dùng thao tác xóa volume để thực hiện bài test bảo toàn dữ liệu |
| Chuyển từ broker hiện có | Kiểm tra mount/node identity hiện tại và backlog trước khi thêm mount mới; sao lưu/chuyển dữ liệu theo quy trình được review nếu cần giữ | Thêm một named volume trống không tự chuyển dữ liệu đang ở container/anonymous volume cũ. Không ghi đè hoặc xóa nguồn cũ để vượt lỗi |
| Giới hạn local | Cam kết cho broker một node và storage còn nguyên qua lifecycle đã kiểm thử | Không coi named volume là backup, replication hoặc bảo đảm khi mất ổ đĩa/volume |

**Quy định vận hành cần ghi vào README:** `docker compose down` rồi `docker compose up -d` phải dùng cùng project và named volume để phục hồi. Không thêm `-v` khi cần giữ dữ liệu: tùy chọn đó có thể xóa named volume của project. Anonymous volume có thể còn tồn tại sau down nhưng không tự được gắn lại ở lần up tiếp theo, nên không dùng làm bảo đảm phục hồi. [Docker Compose down](https://docs.docker.com/reference/cli/docker/compose/down/). Đây là hướng dẫn cho đợt triển khai sau, không phải lệnh đã được chạy trong phiên cập nhật báo cáo.

Nếu đã có dữ liệu broker, phải lập kế hoạch chuyển storage trước khi áp dụng cấu hình; không mặc định backlog demo có thể bỏ. Nếu dữ liệu được xác định là dùng một lần và được phép khởi tạo mới, ghi rõ phạm vi đó thay vì gọi là phục hồi thành công. Event đã SENT không tự được worker bình thường gửi lại khi broker mất dữ liệu; nhu cầu phục hồi mất storage cần quy trình backup/replay riêng, giữ event ID và kiểm soát duplicate.

**Ma trận kiểm chứng bổ sung EVT-02 / AC-009:** dùng Compose project test riêng và volume riêng, không thao tác trên broker demo/shared. Giữ ổn định project, node identity, image và volume trong các ca so sánh; ghi phiên bản/mount thực tế làm bằng chứng.

| Ca kiểm thử | Chuẩn bị / trigger | Kết quả bắt buộc |
|---|---|---|
| Baseline | Tạo queue durable/binding; publish message persistent, chờ confirm hợp lệ, chưa chạy consumer | Ghi event ID, message ID và số message chờ; outbox có trạng thái tương ứng |
| Restart | Restart cùng broker container có backlog baseline | Queue/binding vẫn có, đọc được message cùng event ID; healthy riêng lẻ chưa đủ kết luận |
| Recreate giữ storage | Tạo lại broker container cùng image, hostname và named volume test | Broker dùng lại dữ liệu cũ, queue/binding còn và message chưa consume vẫn đọc được |
| Down/up giữ volume | Dừng/xóa container và dựng lại cùng project, không xóa volume | Phục hồi được backlog; chứng minh storage tái sử dụng thay vì chỉ tạo lại queue rỗng |
| Hoạt động sau phục hồi | Sau khi đọc baseline, publish một event mới | Event mới route đúng queue và worker cập nhật outbox theo F08, không chỉ phục hồi đọc-only |
| Event chưa confirm lúc broker dừng | Outbox còn pending/attempt chưa rõ kết quả, broker phục hồi | Worker retry cùng event ID; có thể trùng nhưng không tạo ID mới hoặc bỏ record |

Mỗi ca đọc message có thể làm thay đổi backlog; tạo fixture riêng hoặc reset baseline có kiểm soát trong project test trước từng ca. Chưa chạy các phép thử này ở phiên sửa tài liệu; kết quả vẫn NOT RUN. Không mở rộng cam kết sang xóa volume, mất host hoặc nâng cấp RabbitMQ chưa kiểm thử.

- **Điều kiện đóng:** message đã confirm còn đọc được sau lifecycle đã cam kết; dùng Compose project/volume test riêng, không xóa volume demo. Liên kết AC-009.

<a id="f10"></a>

### F10 — Cần sửa M3: chưa định nghĩa đủ nghĩa của MembershipChanged và phiên bản

- **Vị trí:** kế hoạch P7 dòng 290–293; event contracts dòng 3, 13; kế hoạch §5.1 dòng 109 và §7.2.
- **Bằng chứng:** payload chỉ mô tả `roles[]` mà không cho biết phần tử là code hay assignment có scope, snapshot hay delta; envelope có `version` nhưng không phân biệt schema version với thứ tự cập nhật aggregate.
- **Tác động:** consumer tương lai không thể biết hai assignment SPEAKER khác event có khác nhau hay không; dedupe event ID không tự giải quyết cập nhật sai thứ tự. Hiện chưa có consumer nên đây là khoảng trống contract trước freeze, không phải sự cố consumer đang chạy.
- **Đề xuất sửa:** viết JSON Schema và ví dụ; chốt trigger phát MembershipChanged (role replacement, accept lời mời, membership tạo cùng org), shape snapshot/delta và scope. Tách schema version khỏi revision dữ liệu nếu có nhu cầu dựng projection; nếu chưa hỗ trợ projection có thứ tự, ghi giới hạn rõ.

**Thiết kế F10 đề xuất — chưa freeze hoặc triển khai producer/consumer:** chọn event dạng **snapshot đầy đủ sau mutation**, không phải delta thêm/xóa role. Contract chi tiết và ví dụ được ghi tại [MembershipChanged v1 — F10](../../../shared/contracts/events/README.md#membership-changed-f10); đây là nguồn mô tả thống nhất để service liên quan review, chưa phải JSON Schema thực thi đã được nghiệm thu.

| Thành phần | Quy tắc đề xuất |
|---|---|
| Envelope `version` | Integer `1` cho schema v1; không tăng theo số lần thay role. Thay đổi shape/semantics không tương thích phải có phiên bản schema mới và kế hoạch chuyển producer/consumer. |
| Định danh aggregate | `aggregate_type = "membership"`, `aggregate_id = payload.membership_id`; UUID membership ổn định, không dùng org ID thay membership ID. |
| Snapshot payload | `membership_id`, `organization_id`, `user_id`, `status`, `membership_revision`, `change_type`, `roles[]` là trạng thái sau commit. M2 chỉ phát status ACTIVE theo phạm vi hiện tại; status/lifecycle mới phải được bổ sung contract trước khi phát. |
| Assignment | Mỗi role gồm `code`, `resource_type`, `resource_id`; ORG resource ID bằng organization_id, EVENT là event UUID đã xác minh theo F05. Khi DB ORG lưu NULL theo F07, producer phải ánh xạ ra ID tổ chức. Không dùng danh sách code trần làm contract snapshot. |
| Ý nghĩa snapshot | Consumer thay toàn bộ state của membership bằng snapshot mới hợp lệ, không cộng dồn roles. `roles: []` nghĩa không có role được gán, nếu mutation đó được policy cho phép; vẫn không được làm mất OWNER cuối cùng. |
| Revision nghiệp vụ | `membership_revision` tăng theo từng mutation có thay đổi state, độc lập cho mỗi membership. Revision khởi đầu 1 khi tạo membership; cập nhật revision và outbox cùng transaction/khóa theo F06. Cần thêm thiết kế migration field revision từ lúc bắt đầu phát MembershipChanged, không đợi consumer mới suy từ thời gian. |
| Retry/no-op | Publish retry giữ event ID, revision, occurred_at và payload gốc; replay idempotency hoặc lệnh không làm đổi state không tự tăng revision/phát event mới. Nếu no-op được API chấp nhận thì trả theo contract endpoint. |

**Bảng trigger đề xuất:**

| Mutation | Event / revision |
|---|---|
| Tạo organization cùng membership OWNER | `OrganizationCreated` cho org và một `MembershipChanged` với change_type CREATED, revision 1 cho membership; hai event khác loại là chủ đích, không phải duplicate |
| Accept invitation tạo membership mới | Một `MembershipChanged`, CREATED, revision 1; không phát thêm một event giống hệt ở tầng handler khác |
| Role replacement thực sự đổi assignment | Một `MembershipChanged`, ROLES_REPLACED, revision tăng 1 |
| Tạo/decline/revoke/expire invitation chưa tạo membership | Không phát MembershipChanged vì membership chưa đổi |
| Rollback, replay thành công hoặc replacement không đổi state | Không phát event mới; không tăng revision do retry/no-op |
| Seed demo, inactive/delete membership hoặc đổi lifecycle ngoài phạm vi hiện tại | Seed không phát ngoài test chỉ định theo F02; tính năng lifecycle mới phải freeze trigger/status trước khi bổ sung, không tự suy trong consumer |

**Consumer/projection tương lai:** validate schema và identity aggregate trước xử lý; dedupe theo event ID bằng processed_messages của consumer. Trong cùng transaction local, khóa/upsert projection theo membership ID và so revision: revision lớn hơn thì thay snapshot, nhỏ hơn thì không ghi đè, bằng nhau cùng state thì không làm lại side effect. Cùng revision nhưng snapshot khác là lỗi invariant cần cảnh báo/quarantine, không tự chọn theo thời điểm nhận. Hai delivery cùng event ID nhưng payload khác cũng là vi phạm producer, không coi là hai thay đổi hợp lệ. Nếu nhận revision nhảy cóc, snapshot có thể cập nhật trạng thái hiện tại nhưng không chứng minh đã nhận đủ lịch sử mutation.

Không dùng `occurred_at`, schema version hoặc thứ tự nhận RabbitMQ để xác định state mới nhất. Nếu consumer còn xử lý side effect theo từng thay đổi thay vì dựng snapshot thì phải có contract ordering/gap riêng, không tự bỏ qua revision cũ theo quy tắc projection này. Event không tự cấp quyền ở service khác: quyền runtime vẫn đi qua Identity check theo thiết kế hiện hành. Hiện chưa thêm consumer MUST mới cho ba event Identity.

**Bằng chứng cần bổ sung AC-010:** schema validation đúng field/UUID/enum/version, scope ORG ánh xạ đúng ID, E1/E2 tạo snapshot khác nhau; tạo org/accept/replace sinh đúng event và revision; rollback/no-op/idempotency không tăng hoặc nhân event; revision 6 đến trước 5 không phục hồi role OWNER cũ; duplicate và hai consumer delivery cạnh tranh không làm projection lùi revision; cùng revision khác state bị phát hiện. Kiểm trên DB/broker test riêng khi triển khai, hiện NOT RUN. Trước đóng F10 phải có JSON Schema máy kiểm được, migration revision, messaging routing/queue và xác nhận producer/consumer liên quan; không coi mô tả Markdown là đã kiểm chứng schema.

- **Điều kiện đóng:** schema validation chấp nhận đúng shape, từ chối payload thiếu field bắt buộc; sample phân biệt E1/E2 và test rollback không phát event. Liên kết AC-010.

### F11 — Cần sửa nghiệm thu: ma trận chưa bao phủ hết cam kết và còn kết quả chưa xác định

- **Vị trí:** kế hoạch §5.1 dòng 107; §7.1 dòng 182; §9.2 dòng 326–362; health/readiness P1 dòng 232–238.
- **Bằng chứng:** AUTH-03 xét login user khóa nhưng chưa có ca khóa sau khi đã cấp token; SES-04/05 chưa tách rõ cùng user khác phiên và retry logout. INV-05 yêu cầu không duplicate nhưng chưa chốt response accept lặp. INF-04 cho phép readiness fail hoặc startup fail, chưa định nghĩa endpoint/readiness cho DB down sau startup. Nâng cấp migration được nêu ở §6 nhưng chưa có ca riêng trong bảng.
- **Tác động:** hai người có thể đánh giá khác nhau dù cùng quan sát hệ thống. Nhãn “toàn bộ ca PASS” chưa đủ nếu các cam kết không có ca kiểm tra tương ứng.
- **Đề xuất sửa:** thêm ca cụ thể ở §5 báo cáo; đóng success status/body theo endpoint, refresh user LOCKED, protected Identity endpoint sau khóa, retry logout, migration nâng cấp, readiness sau mất DB và mapping timeout 504. Test khóa user dùng fixture DB cô lập, không cần mở API quản trị khóa user mới. Phân biệt policy deny với outage; không suy SLA mới.

**Ma trận nghiệm thu bổ sung F11 — đề xuất chưa freeze contract, mọi ca hiện NOT RUN:** các ID dưới đây là ID bổ sung, không đổi nghĩa các ID AUTH/SES/INV/INF/GW đã có. Trước khi đưa vào gate, phải ghi các status/error code/endpoint đề xuất vào catalog/OpenAPI và ma trận chính của MASTER_PLANT; việc bổ sung báo cáo không tự xác nhận chúng đã được duyệt.

| ID / mốc / liên kết | Điều kiện ban đầu và trigger | Kết quả HTTP/body đề xuất | Invariant và bằng chứng cần kiểm |
|---|---|---|---|
| F11-AUTH-01 / M1 / AC-011 | User ACTIVE đã login; fixture chuyển user sang LOCKED sau khi cấp token; dùng refresh còn hạn | Đề xuất `403 FORBIDDEN` cho credential/session hợp lệ nhưng user bị khóa; token sai/hết hạn vẫn xử lý theo contract 401 | Không cấp access/refresh mới, không rotation hash; integration DB + E2E Gateway. Phân biệt account policy với token invalid. |
| F11-AUTH-02 / M1 / AC-011 | Cùng user LOCKED, dùng access còn hạn gọi `/api/users/me` | Đề xuất `403 FORBIDDEN` dù chữ ký JWT hợp lệ | Không trả profile/memberships; chứng minh Identity đọc trạng thái hiện tại. Chỉ cam kết cho Identity M1, chưa suy hiệu lực trên mọi service M4. |
| F11-SES-01 / M1 / AC-001 | Một user có hai phiên A/B còn hạn; logout bằng access A và refresh B | Đề xuất `401 UNAUTHENTICATED` vì cặp chứng thực không cùng phiên | Không thay đổi A/B; refresh B vẫn thành công. E2E qua Gateway và đối chiếu row session trước/sau. |
| F11-SES-02 / M1 / AC-001 | Logout A thành công, rồi lặp với cùng access A còn hạn và đúng refresh hiện hành đã bị revoke của A | `200 {status:"OK"}` nếu vẫn chứng minh được cùng phiên như contract logout | Giữ revoked_at lần đầu, không revoke phiên khác. Phải giữ đủ bằng chứng session/hash để xác minh retry trong thời hạn đã cam kết; không trả OK cho refresh bất kỳ chỉ vì user đúng. |
| F11-SES-03 / M1 / AC-001 | Access hết hạn nhưng refresh còn hạn; thử logout rồi refresh và logout với cặp mới | Lần logout đầu `401 UNAUTHENTICATED`; refresh hợp lệ `200` và logout cặp mới `200 {status:"OK"}` | Request access hết hạn không mutate; rotation giữ sid/hạn tuyệt đối; token refresh cũ đã thay không được dùng như credential hiện hành. Clock điều khiển trong test, không đợi hết hạn thật. |
| F11-INV-01 / M2 / AC-004, INV-05 | Accept đã commit; gọi lại cùng actor, key/target/body trong TTL và quyền nhận kết quả hợp lệ | Replay success status/body đã lưu theo F04; không kiểm lại PENDING như mutation mới | Một membership/assignment và đúng tập outbox event; không tăng membership_revision khi replay theo F10. Kiểm response và DB, không chỉ số lần HTTP success. |
| F11-INV-02 / M2 / INV-05 | Accept đã commit; cùng người nhận gửi accept bằng key mới | Đề xuất `409 INVITATION_NOT_PENDING` | Không thay roles, không tạo membership hoặc event mới. Code mới cần freeze; phân biệt request mới với idempotency replay ở ca trên. |
| F11-INF-01 / M1→M2 / AC-007 | DB M1 có user, session chưa hết hạn và org seed; chạy migration M2 trong môi trường test | Migration exit 0, schema lên đúng version; auth/read API vẫn đúng contract | So ID/count/hash/status/hạn session trước/sau; refresh phiên cũ còn hợp lệ thành công. Không drop/reset DB hoặc seed ghi đè dữ liệu để đạt test. |
| F11-INF-02 / M1 / INF-04 | Ứng dụng chưa start; thiếu env bắt buộc hoặc JWT secret không đạt validation đã chốt | Startup thất bại với exit code khác 0; không báo ready | Log báo tên cấu hình lỗi nhưng không in secret; không mở endpoint phục vụ khi cấu hình chưa hợp lệ. Process/config test riêng, không dùng secret thật. |
| F11-INF-03 / M1 / AC-011 | Identity đã start healthy; DB mất kết nối sau startup rồi được khôi phục | Đề xuất tách `/healthz` liveness `200` khi process còn sống và `/readyz` readiness `503` lúc không truy cập DB, trở lại `200` khi DB hồi phục | Endpoint nội bộ không lộ DSN/secret. Compose/README chỉ rõ readiness dùng làm dependency check; không giả định depends_on tự restart mọi service khi dependency mất kết nối. Test cô lập, thời gian chờ hữu hạn được cấu hình/ghi trong evidence. |
| F11-GW-01 / M1 / GW-02, AC-011 | Gateway đang chạy; Identity không kết nối được trên route được bảo vệ với access hợp lệ | `502 UPSTREAM_UNAVAILABLE` theo error envelope | Có request ID nhất quán, không stack trace/DSN; không nhầm outage thành auth deny hoặc trả response cache thành công giả. |
| F11-GW-02 / M1 / GW-02, AC-011 | Identity fixture trả chậm quá upstream timeout đã cấu hình | Đề xuất `504 UPSTREAM_TIMEOUT` theo error envelope | Thời gian chờ hữu hạn theo cấu hình test, có request ID; code timeout mới phải freeze. Không tự retry mutation bằng key mới hoặc coi timeout là chắc chắn chưa commit. |
| F11-API-01 / M1 / contract/OpenAPI | Register/login/refresh/logout hợp lệ qua Gateway | Đề xuất cả bốn auth POST thành công trả `200` theo contract UI hiện tại; register `{user_id}`, login/refresh `{access_token,refresh_token,expires_in:900}`, logout `{status:"OK"}` | OpenAPI, Identity và Gateway thống nhất; không để default framework tự đổi sang 201. Payload/lỗi không lộ password/hash/session ngoài contract; mock chỉ tham chiếu, không thay bằng chứng backend thật. |

**Quy tắc chuẩn hóa kết quả để chốt nghiệm thu:**

- Các ca REQUIRED của mốc phải có starting state, input/key/target, expected status/body, dữ liệu không được đổi và evidence method. Các status/code mới ở bảng là đề xuất cụ thể, không dùng cụm “theo contract” để né quyết định còn thiếu khi freeze.
- Bộ test khóa user dùng fixture DB test, không mở thêm API khóa tài khoản. Readiness `/readyz` là endpoint mới đề xuất, không mặc định đã có trong source/Compose. Quy tắc JWT sống tối đa 15 phút sau logout vẫn giữ như kế hoạch; LOCKED Identity là ca policy riêng.
- Response success M2 cho create org/create invitation/list/accept/decline/revoke/replace role phải được bổ sung DTO/status cụ thể trong OpenAPI trước triển khai từng endpoint. Bảng trên chỉ chốt đề xuất những điểm mơ hồ đã chỉ ra, không giả là mọi response M2 đã đầy đủ.
- Error envelope luôn `{error:{code,message,request_id}}`; contract test kiểm status/code và schema, chỉ so message chính xác khi contract yêu cầu. Với replay thành công dùng request ID của lần gọi mới theo F04.
- PASS cần commit/working-tree version, môi trường test, lệnh/bước, expected/actual và evidence đã che dữ liệu nhạy cảm. FAIL có bước tái hiện; BLOCKED ghi dependency; NOT RUN không tính PASS. Bằng chứng snapshot/mock không thay integration PostgreSQL hoặc Gateway E2E.
- Fault injection DB/HTTP chỉ trong project test tách demo/shared; không chạy các ca này trong phiên sửa báo cáo. Sau khi freeze hành vi, đồng bộ ma trận chính và test; không sửa expected theo kết quả implementation tình cờ trả về để biến FAIL thành PASS.

- **Điều kiện đóng:** mọi cam kết trên có expected result/status đã chốt và evidence method; chưa chạy phải ghi NOT RUN. Liên kết AC-001/AC-007/AC-011.

### F12 — Cần sửa ở M4: frontend logout hiện không đáp ứng hợp đồng M1 mới

- **Vị trí:** kế hoạch §5.1 dòng 102–107, P8 dòng 303; [useSession.ts](../../../frontend/src/lib/useSession.ts) dòng 76–84; [apiClient.ts](../../../frontend/src/lib/apiClient.ts) dòng 107–108; mock route dòng 184–187.
- **Bằng chứng:** frontend gọi logout với `anonymous: true`, và client không tự refresh các endpoint `/auth/`. Mock logout chỉ revoke token rồi trả OK, không yêu cầu access; kế hoạch mới yêu cầu access + refresh cùng sid và refresh trước khi access hết hạn.
- **Tác động:** khi nối backend thật, UI có thể xóa token local dù backend trả 401, để session server vẫn refresh được. Đây là việc tích hợp M4, không cản M1 demo bằng Swagger.
- **Đề xuất sửa:** ghi rõ khác biệt và tác vụ M4: gửi access cho logout, xử lý expiry theo flow đã chốt, cập nhật mock/contract test khi đến phạm vi. Đừng sửa frontend trong đợt triển khai M1–M3 nếu chưa được giao.

**Luồng frontend logout đề xuất F12 — chỉ triển khai khi bắt đầu M4:** tạo một luồng quản lý session dùng chung cho request thường, refresh và logout. Không chỉ bỏ `anonymous: true`: cần lấy đúng cặp token mới nhất, phối hợp refresh đang chạy và ngăn response cũ khôi phục phiên sau logout. Không đổi hợp đồng M1 thành logout bằng refresh token đơn lẻ để giữ tương thích mock.

| Bước | Xử lý đề xuất | Điều kiện cần giữ |
|---|---|---|
| Bắt đầu logout | Đánh dấu trạng thái logging-out, gộp các lần bấm logout vào cùng một tác vụ, tạm chặn refresh/request bảo vệ mới của phiên đó | Không tạo nhiều luồng rotation/logout cạnh tranh trong cùng session coordinator |
| Đồng bộ request đang chạy | Chờ refresh đã bắt đầu trước đó hoàn tất trong timeout hữu hạn rồi lấy cặp token mới nhất; dùng session generation/ID nội bộ để nhận diện response cũ | Không ghép access mới với refresh cũ; response profile/token của phiên trước không được cập nhật store sau khi phiên đã kết thúc |
| Access còn hạn | Gửi `POST /api/auth/logout`, Authorization Bearer access hiện tại, body refresh hiện tại; không dùng `anonymous: true` | Gateway verify và chuyển sub/sid theo F01; body không tự khai user/sid |
| Access thiếu/hết hạn nhưng có refresh | Refresh có điều phối tối đa một lần, nhận cặp token mới rồi logout bằng chính cặp đó | Giữ sid/hạn tuyệt đối theo backend; đọc lại refresh sau rotation, không dùng biến token đã chụp trước refresh |
| Logout trả 401 do access không còn hợp lệ | Nếu chưa refresh trong luồng này và còn refresh thì thử refresh một lần, rồi thử logout lại một lần; nếu vẫn lỗi thì dừng | Không bật auto-refresh đệ quy cho mọi `/auth/...`; không bỏ qua lỗi session mismatch của backend hoặc tự đổi sang logout phiên khác |
| Hoàn tất | Kết thúc generation của phiên, xóa token/profile local, không nhận update từ response cũ, điều hướng `/auth` theo UI contract | Không lưu token vào URL/log/report và không tự đăng nhập lại để hoàn thành logout |

Có thể decode `exp` để dự đoán lúc cần refresh ở client, nhưng server vẫn quyết định token hợp lệ. Không xem decode client là verify JWT hoặc nguồn quyền. API client hiện trả boolean từ refreshOnce và gộp lỗi mạng với invalid token; khi triển khai M4 cần phân biệt lỗi auth và kết quả chưa xác định để thông báo đúng, không coi mọi refresh fail là chứng minh server session đã hết hiệu lực.

**Bảng kết quả và thông báo đề xuất:**

| Tình huống | Xử lý client | Có được khẳng định server đã thu hồi phiên? |
|---|---|---|
| Logout trả `200 {status:"OK"}` theo contract cùng phiên, kể cả retry hợp lệ | Xóa local state và chuyển `/auth` | Có, trong giới hạn thu hồi refresh session; access JWT đã cấp vẫn có thể sống tới exp theo M1 |
| Refresh token đã được backend xác định hết hạn/thu hồi | Không refresh/logout vô hạn; xóa local state | Chỉ nói refresh session không còn dùng được theo lỗi đã chốt, không khẳng định có một logout commit mới |
| Token sai hoặc cặp session mismatch | Xóa local state theo quy ước UI, không gọi logout cho một phiên khác, ghi lỗi đã che thông tin | Không; lỗi từ chối không chứng minh revoke đã xảy ra |
| Mất kết nối/timeout/5xx khi refresh hoặc logout | Dừng sau retry hữu hạn đã quy định; vẫn xóa local state theo UI hiện tại; thông báo đề xuất: “Đã xóa phiên trên trình duyệt; chưa xác nhận được thu hồi phiên trên máy chủ.” | Không; request có thể chưa tới server hoặc đã commit nhưng mất response |
| Không có đủ token để chứng minh phiên | Xóa phần local state còn lại, không gửi giá trị null như refresh token hợp lệ | Không, trừ khi server có phản hồi xác nhận khác theo contract |

Không giữ refresh token trong persistent storage chỉ để retry sau khi đã thông báo logout/xóa phiên. Nếu timeout xảy ra trong refresh, backend có thể đã rotation nhưng client chưa nhận token mới; không thể hứa luôn hoàn tất thu hồi từ client. Đây là giới hạn cần tài liệu hóa, không tự thêm logout-all/session-revocation API ngoài M1. Refresh token hết hiệu lực không đồng nghĩa access JWT bị thu hồi tức thời.

**Các file cần cập nhật ở M4:**

| File / tài liệu | Thay đổi dự kiến |
|---|---|
| `frontend/src/lib/useSession.ts` | Gọi luồng logout phối hợp, gửi access + refresh cùng phiên; bỏ anonymous cho request logout; giữ cleanup local khi lỗi |
| `frontend/src/lib/apiClient.ts` | Cho logout dùng refresh coordinator có giới hạn rõ; phân biệt auth/network error; ngăn request mới/response cũ cập nhật session khi logging-out/logged-out |
| `frontend/src/lib/auth.ts` và chỗ cache/profile liên quan | Generation guard cho token/profile update và invalidation; đảm bảo không setSession/setCachedProfile từ tác vụ phiên cũ sau cleanup |
| Mock route/store, UI auth docs và contract test | Đồng bộ yêu cầu cặp token/sid khi còn duy trì mock, ghi rõ mock không chứng minh JWT/DB revoke thật; cập nhật các nhánh UI thành công/chưa xác nhận server |

Single-flight promise hiện tại chỉ điều phối trong một JavaScript context, không tự xử lý nhiều tab. Khi tích hợp M4 phải chốt phạm vi nhiều tab: bổ sung điều phối/thông báo session giữa tab và test nếu cam kết hỗ trợ; nếu chưa hỗ trợ thì ghi giới hạn rõ. Không để refresh hoàn tất ở tab khác âm thầm phục hồi trạng thái local sau khi đã logout. Một session giữa nhiều tab cần phân biệt với hai phiên login A/B độc lập.

**Bổ sung AC-012 / kiểm thử M4 trên backend thật:**

| Ca | Kết quả phải quan sát được |
|---|---|
| Access còn hạn, logout A | UI về `/auth`, token/profile local bị xóa; refresh A thất bại sau logout; phiên login B vẫn refresh được |
| Access hết hạn, refresh còn hạn | Một refresh có điều phối, logout bằng cặp mới cùng sid; refresh cũ và token hiện hành đã revoke không dùng được |
| Refresh đang chạy khi bấm logout | Không dùng cặp token lệch; response chậm không khôi phục session/profile sau cleanup |
| Bấm logout nhiều lần / request thường đồng thời 401 | Không sinh vòng refresh/logout hoặc thu hồi nhầm session; mọi tác vụ tuân thủ trạng thái coordinator |
| Refresh invalid, logout 401/5xx, mất kết nối hoặc timeout | Local cleanup theo UI contract; thông báo không khẳng định revoke thành công khi chưa có bằng chứng; số lần retry hữu hạn |
| Logout server đã commit nhưng response thất lạc | Không báo session server chắc chắn còn sống; phân biệt “chưa xác nhận” với thất bại chắc chắn; retry nếu còn đủ credential tuân hợp đồng idempotent logout |
| Nhiều tab nếu được đưa vào cam kết M4 | Session coordinator liên tab không cho response refresh cũ ghi lại token sau logout; nếu ngoài phạm vi thì ghi NOT RUN/deferred, không tính PASS |

Chạy browser/API E2E trên môi trường local test, dùng token tổng hợp trong bộ nhớ và kiểm row session/refresh API để chứng minh revoke. Không kết luận từ redirect hoặc mock response 200. Các ca hiện NOT RUN; phần sửa báo cáo này không chỉnh frontend hoặc triển khai M4, không làm F12 thành gate chặn M1–M3.

- **Điều kiện đóng:** frontend logout thành công thu hồi đúng server session, kể cả access hết hạn; lỗi mạng vẫn có hành vi UI đã tài liệu hóa và không được báo “server đã thu hồi” khi chưa có bằng chứng. Liên kết AC-012.

### F13 — Đề xuất: bổ sung phụ thuộc bàn giao cho tiến độ chung của nhóm

- **Vị trí:** kế hoạch §2.3 và P8; kiến trúc §6 dòng 214–219.
- **Bằng chứng:** kế hoạch hoãn Event/frontend tới M4; lộ trình tổng thể cần Identity check cho Event ở tuần 2 và demo xuyên service tuần 4. Hai phạm vi không tự mâu thuẫn, nhưng chưa có mốc bàn giao contract/mock client cho người làm Event.
- **Tác động:** service khác có thể phải chờ M3 dù authorization contract thuộc M2; hoặc tự triển khai theo catalog cũ.
- **Đề xuất sửa:** ghi đầu ra và người nhận theo dependency: M1 auth contract, M2 authorization client contract, M3 event schema/topology; nêu công việc có thể làm song song. Không tự đổi ưu tiên invitation đã được người dùng yêu cầu.

**Vị trí cập nhật và bàn giao:** dùng [docs/integration/identity-handoff.md](../../../docs/integration/identity-handoff.md) làm bảng theo dõi tiến độ bàn giao liên service. Cập nhật trạng thái, người phụ trách/người nhận thực tế, ngày hẹn đã thống nhất, artifact, commit/PR và bằng chứng tại đó. Báo cáo F13 mô tả đề xuất và dependency; không dùng số file hoặc số dòng tài liệu để kết luận service đã hoàn thành. Bảng theo dõi không sao chép DTO/schema làm một nguồn contract thứ hai.

| Đầu ra / ID bàn giao | Bên chuẩn bị → bên nhận | Mốc cần bàn giao / phụ thuộc | Nơi cập nhật contract |
|---|---|---|---|
| H01 — Auth, JWT và context header | Identity + Gateway → người làm Gateway/frontend, service nhận context | Freeze M1 trước triển khai phụ thuộc; frontend có thể chuẩn bị client, tích hợp thật ở M4 | `docs/api/catalog.md` §0/§1; sau freeze: `docs/api/services/identity.openapi.yaml`, `docs/api/gateway.openapi.yaml`; F01/F11/F12 để review khác biệt |
| H02 — Authorization check, 10 permission và scope | Identity → Event/Registration/Payment nếu use case cần kiểm quyền | Freeze trước triển khai M2; không phụ thuộc outbox M3 | `docs/api/catalog.md` §0/§1, `docs/architecture.md` §3.1.1; sau freeze: Identity OpenAPI; F03/F05 |
| H03 — Resolver event/org | Event + Identity → hai bên tích hợp | Thống nhất contract trước M4; chuẩn bị interface/test stub sớm được, không tuyên bố M2 Event E2E | Ghi chú F05 tại `shared/contracts/events/README.md`; cập nhật catalog, sau freeze đưa vào `docs/api/services/event.openapi.yaml` |
| H04 — Event Identity, trigger/revision/topology | Identity + người phụ trách broker → các consumer tương lai được giao | Contract cần chốt theo mốc bắt đầu ghi event F02/F10; worker/delivery M3 | `shared/contracts/events/README.md`, JSON Schema versioned trong cùng thư mục khi tạo; `docs/api/messaging.md` khi tạo/freeze; không tự thêm consumer MUST |
| H05 — API chạy thật, dữ liệu và kết quả tích hợp | Identity + Gateway → thành viên tích hợp từng service | Theo M1/M2/M3 tương ứng; không đợi mọi mốc xong mới bàn giao phần đã kiểm chứng | Hướng dẫn chạy trong `services/identity-service/README.md` và Gateway README; kết quả/giới hạn trong báo cáo nghiệm thu riêng dưới `services/identity-service/report/`; tracker dẫn tới bằng chứng |

Tên OpenAPI và vị trí lấy theo quy ước [docs/api/README.md](../../../docs/api/README.md) và [services README](../../../docs/api/services/README.md); các spec/messaging được nêu là artifact cần tạo khi freeze, không phải file đã tồn tại. Catalog còn là bản nháp nguồn API hiện hành; ghi chú event contract và review hiện mang trạng thái đề xuất. Khi freeze, đồng bộ cả catalog/spec/ADR liên quan trong cùng PR có bên nhận review, không để hai shape cùng tự nhận đã có hiệu lực.

**Quy tắc phối hợp:** tách trạng thái contract (`DRAFT → IN_REVIEW → FROZEN`), implementation (`NOT_STARTED → IN_PROGRESS → IMPLEMENTED`) và integration (`NOT_RUN → PASS/FAIL/BLOCKED`). Có contract FROZEN chỉ cho phép bên nhận triển khai theo giao diện đã chốt, không chứng minh API đang chạy. Stub/fixture PASS chỉ chứng minh phạm vi test đó; chỉ đánh dấu bàn giao E2E khi có provider thật và bằng chứng các service đã gọi nhau.

Event có thể viết client authorization/check theo H02 trong khi Identity làm phần còn lại; Gateway có thể nối auth theo H01; phần Event resolver có thể chuẩn bị interface theo H03. Không kéo integration M4 lên M2 hoặc biến M1–M4 thành tuần 1–4 một cách ngầm. Ngày cụ thể, người phụ trách thực tế và reviewer được nhóm điền vào tracker; không tự gán tên hoặc deadline chưa được thống nhất.

**Điều kiện hoàn tất đề xuất F13:** mỗi đầu ra H01–H05 có người phụ trách/người nhận, artifact và trạng thái rõ; phần chưa có lịch ghi chưa chốt. Bên nhận tìm được contract version, hướng dẫn chạy/test hoặc stub có giới hạn; bằng chứng integration tách khỏi contract review. Tracker ghi blocker/dependency, hành động tiếp theo và commit/PR thay vì mô tả chung “đã xong Identity”.

<a id="f14"></a>

### F14 — Đề xuất: tập trung quyết định P0 và bằng chứng vào một bảng theo dõi

- **Vị trí:** kế hoạch §2.2, P0 dòng 220–228, §11.2, §13 dòng 438.
- **Bằng chứng:** quyết định mở rải ở nhiều phần; chưa có mapping từng quyết định sang artifact chốt và ca nghiệm thu. Chưa có SLA hiệu năng, và kế hoạch đã ghi nhận đúng việc này.
- **Tác động:** dễ quên đóng một đề xuất trước khi viết handler hoặc coi số đo local là chuẩn đã duyệt.
- **Đề xuất sửa:** bảng `decision ID → mốc → trạng thái → contract/ADR → test ID`. Ghi baseline Argon2 gồm máy/container/concurrency như kế hoạch, không tự thêm ngưỡng performance hay bắt chốt lại những quyết định đã được người dùng xác nhận.

**Vị trí cập nhật chính:** [identity-handoff.md — Quyết định P0 và bằng chứng](../../../docs/integration/identity-handoff.md#p0-decisions). Dùng các mã D00–D13 để theo dõi quyết định, liên kết đầu ra H01–H05 ở F13 và giữ bằng chứng theo cùng decision ID. “P0” là bước chuẩn bị trước mốc phụ thuộc: quyết định M2/M3/M4 được đóng trước phần việc tương ứng, không bắt freeze tất cả integration M4 trước khi bắt đầu M1.

| Loại thông tin | Nơi cập nhật | Quy tắc |
|---|---|---|
| Nội dung lựa chọn và trạng thái quyết định | Bảng D00–D13 trong handoff §6 | Phân biệt quyết định đã có nguồn, đã ghi nhận trong review và mới là đề xuất; lưu người phụ trách/reviewer/PR khi có |
| Contract/ADR có hiệu lực | Catalog, OpenAPI, event schema/messaging, ADR theo từng dòng D | Tracker chỉ ghi lựa chọn tóm tắt và link/version, không tạo một bộ DTO/schema riêng |
| Triển khai | Trạng thái implementation theo decision và H tương ứng | Chỉ nâng khi có code/config/migration và commit/PR; tài liệu được bổ sung chưa phải đã IMPLEMENTED |
| Bằng chứng | Nhật ký evidence §6.3 của handoff và báo cáo nghiệm thu mốc | Ghi test ID, môi trường/version, expected/actual, kết quả và link artifact; không suy PASS từ contract đã chốt |
| Lịch sử thay đổi | Handoff §5 và log revision trong artifact liên quan | Không ghi đè quyết định cũ mà mất nguồn; thay đổi contract đã freeze phải có review bên bị ảnh hưởng |

**Quy tắc chốt:** các quyết định nghiệp vụ đã ghi trong MASTER_PLANT §2.1 được dẫn nguồn, không hỏi lại. Riêng đoạn F02 đã ghi lựa chọn outbox từ M1 được đánh dấu RECORDED_REVIEW, cần đồng bộ kế hoạch/catalog chứ không giả đã freeze toàn bộ contract. TTL idempotency 24 giờ, Prisma, mapping lỗi mới, resolver Event, MembershipChanged snapshot/revision và tham số Argon2id khởi điểm vẫn là đề xuất nếu chưa có nguồn xác nhận thêm.

Để chuyển một đề xuất sang ACCEPTED phải có phương án cụ thể, nguồn quyết định/reviewer, artifact đồng bộ và version/commit/PR khi có. Chi tiết kỹ thuật thông thường được chốt trong phạm vi đã giao; chỉ cần xác nhận riêng khi thay đổi nghiệp vụ/phạm vi hoặc có tác động rủi ro theo workflow. Không tạo vòng xin duyệt lại mọi chi tiết kỹ thuật hoặc tự gán reviewer/cá nhân/deadline.

**Bằng chứng hiệu năng:** theo D13, ghi Node/NestJS/Prisma/Argon2/image versions, CPU/RAM cấp container, cấu hình máy, tham số hash, số request tuần tự/đồng thời, thời gian đo, p50/p95, error/timeout rate và giới hạn phép đo. Chỉ báo baseline đo được; chưa có SLA được cung cấp nên không tự đặt ngưỡng rồi tuyên bố đạt production. Môi trường test riêng, dữ liệu tổng hợp và không chạy load test trong phiên cập nhật tài liệu.

**Điều kiện hoàn tất đề xuất F14:** D00–D13 có mốc phụ thuộc, liên kết H, trạng thái quyết định/triển khai/kiểm chứng tách biệt; mỗi quyết định đã chốt có nguồn và mỗi PASS có evidence. Các phần chưa quyết định/chưa chạy ghi rõ, không biến proposal thành yêu cầu đã duyệt. Bảng handoff và contract liên quan không mâu thuẫn về phiên bản hoặc trạng thái.

## 5. Tiêu chí nghiệm thu bổ sung đề xuất

Các AC dưới đây bổ sung cho ma trận hiện tại, không thay thế các ca đã có. Tất cả đang **NOT RUN**. “Bắt buộc” áp dụng cho mốc được ghi; AC thuộc M4 không chặn M1–M3. Expected result còn lựa chọn contract phải được đóng trước khi dùng làm gate, không đánh dấu PASS bằng mô tả định tính.

### AC-001 — Context phiên và logout (M1, bắt buộc)

- **Điều kiện:** một user có phiên A/B, user khác có C; có access/refresh tương ứng và clock điều khiển trong test.
- **Trigger:** logout A bình thường; lặp lại; gửi access A + refresh B/C; giả header phiên; thử access hết hạn.
- **Kỳ vọng:** bình thường trả 200 `{status:"OK"}`, A không refresh được, B/C còn dùng được. Pair lệch bị từ chối theo status đã freeze, không revoke B/C. Header client không thay đổi sid được verify. Access hết hạn bị chặn; refresh hợp lệ rồi logout theo flow đã chọn. Retry với access/refresh hiện hành đã revoke nhưng còn chứng minh được A trả OK như contract.
- **Không được:** thu hồi phiên khác hoặc coi decode JWT chưa verify là bằng chứng sid.
- **Kiểm chứng/an toàn:** E2E Gateway + integration DB test cô lập; chỉ dùng token tổng hợp trong RAM, không ghi token vào báo cáo. Liên kết SES-04/05 và F01/F11.

### AC-002 — Mốc bảo đảm event và nâng cấp outbox (M1→M3, bắt buộc trước nghiệm thu M3)

- **Điều kiện:** DB có dữ liệu M1/M2 và các mutation kiểm thử trước/sau cutover đã chọn.
- **Trigger:** áp migration và bật cơ chế ghi/phát outbox theo quyết định F02.
- **Kỳ vọng:** giữ dữ liệu và session cũ; mỗi mutation nằm trong phạm vi bảo đảm có outbox cùng transaction; rollback không tạo outbox. Nếu không hồi tố, dữ liệu trước cutover được ghi rõ là ngoài lịch sử bảo đảm, không báo đã replay.
- **Không được:** drop/reset DB hoặc bịa event lịch sử từ trạng thái hiện tại.
- **Kiểm chứng/an toàn:** integration upgrade DB dùng volume riêng; so sánh row/invariant trước và sau; không chạy migration trong phiên review.

### AC-003 — Bảng quyết định authorization (M2, bắt buộc)

- **Điều kiện:** OWNER/ADMIN A, user B, SPEAKER E1; E1/A và E2/B có fixture tin cậy.
- **Trigger:** gọi check cho ORG/EVENT, thiếu field, sai enum, permission lạ, inactive membership và LOCKED target user.
- **Kỳ vọng:** OWNER/ADMIN A chỉ được permission hợp lệ trên A/E1; SPEAKER chỉ `event.read` E1; mọi tổ hợp không có quyền bị deny. Input không hợp lệ trả status/body chính xác theo bảng F03, không fallback mở rộng scope.
- **Không được:** lấy org do client công khai tự khai làm bằng chứng sở hữu event.
- **Kiểm chứng/an toàn:** integration Identity và contract test nội bộ; fixture không được chứng nhận là Event E2E.

### AC-004 — Idempotency phân biệt target (M2, bắt buộc)

- **Điều kiện:** OWNER có hai target membership/invitation và một key test.
- **Trigger:** retry tuần tự/đồng thời cùng request; đổi body hoặc path target với cùng key; replay sau khi actor mất quyền.
- **Kỳ vọng:** request giống nhau chỉ một mutation, trả kết quả theo contract; target/body khác được tách hoặc conflict theo phạm vi khóa đã chốt; replay mất quyền tuân theo policy đã freeze. Test TTL bằng clock theo giá trị đã chọn.
- **Không được:** trả thành công của target A cho mutation target B chưa chạy hoặc bypass quyền do cache.
- **Kiểm chứng/an toàn:** DB integration + Gateway E2E cô lập; kiểm row và kết quả nghiệp vụ, không chỉ đếm HTTP 200.

### AC-005 — Event assignment không xác minh được (M2, bắt buộc)

- **Điều kiện:** ứng dụng cấu hình M2 thông thường không có adapter Event thật; fixture adapter chỉ trong test.
- **Trigger:** OWNER gán role/invite kèm event không xác minh được, rồi chạy cùng ca trên fixture E1/E2.
- **Kỳ vọng:** môi trường thông thường từ chối theo lỗi contract, không ghi assignment/membership; fixture kiểm được đúng scope và bị tách khỏi cấu hình chạy bình thường.
- **Không được:** chấp nhận org/event tùy ý hoặc tuyên bố đã tích hợp Event thật.
- **Kiểm chứng/an toàn:** test cấu hình + integration DB; không gọi service ngoài repo.

### AC-006 — Serialize quyền và mutation (M2, bắt buộc)

- **Điều kiện:** A/B là OWNER cùng org; có lời mời do A tạo và giao dịch hạ quyền A.
- **Trigger:** dùng barrier có kiểm soát cho accept/gán role chạy cạnh tranh với hạ quyền; chạy hai thứ tự serialize.
- **Kỳ vọng:** quyết định dựa trên quyền tại điểm serialize đã chốt; nếu hạ quyền hoàn tất trước thì mutation đòi quyền cũ bị từ chối. Nếu mutation hợp lệ commit trước, kết quả được giữ theo contract. OWNER cuối cùng vẫn được bảo toàn.
- **Không được:** ghi role sau check quyền stale ngoài transaction bảo vệ; deadlock không được biến thành thành công giả.
- **Kiểm chứng/an toàn:** integration PostgreSQL thật trong DB test riêng, timeout hữu hạn và evidence trạng thái cuối.

### AC-007 — Constraint và migration nâng cấp (M1/M2, bắt buộc theo schema tương ứng)

- **Điều kiện:** DB sạch và DB M1 có user/session/org tổng hợp; migration được review và seed local.
- **Trigger:** migrate, seed hai lần, thử email khác case/role hệ thống/assignment ORG trùng, rồi upgrade M2.
- **Kỳ vọng:** uniqueness và scope theo F07 được thi hành; schema lên đúng phiên bản; dữ liệu cũ không mất; session chưa hết hạn vẫn dùng được. Tạo lời mời sau expiry cũ không sinh hai PENDING hữu hiệu.
- **Không được:** `db push` thay lịch sử hoặc reset volume để test pass.
- **Kiểm chứng/an toàn:** migration/DB integration trên project test riêng; ghi schema version và so sánh dữ liệu đã che thông tin.

### AC-008 — Unroutable không thành sent giả (M3, bắt buộc)

- **Điều kiện:** event đã có trong outbox; topology test bị gỡ binding có chủ đích.
- **Trigger:** publish khi thiếu binding, sau đó khôi phục và retry theo policy.
- **Kỳ vọng:** worker phát hiện route thất bại theo thiết kế đã chốt, không coi confirm đơn lẻ là delivery thành công; retry dùng cùng event ID và message ID; queue test nhận event khi binding trở lại.
- **Không được:** xóa/đánh dấu sent thành công giả khiến event không thể retry.
- **Kiểm chứng/an toàn:** RabbitMQ + DB trong project test; không thay topology broker demo/shared.

### AC-009 — Broker lifecycle và storage (M3, bắt buộc cho bảo đảm local đã cam kết)

- **Điều kiện:** queue test durable có message persistent đã confirm; storage test tách demo.
- **Trigger:** restart broker, rồi một ca recreate/down-up có giữ storage theo hướng dẫn tương lai.
- **Kỳ vọng:** sau hồi phục trong thời gian chờ hữu hạn do test cấu hình, cùng event ID còn đọc được; outbox chưa confirm vẫn retry được.
- **Không được:** dùng kết quả restart cùng container để khẳng định đã kiểm chứng recreate; xóa volume demo.
- **Kiểm chứng/an toàn:** integration lifecycle ở môi trường test do người triển khai chủ động dựng sau này; phiên review không chạy thao tác này.

### AC-010 — Event schema và rollback (M3, bắt buộc)

- **Điều kiện:** có JSON Schema ba event Identity và sample assignments E1/E2 theo contract đã chốt.
- **Trigger:** validate payload hợp lệ/thiếu field; commit/rollback register, tạo org, đổi role, accept invitation theo bảng trigger.
- **Kỳ vọng:** schema phân biệt scope, trigger và version; mutation commit tạo đúng tập event đã định nghĩa, rollback không phát event. Crash/retry giữ event ID như EVT-03.
- **Không được:** suy dedupe thành bảo đảm ordering hoặc phát email/token/hash password vào payload.
- **Kiểm chứng/an toàn:** schema test + PostgreSQL/RabbitMQ integration với dữ liệu tổng hợp; chưa đòi consumer Notification thật.

### AC-011 — Account status, health và lỗi Gateway (M1, bắt buộc)

- **Điều kiện:** user đã có token, DB/Identity đang healthy; contract đã chốt status refresh LOCKED, protected route LOCKED, health/readiness và timeout.
- **Trigger:** fixture chuyển user sang LOCKED; gọi refresh và `/users/me`; DB mất kết nối sau startup; Identity tắt hoặc trả chậm quá timeout test.
- **Kỳ vọng:** token không bypass trạng thái hiện tại tại Identity; refresh không cấp token mới cho LOCKED. Readiness không báo sẵn sàng giả; Gateway trả đúng 502/504/error code đã freeze và request ID; success status các POST khớp OpenAPI/catalog.
- **Không được:** trả profile/token cho tài khoản bị chặn hoặc lộ secret/stack trace qua lỗi.
- **Kiểm chứng/an toàn:** integration/E2E isolated, fault injection chỉ trong test; không thêm API khóa user hoặc SLA production.

### AC-012 — Frontend logout với backend thật (M4, bắt buộc khi tích hợp)

- **Điều kiện:** frontend kết nối Gateway thật; có hai phiên, gồm ca access hết hạn nhưng refresh còn hạn.
- **Trigger:** logout phiên hiện tại từ UI.
- **Kỳ vọng:** flow gửi verified access/session context theo M1, thu hồi đúng server session; phiên kia vẫn refresh được. Nếu lỗi mạng, UI xử lý theo hợp đồng nhưng không tuyên bố server đã thu hồi thành công.
- **Không được:** dùng mock logout không auth làm bằng chứng backend đã thu hồi.
- **Kiểm chứng/an toàn:** browser/API E2E local ở M4, tài khoản test và token không lưu vào artifact.

## 6. Trình tự xử lý đề xuất và quyết định cần đóng

1. **P0/M1:** đóng F01; đưa DTO/status/JWT context, health/readiness, schema/index và scripts vào artifact review được. Giữ nguyên quyết định token lifetime và logout phiên hiện tại.
2. **Trước freeze M2:** chốt F03–F07; ghi rõ ORG API chạy thật, EVENT scope mới ở mức fixture; bổ sung AC-003–AC-007.
3. **Trước freeze M3:** đóng F02; JSON Schema + topology + điều kiện mark sent + broker storage theo F08–F10; bổ sung AC-002 và AC-008–AC-010.
4. **Handoff M4:** ghi tác vụ sửa logout và adapter Event; không sửa frontend trong công việc review này.

| Quyết định | Mốc chặn | Đầu ra cần có | Người/nguồn quyết định |
|---|---|---|---|
| Nguồn verified `sid` và header trust | Contract auth M1 | Gateway–Identity contract/ADR + AC-001 | Người triển khai đề xuất trong kiến trúc đã chốt; thay đổi mô hình verify cần duyệt tương ứng |
| Phạm vi event trước/sau cutover | Bảo đảm M3 | Quyết định cutover/lịch sử + AC-002 | Chủ phạm vi Identity/tích hợp; không suy nhu cầu hồi tố từ code |
| Shape authorization, phạm vi key và TTL | Contract M2 | OpenAPI/schema + AC-003/004 | Chi tiết kỹ thuật được xử lý và ghi lại; thay đổi nghiệp vụ phải xác nhận |
| EVENT assignments ở M2 | Bàn giao M2 | Ma trận hỗ trợ + lỗi khi thiếu resolver | Giữ giới hạn fixture theo kế hoạch hiện tại |
| Trigger/payload/version và topology event | Contract M3 | JSON Schema + messaging contract | Chủ producer và bên tích hợp theo quy tắc catalog |

Không cần hỏi lại NestJS, HS256, 15 phút/7 ngày, nhiều OWNER hoặc lời mời user đã đăng ký. Review không tiến hành triển khai rủi ro nên không cần xin phép để tạo báo cáo đã được yêu cầu. Các quyết định chưa đóng được ghi lại để xử lý ở mốc phụ thuộc.

## 7. Bằng chứng và trạng thái kiểm chứng

| Hạng mục | Trạng thái | Bằng chứng/giới hạn |
|---|---|---|
| Đọc đủ kế hoạch và đối chiếu nguồn liên quan | DONE | Kiểm tra tĩnh trên working tree; vị trí nguồn trong từng F |
| Xác minh hiện trạng Identity/Gateway | DONE | Cây file hiện có là README và kế hoạch, chưa có backend executable/test suite |
| Build/typecheck/lint backend | NOT RUN | Chưa có package/scripts backend; review không cài dependency |
| Migration/seed/DB constraints/races | NOT RUN | Chưa có migration hoặc test implementation; AC là đề xuất |
| Gateway/auth/RBAC E2E | NOT RUN | Chưa có ứng dụng Identity/Gateway chạy thật |
| RabbitMQ delivery/replay/lifecycle | NOT RUN | Không chạy broker hoặc thay cấu hình ở phiên này |
| Nghiệm thu M1/M2/M3 | NOT VERIFIED | Không được chuyển các kết luận đặc tả thành kết quả test PASS |

Kết luận sử dụng: **tiếp tục P0 và chuẩn bị M1; đóng các hợp đồng còn thiếu trước phần triển khai phụ thuộc; chưa nghiệm thu M1, M2 hoặc M3.** Giữ cấu trúc kế hoạch hiện tại và sửa đúng khoảng trống có bằng chứng, không cần viết lại toàn bộ tài liệu.
