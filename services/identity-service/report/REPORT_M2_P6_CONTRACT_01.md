# M2/P6 — Contract review

Ngày: 14/11/2026 (Asia/Saigon). **ACCEPTED cho P6** — người dùng trả lời “xác nhận toàn bộ” sau khi xem gói A–E bên dưới. ADR 0004 ghi quyết định riêng P6; ADR 0003/A–E P5 không phải nguồn duyệt P6. Nội dung đề xuất giữ làm hồ sơ lựa chọn được duyệt. Không commit.

Tiếp tục [MASTER_PLAN/P6](../MASTER_PLAN.md), không lập kế hoạch tổng thể mới. Đã đối chiếu HANDOFF_M2_P6_01, REPORT_M2_P0_CONTRACT_01, REPORT_M2_P5_ORGANIZATION_RBAC_01, REVIEW_MASTER_PLAN01 (F04–F07/F10/F11), ADR 0002/0003, docs/integration/identity-handoff.md (D06/D07/D08/D09/D12), docs/api/catalog.md, docs/architecture.md, Identity OpenAPI và events/README/MembershipChanged v1. Đã kiểm source app, organization DTO/authorization/transaction, Gateway proxy/routes, Prisma schema, test harness và Compose evidence writer.

Provider: Identity; consumer trực tiếp: Gateway/Swagger/API client; người dùng xác nhận contract. Chưa gán reviewer Event hoặc consumer M4. HTTP authority tiếp tục là `shared/contracts/http/identity.openapi.json`; sau xác nhận bổ sung additive v1.2.0, generate Gateway projection và consumer types bằng scripts hiện có, review diff; không sửa `identity.d.ts` bằng tay. MembershipChanged schema v1 hiện đã biểu diễn CREATED, không cần thêm event type/version hoặc consumer.

## Hiện trạng trước implementation và baseline lượt này

Working tree có thay đổi M1/P5 tracked/untracked trước khi làm P6; giữ nguyên. Chưa có bảng/module/routes invitation. Catalog còn dòng STRETCH mời user chưa đăng ký, trái nghiệp vụ đã chốt; sửa sau freeze P6. MASTER_PLAN còn checkbox/trạng thái lịch sử; không dùng chúng phủ nhận implementation P5.

| Lệnh thực sự chạy | Expected | Actual |
|---|---|---|
| `git status --short` | Xác định thay đổi có sẵn | Exit 0; M1/P5 dirty, không reset/clean |
| `node C:/Users/trank/.codex/plugins/cache/ecc/ecc/2.2.3/scripts/setup-package-manager.js --detect` | Xác định package manager | Exit 0, npm từ package.json và lockfile; test runner Jest qua script đã đọc |
| `node --version`, `npm --version` | Xác định runtime | v24.19.0; 11.17.0 |
| `npm run typecheck` | Build runtime/Identity/Gateway + typecheck tests | Exit 0 — PASS |
| `npm run contracts:check` | Local refs/OpenAPI/Gateway projection | Exit 0 — PASS |
| `node scripts/test-db.cjs --migrate --seed --coverage` | Regression M1/P5 trên DB riêng, không reset demo DB | Exit 0; 3 migrations, seed hai lần; 16 suites/68 tests PASS, không skipped; Jest 26.317s |

Coverage lượt này: statements **98.19%**, branches **90.90%**, functions **100%**, lines **98.32%**, threshold 80% PASS. PostgreSQL container riêng `lamu-m1-test-1794651313173`, image `postgres:16-alpine`, tmpfs/loopback port; harness xóa đúng container test khi xong. Không ghi đè artifact M1/P5. Đây là run mới, không lấy con số lịch sử làm kết quả. ORG/Gateway/Identity là provider thật, EVENT chỉ fixture injection trong tests P5, không Event service thật. Chưa chạy Compose lượt này vì script hiện ghi evidence M1/P5 cố định; cần thêm output P6 riêng trước run P6.

## A — D08: HTTP DTO/status/error

Mọi route dưới đây là Identity path; Gateway thêm `/api`. JWT/context theo M1; actor không lấy từ body. Object đóng field thừa, UUID lowercase, thời gian UTC RFC3339 Z, error envelope và request_id hiện tại giữ nguyên. Bốn POST bắt buộc một Idempotency-Key theo format P5; GET không cần key. Không đổi auth/session hoặc policy P5.

| Operation | Request đề xuất | Success đề xuất |
|---|---|---|
| POST `/organizations/{orgId}/members/invitations` | `{email,roles:[Assignment]}`; email trim/lowercase, email hợp lệ, <=254 ký tự; roles bắt buộc 0–100, tập unique/sorted theo code/type/id như P5 | **201** `{invitation_id,status:"PENDING",expires_at}` |
| GET `/users/me/invitations` | Chỉ `limit` integer 1–100/default 20 và `offset` 0–2147483647/default 0; không filter status | **200** `{items:[Invitation],total,limit,offset}` |
| POST `/users/me/invitations/{id}/accept` | Body bỏ trống hoặc `{}`; không nhận roles/actor/target | **200** `{invitation_id,status:"ACCEPTED",membership_id}` |
| POST `/users/me/invitations/{id}/decline` | Body bỏ trống hoặc `{}` | **200** `{invitation_id,status:"DECLINED"}` |
| POST `/organizations/{orgId}/members/invitations/{id}/revoke` | Body bỏ trống hoặc `{}` | **200** `{invitation_id,status:"REVOKED"}` |

`Assignment` tái dùng canonical RoleAssignment P5: OWNER/ADMIN + ORG + đúng orgId; SPEAKER/ATTENDEE + EVENT + event UUID được resolver xác minh. Cho roles rỗng nhất quán P5: thành viên ACTIVE không role, không quyền quản trị; OWNER có thể mời OWNER khác. Snapshot bất biến sau create, không có API sửa lời mời.

`Invitation` có đúng `{id,organization_id,organization_name,organization_slug,inviter_user_id,roles,status,created_at,expires_at,processed_at}`; processed_at nullable, không email/contact/session. Chỉ list invitee_user_id bằng actor; trả tất cả lifecycle, sort created_at DESC rồi id DESC, total/page cùng snapshot DB; empty items hợp lệ. PENDING hết hạn hiển thị EXPIRED với processed_at=expires_at, kể cả chưa materialize DB; GET không mutation. Offset không bảo đảm snapshot xuyên nhiều request khi có lời mời mới.

| Điều kiện | Status/code đề xuất |
|---|---|
| Input/body/query/role/scope/duplicate assignment sai | 400 VALIDATION_FAILED |
| Thiếu key / key sai hoặc trùng header | 400 IDEMPOTENCY_KEY_REQUIRED / VALIDATION_FAILED |
| Thiếu/sai token/context hoặc actor không còn tồn tại | 401 UNAUTHENTICATED |
| Actor LOCKED; creator/revoker không OWNER ACTIVE đúng org | 403 FORBIDDEN |
| Create: email không có tài khoản | 404 NOT_FOUND, chỉ lookup sau quyền OWNER |
| Create: invitee LOCKED | 403 FORBIDDEN, không tạo lời mời |
| Create: đã có membership ACTIVE **hoặc INACTIVE** | 409 ALREADY_MEMBER; không reactivate/ghi đè |
| Create: đã có PENDING chưa hết hạn cùng org/invitee | 409 INVITATION_ALREADY_PENDING, không thay snapshot/hạn |
| Invitation không tồn tại; revoke org không khớp | 404 NOT_FOUND; revoke kiểm quyền org URL trước lookup invitation |
| Accept/decline sai người nhận | 403 FORBIDDEN; không trả DTO/snapshot người khác |
| Mutation mới trên EXPIRED hoặc PENDING đã quá hạn | 409 INVITATION_EXPIRED |
| Mutation mới trên ACCEPTED/DECLINED/REVOKED | 409 INVITATION_NOT_PENDING, kể cả cùng action nhưng key mới |
| Accept: inviter LOCKED/membership INACTIVE/mất OWNER; invitee LOCKED | 403 FORBIDDEN |
| Accept: invitation còn hợp lệ nhưng membership đã tồn tại, kể cả INACTIVE | 409 ALREADY_MEMBER, giữ membership/roles và invitation PENDING |
| Key khác body/target; chờ key >2s; lock nghiệp vụ timeout | 409 CONFLICT / IDEMPOTENCY_IN_PROGRESS / CONFLICT |

Thứ tự fresh transition sau authorization/recipient: trạng thái/expiry → accept inviter/target eligibility → scope → write. Lỗi 429/500/502/504 và envelope giữ M1/P5; không leak SQL/stack. Resolver thiếu: 409 EVENT_SCOPE_UNVERIFIED; event không có: 404 NOT_FOUND; sai org: 403 FORBIDDEN; response lỗi/offline: 502 UPSTREAM_UNAVAILABLE; timeout: 504 UPSTREAM_TIMEOUT.

## B — D08/D07: lifecycle, expiry và uniqueness

Đề xuất invitation sống **7 ngày tuyệt đối** từ created_at; không kéo dài bởi list/retry. Chỉ server tạo timestamps, không nhận expires_at từ client. `expires_at <= now` là hết hạn, dùng clock đọc lại sau mọi khóa; không dùng transaction-start timestamp cho quyết định sau chờ.

Lifecycle một chiều PENDING → ACCEPTED/DECLINED/REVOKED/EXPIRED. processed_at NULL khi PENDING; thời điểm xử lý khi accepted/declined/revoked, bằng expires_at khi EXPIRED. Không tự đổi status khi inviter mất quyền; fresh accept bị từ chối, recipient vẫn decline được. Bất kỳ OWNER hiện tại đúng org được revoke, không chỉ người gửi ban đầu. Decline không đòi inviter còn quyền hoặc recipient đã có membership; recipient ACTIVE là đủ.

Migration mới additive tạo organization_invitations: UUID/FK org, inviter, invitee; JSONB snapshot roles normalize server-side; status/timestamps; FK RESTRICT, CHECK lifecycle/expiry/timestamp consistency và JSON array; domain kiểm toàn bộ shape/scope. Partial unique `(organization_id,invitee_user_id) WHERE status='PENDING'`, không dùng `now()` trong index. Index list theo invitee/created_at/id. Không sửa migration đã chạy, không reset/db push/seed lại để xóa dữ liệu. Bảng mới không cần concurrent index trên bảng cũ. Rollback app giữ schema additive; rollback production bằng forward migration được review, không tự destructive DOWN.

Create dưới org lock chuyển PENDING hết hạn của đúng org/invitee sang EXPIRED rồi insert mới cùng transaction. Fresh accept/decline/revoke gặp hết hạn có thể commit **chỉ** chuyển EXPIRED rồi trả 409 sau commit; không lưu error idempotency, không membership/event/revision. Lỗi khác rollback toàn bộ. Không worker/cleanup tự động. DB status PENDING có thể còn ở lời mời hết hạn chưa chạm; API list luôn tính effective status, không cấp quyền từ nó.

## C — D07: transaction và giao thức khóa

Tương thích P5: **idempotency key → organizations theo UUID → users actor/inviter/invitee unique theo UUID → invitation theo UUID → membership/assignments**. Lock org chung serialize role replacement và các invitation mutation; không lấy invitation trước user lock. Nhiều target do key conflict thì khóa tập org/users theo thứ tự ổn định, kiểm quyền trước trả cache/conflict. Lookup ban đầu chỉ tìm IDs/metadata để khóa; đọc lại org/recipient/inviter/snapshot dưới khóa, không lấy preflight làm bằng chứng quyền.

Sau chờ khóa kiểm actor/invitee/inviter ACTIVE theo từng action, membership inviter ACTIVE + OWNER đúng org, recipient/URL org, status/expiry, role scope và membership đích. Accept tạo membership ACTIVE revision 1 + assignments từ snapshot + invitation ACCEPTED + MembershipChanged + success idempotency trong **một transaction**. Không update membership đã tồn tại. Fault injection sau ghi từng phần phải rollback cả result/state/outbox.

EVENT create/accept cần resolver test được inject tường minh, resolve ngoài transaction/DB lock; sau resolve mở lại transaction theo cùng thứ tự và kiểm lại toàn bộ local policy/expiry. Snapshot so lại, không dùng client role. Replay thành công không resolve lại. Không Event HTTP thật/M4 hoặc fallback fixture; quan hệ Event lifecycle/chuyển org tương lai chưa được bảo đảm bởi transaction local. Không mở API LOCKED/INACTIVE mới.

## D — D06: idempotency riêng P6

Đề xuất tái dùng policy **TTL 24h từ completed_at cuối transaction**, không gia hạn khi replay; key lock **2s**, business lock timeout 409 CONFLICT, không auto retry Gateway. Bốn operation riêng CREATE_INVITATION/ACCEPT_INVITATION/DECLINE_INVITATION/REVOKE_INVITATION; unique actor/operation/key. Hash SHA-256 JSON key ổn định gồm method/operation/path target/body canonical: create org+email+roles; accept/decline invitation ID+{}; revoke org+invitation ID+{}. Không token/request ID; roles không thứ tự. Persist metadata invitation ID thêm nullable vào idempotency_records để kiểm target/replay; giữ nguyên records/revision/backlog M1/P5.

| Cached success trong TTL | Quyền hiện tại cần kiểm trước cache/conflict |
|---|---|
| Create | Actor ACTIVE, membership ACTIVE và OWNER hiện tại của org; không đòi invitation còn PENDING hoặc invitee chưa thành member |
| Accept | Actor ACTIVE, đúng recipient; membership của kết quả vẫn ACTIVE; không đòi roles còn bằng snapshot, invitation PENDING/chưa expiry hoặc inviter còn OWNER |
| Decline | Actor ACTIVE, đúng recipient; không đòi membership/inviter quyền hoặc trạng thái PENDING |
| Revoke | Actor ACTIVE, membership ACTIVE và OWNER hiện tại đúng org; không đòi PENDING hoặc còn là inviter |

Accept thành công rồi inviter bị hạ quyền không thu hồi membership đã cấp; replay chỉ trả kết quả cũ theo quyền recipient hiện tại. Nếu membership kết quả bị INACTIVE thì replay accept 403. Không dùng các precondition của mutation mới chặn cached success. Key conflict kiểm quyền target yêu cầu và target đã lưu trước trả 409, không lộ cached result. Hết TTL thay record dưới cùng khóa, xử lý fresh state: accept đã ACCEPTED trả INVITATION_NOT_PENDING; create nếu còn PENDING trả INVITATION_ALREADY_PENDING. Không exactly-once vô hạn, không cache lỗi/commit IN_PROGRESS riêng.

## E — D12: trigger và giới hạn nghiệm thu

Fresh accept tạo membership mới ghi đúng **một MembershipChanged v1 / CREATED / revision 1**, payload toàn bộ snapshot server; ORG NULL persistence serialize thành org UUID. Create/decline/revoke/expire không đổi membership nên không MembershipChanged/revision. Replay/rollback không event/revision mới. Không invitation event, email, consumer, RabbitMQ worker M3 hoặc frontend/Event thật M4.

Sau xác nhận: canonical/projection/generated types trước handler; TDD ghi RED hợp lệ trước production code rồi cùng target GREEN; PostgreSQL thật cho migration/constraint/rollback/races. Test mapping theo INV-01–06, AC-004–007, F11-INV-01/02 và yêu cầu người dùng: wrong recipient/org/role, thiếu key/token, LOCKED/INACTIVE, inviter demotion, expiry khi chờ khóa, race accept/accept/decline/revoke, idempotency race/replay/conflict/TTL, canonical responses. Run full M1/P5/P6 coverage >=80%, Compose flow ORG P6 với output evidence riêng, security review. EVENT fixture ghi tách provider thật; normal thiếu resolver phải fail closed. Manual Swagger/DOC-01 chưa chạy ghi NOT RUN; không báo toàn M2 hoàn tất nếu còn gate.

**Đã nhận xác nhận A–E trước canonical/migration/handler phụ thuộc.** Nguồn chặn là yêu cầu trực tiếp của người dùng và HANDOFF_M2_P6_01, không phải suy từ skill hoặc ADR P5. TDD checkpoint commit không áp dụng vì người dùng yêu cầu không commit; evidence sẽ giữ trong báo cáo.

## Kết quả sau xác nhận

Người dùng xác nhận toàn bộ A–E; đã triển khai canonical v1.2.0, Gateway projection/types generate, migration additive và NestJS invitation. Contract RED2 → GREEN8 gồm M1/P5/P6; API RED8 → GREEN, thêm RED/GREEN membership-lock refinement. Full cuối20 suites/99 tests PASS, coverage statements98.05/branches91.44/functions98.76/lines98.11%. Compose P6 artifact01 và02 PASS, bản02 sau sửa khóa. Typecheck/contracts/format/diff-check PASS; production audit0 vulnerabilities. Chi tiết commands/failures/guarantees/security/giới hạn tại [báo cáo implementation](REPORT_M2_P6_INVITATION_01.md). Manual Swagger/DOC-01 sau đó PASS — USER-CONFIRMED, M2 được nghiệm thu theo [báo cáo tổng](REPORT_M2_ACCEPTANCE_01.md); chạy REST collection riêng vẫn NOT RUN. Không commit, không thay evidence M1/P5.
