# Blueprint: nối API Account, Organizations, Organization Detail, My Invitations

Ngày tạo: 17/11/2026; cập nhật phạm vi: 18/11/2026 (Asia/Saigon). Trạng thái: S1, S1b và S2–S8 hoàn tất, nghiệm thu local đạt. Xem bảng và bằng chứng ở §11.
Vị trí đăng ký kế hoạch: services/identity-service/report/PLAN_FRONTEND_IDENTITY_PAGES_INTEGRATION_02.md.
Kế thừa: PLAN_FRONTEND_AUTH_INTEGRATION_01.md và REPORT_FRONTEND_AUTH_INTEGRATION_01.md cùng thư mục. Không coi kết quả auth trước đây là bằng chứng bốn trang đã tích hợp.

## 1. Mục tiêu và phạm vi

Nối UI hiện có tại `/me`, `/organizations`, `/organizations/[orgId]`, `/me/invitations` qua Next same-origin → Gateway → Identity thật. Giữ layout, theme, responsive, component trình bày; thay fixture bằng state/data/controller thật và callback cho từng nút.

Bao gồm profile chỉ đọc, logout, danh sách membership, tạo org, overview, members phân trang, thay role ORG, tạo lời mời, API và UI danh sách lời mời đã gửi theo tổ chức, thu hồi sau reload, inbox accept/decline. Chỉ tích hợp mutation ORG, triển khai và nghiệm thu local theo xác nhận ngày 18/11/2026. Không bao gồm Event adapter, email mời, chỉnh hồ sơ, xóa/kích hoạt member, cover/avatar, tickets/payment hoặc deploy. Các API media tồn tại trong canonical nhưng không thuộc bốn UI này.

## 2. Cơ sở rà soát và hiện trạng

Authority: `shared/contracts/http/identity.openapi.json` hiện **1.4.1**, generated/identity.d.ts; Gateway projection; controller/DTO/service thực tế. docs/ui/06–09 vẫn ghi 1.2.0 nên cần đồng bộ. Khi spec/code khác nhau, ghi sai lệch và kiểm provider, không tự nâng spec thành sự thật.

| Bằng chứng trong repo | Hiện trạng và tác động |
|---|---|
| frontend/src/app/me/page.tsx; organizations/page.tsx; organizations/[orgId]/page.tsx; me/invitations/page.tsx | Development dùng Preview, production vẫn Page mặc định fixture. Không chỉ đổi fetch trong preview; phải đổi entry route thật. |
| features/account/AccountPage.tsx, IdentityHeader.tsx | Profile fixture, logout aria-disabled, cần callback/reload và adapter snake_case → view model. |
| features/organizations/OrganizationsPage.tsx | List/dialog fixture; retry chưa nối callback. |
| features/organization-detail/*; features/my-invitations/* | Có bộ component/fixture cho dialog, pagination, scoped roles; cần controller và rà tất cả action trước khi nghiệm thu. |
| lib/authMode.ts | identityPath chỉ auth và /users/me. Org/inbox hiện không được nhận là API Identity thật; cần phân loại pathname tách query. |
| lib/identityProxy.ts | Allowlist chỉ auth POST và profile GET; chưa chuyển query, Idempotency-Key; body chỉ POST. Route handler đã export PUT nhưng proxy vẫn chặn. |
| lib/apiClient.ts | Có header tùy chọn, timeout, refresh single-flight; xóa session trên mọi protected Identity403 cả lần retry. Mở rộng path sẽ làm org403 đăng xuất nhầm nếu không sửa. |
| lib/useSession.ts | loadProfile dedupe/generation; thiếu access thì hook coi anonymous dù còn refresh; reload callback và kết quả muộn cần kiểm race. Profile update cùng generation/access có thể không cập nhật consumer khác vì signature không đổi. logout nuốt lỗi, không phân biệt local clear và revoke confirmed. |
| lib/auth.ts | Session v2 theo mode, Web Locks; sanitizeNext chỉ cho /me. Cần allowlist nội bộ bốn route nếu muốn quay lại deep link. |
| organizations DTO và canonical CreateOrganization | slug **optional**, backend auto-slug; docs07 còn bắt buộc. Không gửi chuỗi rỗng để yêu cầu auto-slug. |
| gateway/src/routes/organizations.controller.ts, invitations.controller.ts | Đã có forward các endpoint cũ, members/inbox giữ query. Cần thêm GET outgoing invitations tại Identity/Gateway và allowlist Next; không mở generic proxy. |
| organizations.service.ts, invitations.service.ts | Có transaction/idempotency/quyền hiện tại; LAST_OWNER_REQUIRED và replay cần giữ nguyên semantics backend. |
| docs/ui/00-conventions.md và integration/identity-handoff.md | Có mô tả storage/cross-tab cũ; đối chiếu quyết định auth report mới, không yêu cầu quyết định lại phần đã chốt. D09 Event vẫn DRAFT. |

Working tree đang có nhiều thay đổi auth và contract chưa commit; phải bảo toàn. Git remote origin có, default main, gh đã đăng nhập. Chỉ đề xuất PR-sized steps; lượt này không tạo branch/commit/PR. Khi triển khai phải chụp baseline diff, không checkout/reset hoặc cherry-pick thiếu thay đổi auth phụ thuộc. Không tìm thấy memory index riêng trong lượt rà soát; đăng ký ngay tại file này, không tạo hệ thống memory mới.

## 3. Mapping API và kiểu dữ liệu

Client gọi path không có `/api`; real mode đổi thành `/api/identity/...`, proxy tới Gateway `/api/...`. Chỉ allowlist đúng method + cấu trúc path, UUID encode, không prefix mở rộng tùy ý.

| UI/action | Gateway endpoint | Kết quả canonical |
|---|---|---|
| Account/list org | GET /api/users/me | 200 Profile.memberships; không GET list organizations |
| Tạo org | POST /api/organizations | 201 OrganizationCreatedResult; body name, slug tùy chọn |
| Overview | GET /api/organizations/{orgId} | 200 Organization |
| Members | GET /api/organizations/{orgId}/members?limit=20&offset=0 | 200 OrganizationMembers |
| Thay role | PUT /api/organizations/{orgId}/members/{userId}/roles | 200 {status:OK}, schema tên LoggedOut không mang nghĩa logout |
| Mời | POST /api/organizations/{orgId}/members/invitations | 201 InvitationCreated |
| Danh sách đã gửi (API mới) | GET /api/organizations/{orgId}/members/invitations?limit=20&offset=0 | 200 OrganizationInvitations, schema mới tại S1b |
| Thu hồi từ receipt hoặc danh sách | POST /api/organizations/{orgId}/members/invitations/{id}/revoke | InvitationRevoked theo canonical |
| Inbox | GET /api/users/me/invitations?limit=20&offset=0 | Invitations |
| Accept/decline | POST /api/users/me/invitations/{id}/accept hoặc decline | 200 InvitationAccepted/InvitationDeclined; body rỗng |

Mutation nghiệp vụ đều có Idempotency-Key; auth refresh/logout dùng semantics riêng hiện có. Types derive generated canonical; thêm runtime validation response nghiệp vụ, không chỉ ép generic T. Validate UUID, arrays, enums, pagination, nullable timestamps và đầy đủ scoped assignment; payload malformed trở thành lỗi upstream an toàn.

## 4. Thiết kế chung và bất biến

- Một nguồn session/profile dùng chung header và trang; state UNKNOWN/ANONYMOUS/AUTHENTICATED/ERROR và tài khoản không khả dụng phải phân biệt. Cache không chứng minh user ACTIVE. Refresh-only bootstrap dùng coordinator hiện có, không tạo coordinator thứ hai.
- 403 từ org/member/invitation là lỗi quyền nghiệp vụ, không xóa session trực tiếp. Revalidate profile để xác định trạng thái tài khoản; /users/me403 mới xử lý tài khoản không khả dụng. Không refresh để chữa403. Network/502/504/429 không là anonymous.
- Mọi read/mutation capture generation + actor + org/target + request sequence. Abort khi chuyển context và ignore late response; abort không chứng minh server chưa commit. Không cập nhật/điều hướng user mới từ kết quả user cũ.
- Operation record memory gồm method/path/body normalized bất biến/key/actor/generation/target/state. State idle→submitting→confirmed hoặc rejected hoặc outcome-unknown. Retry 401 sau refresh và retry mất response giữ cùng snapshot/key; lỗi xác định rồi sửa form mới tạo operation mới.
- Không lưu email invitation/body nhạy cảm vào localStorage. Reload khi unknown phải đối chiếu inbox/Profile và danh sách đã gửi cho create/revoke invitation; không hứa resume key qua reload hoặc exactly-once vô hạn (TTL backend theo contract). Unknown role PUT có thể cần tải lại members; không suy chắc chắn thất bại nếu quyền đã đổi.
- Success receipt độc lập refetch: create/accept thành công mà GET tiếp lỗi vẫn giữ thành công, chỉ retry read. Không optimistic membership hoặc phát sinh lại mutation.
- OWNER/ADMIN đọc members; OWNER mới quản lý; member role rỗng vẫn xem overview. Roles full replacement: chỉ ORG OWNER/ADMIN resource_id=orgId, [] hợp lệ theo backend. Có EVENT/unknown assignment khóa toàn bộ editor row, không drop scope.
- Inbox hiển thị snapshot EVENT nhưng disable fresh accept khi chưa có adapter; decline vẫn theo điều kiện recipient/PENDING. Retry operation đã gửi không bị fresh-action guard xóa dấu vết. Backend quyết định expiry/terminal/replay.
- Receipt vừa tạo giữ trong memory; danh sách đã gửi tải từ API mới, tồn tại qua reload nhờ dữ liệu backend. Revoke từ danh sách/receipt dùng key riêng. Không gọi internal profile hay Event từ browser để bổ sung tên/email.
- Production real không render fixture, không fallback mock khi Gateway chết; preview chỉ opt-in development và tách rõ khỏi live route. Không gửi real bearer sang API business mock.

## 5. Các bước triển khai

Mỗi bước là một đơn vị review/PR; trạng thái ban đầu TODO. Tier strongest cho S1/S2/S6/S8; default cho phần còn lại. Không tự đổi model của phiên. Trước mỗi bước đọc context được liệt kê, chụp diff nền; sau bước chạy checks tương ứng, ghi evidence và review diff. Chỉ commit/PR khi workflow triển khai được yêu cầu; không trộn thay đổi có sẵn của người dùng.

### S1 — Chốt contract và baseline
- Context: canonical1.4.1, DTO organization/invitation, docs00/06–09, auth plan/report, tests/p5-organization.spec.ts, p6-invitation.spec.ts, organization-auto-slug.spec.ts.
- Dependencies: không; tier strongest.
- Công việc: lập bảng endpoint/request/response/error/policy; sửa version và mô tả slug optional trong docs; đối chiếu localStorage/Web Locks đã chốt; inventory tất cả button/link/dialog cùng file owner. Chụp baseline tests lỗi có sẵn và diff auth. Chốt các câu hỏi Q bên dưới.
- Verify: npm run contracts:check; npm --prefix frontend run typecheck.
- Exit: không còn mismatch contract trong phạm vi hoặc có blocker được gán owner; baseline có evidence.
- Rollback: hoàn nguyên riêng tài liệu thay đổi của S1 bằng patch đảo có review.

### S1b — API danh sách lời mời đã gửi theo tổ chức (bổ sung 18/11/2026)
- Context: invitations.controller.ts, invitations.service.ts của Identity; gateway/src/routes/invitations.controller.ts; Prisma OrganizationInvitation; canonical/projection/generated; tests/p6-invitation.spec.ts.
- Dependencies: S1; tier strongest. Đây là bước mới trước S2; tổng kế hoạch có 9 bước, giữ ID cũ để không mất truy vết.
- Contract đề xuất: GET /organizations/{orgId}/members/invitations ở Identity, Gateway thêm /api; limit mặc định20, tối đa100, offset>=0 dùng helper pagination hiện có. Chưa thêm search/filter/status query. Sort created_at DESC, id DESC; response200 `{items,total,limit,offset}`.
- Schema mới OrganizationInvitationSent/OrganizationInvitations: item có id, organization_id, inviter_user_id, invitee_user_id, invitee_display_name, invitee_email, roles (snapshot đầy đủ scoped assignments), status, created_at, expires_at, processed_at nullable. Tên/email lấy quan hệ invitee hiện tại trong DB Identity, không tuyên bố là snapshot lúc gửi; không sửa schema recipient inbox để lộ email. Không trả tokens, secrets, internal user records.
- Quyền đề xuất mặc định: chỉ user ACTIVE có membership ACTIVE và OWNER ORG hiện tại được đọc toàn bộ lời mời của org, gồm lời mời do OWNER khác gửi. Dùng owner guard hiện có; ADMIN/member/outsider không được đọc email danh sách này. Revoke vẫn OWNER theo endpoint hiện có. OrgId UUID lỗi400, thiếu auth401, không đủ quyền403, org không tồn tại theo thứ tự check/quy ước requireOrg hiện tại; chốt/document404/403 từ provider, không làm lộ sự tồn tại org qua khác biệt mới.
- Service: kiểm quyền trước read; count và items cùng org, cùng transaction RepeatableRead như inbox. Status EXPIRED và processed_at hiệu lực tái sử dụng quy tắc inbox hiện tại (PENDING quá hạn → EXPIRED, processed_at=expires_at), GET không cập nhật DB. Không yêu cầu Event resolver để đọc snapshot.
- Database: model hiện chỉ có index inbox theo invitee_user_id. Bổ sung migration index `(organization_id, created_at DESC, id DESC)` cho outgoing; không thêm bảng/history snapshot khi chưa cần. Kiểm migration trên DB disposable, query plan với dữ liệu phân trang đại diện; không chạy migration vào DB shared.
- Files: canonical OpenAPI + Gateway projection + generated types; Identity controller/service; Gateway controller; Prisma schema/migration; contract/provider tests. Bump minor version additive theo phiên bản thực tế khi triển khai; không gán schema mới như đã tồn tại ở1.4.1.
- Verify: npm run generate:contracts; npm run contracts:check; npm run typecheck; `node scripts/test-db.cjs --migrate --seed --runTestsByPath tests/p6-invitation.spec.ts` sau khi bổ sung cases outgoing trong suite này. Kiểm OWNER/ADMIN/member/locked/inactive/outsider, org A/B isolation, owner khác gửi, limit/offset/order/total, empty/terminal/effective expiry, no DB mutation khi GET.
- Exit: contract/provider/Gateway parity; email chỉ trả cho OWNER đúng org; đọc lại sau create/revoke phản ánh DB; migration áp dụng được và inbox cũ không đổi payload.
- Rollback: đảo consumer S6 và allowlist S2 trước khi bỏ endpoint; additive index có thể giữ, nếu bỏ dùng migration đảo riêng đã review. Không xóa invitation/history và không rollback mutation đã commit.

### S2 — Mở transport và sửa session dùng chung
- Context: lib/authMode.ts, identityProxy.ts, apiClient.ts, auth.ts, useSession.ts; app/api/identity/[...path]/route.ts; frontend/tests hiện có.
- Dependencies: S1,S1b; tier strongest.
- Công việc: exact allowlist cho mapping §3, pathname/query validation limit/offset, forward query/key/PUT body; giữ status/request ID/Retry-After/no-store. Không forward cookie/XFF/context header. Thêm typed client và runtime validators; tạo shared identityOperation.ts với snapshot/key/state/actor/generation và tests retry/cross-generation cho S4/S6/S7. Sửa403 theo §4, refresh-only bootstrap, subscription profile cùng generation, race reload/logout; logout trả trạng thái revoke confirmed/local-cleared. Safe next chỉ bốn route hợp lệ, chống absolute/protocol-relative/encoded bypass. Test auth regressions ngay bước này.
- Verify: npm --prefix frontend test; npm --prefix frontend run typecheck; npm --prefix frontend run build.
- Exit: org403 không logout, profile403 xử lý đúng; key/body/query xuyên proxy; real bearer không tới mock; response cũ không hồi sinh phiên.
- Rollback: đảo patch transport/session đồng bộ với route consumers; không restore refresh token đã rotation.

### S3 — Account và header thật
- Context: features/account/*, app/me/page.tsx, app/layout.tsx và header selection hiện có; Profile canonical; S2 session API.
- Dependencies: S2; tier default.
- Công việc: thêm live container/adapter, chia sẻ profile với header; callback tải lại/logout; guard/empty/error/locked; chuyển routes khỏi fixture mặc định. Không có flash dữ liệu mẫu hay email user cũ. Logout lỗi vẫn local clear nhưng notice không tuyên bố server revoke.
- Verify: frontend test/typecheck; browser login thật→/me; reload/logout/mất mạng/đổi user; theme/mobile/keyboard.
- Exit: Profile thật đúng, header/page không request trùng đang chạy, mọi CTA có tác dụng và no-mock real.
- Rollback: revert riêng container/wiring; không đưa fixture lên real route để che lỗi.

### S4 — Organizations và create operation
- Context: features/organizations/*; app/organizations/page.tsx; Profile/CreateOrganization schema; operation §4.
- Dependencies: S3; tier default.
- Công việc: membership list từ shared profile; dialog callback/validation; form tạo chỉ yêu cầu tên tổ chức; gửi {name}, bỏ hẳn slug để backend tự sinh. Không thêm ô slug trong đợt này. Freeze request/key; create201, refetch Profile, link org bằng UUID. Handle SLUG_TAKEN, IDEMPOTENCY_IN_PROGRESS/CONFLICT, unknown outcome; giữ receipt nếu reload lỗi.
- Verify: frontend tests/typecheck; browser empty→create→Profile/link org (overview live kiểm tại S8); explicit duplicate slug kiểm regression backend; auto-slug, double-click, timeout sau commit cùng key.
- Exit: một ý định không tạo hai org; không GET list org; không tạo lại vì profile lỗi.
- Rollback: revert wiring S4, giữ compatibility shared client cho các trang khác.

### S5 — Overview và members chỉ đọc
- Context: features/organization-detail/OrganizationDetailPage.tsx, OrganizationOverview.tsx, MembersTable.tsx, RoleAssignments.tsx, detailData.ts; canonical Organization/OrganizationMembers.
- Dependencies: S3; tier default; có thể song song S4/S7 nếu không sửa shared files.
- Công việc: load overview theo orgId; members lazy tab với role display policy, phân trang20/50/100; full scoped assignments, không email nội bộ. Error members riêng overview; offset vượt total chỉ sửa/refetch hữu hạn; isolate org A→B.
- Verify: tests/typecheck; browser OWNER/ADMIN/role rỗng/outsider; pagination và delayed response A→B.
- Exit: quyền đọc đúng;403 không đăng xuất; không fixture hay query search chưa hỗ trợ.
- Rollback: đảo patch read controller S5; S6 phụ thuộc phải đảo trước.

### S6 — Role editor, invite và revoke
- Context: S5 controller, OrgRoleEditor.tsx, RoleSelection.tsx, InviteMemberDialog.tsx, InvitationReceipt.tsx; organizations/invitations service, docs08.
- Dependencies: S5; tier strongest.
- Công việc: OWNER controls; full replacement ORG và khóa row EVENT/unknown; empty/no-op/self-demotion/LAST_OWNER_REQUIRED; refetch quyền sau success/403. Invite existing email, roles explicit,201 receipt; thêm tab “Lời mời đã gửi” theo §10, load API S1b và revoke từ từng row với key riêng; sau create/revoke refetch danh sách, giữ receipt thành công nếu refetch lỗi. Map NOT_FOUND/ALREADY_MEMBER/INVITATION_ALREADY_PENDING/expired/terminal; không tuyên bố gửi email.
- Verify: tests/typecheck; provider P5/P6; browser role change/self-demotion/last owner, invite→provider inbox (recipient UI kiểm tại S8), revoke race; fault after commit.
- Exit: không mất EVENT assignment, không hiển thị member trước accept, danh sách đã gửi lấy từ backend, vẫn xem/thu hồi được sau reload; mất OWNER phải xóa email đã tải, GET outgoing trả Cache-Control: no-store có test.
- Rollback: đảo wiring mutations trước S5; role/invite đã commit chỉ sửa bằng nghiệp vụ được phép, không rollback DB tự động.

### S7 — My Invitations
- Context: features/my-invitations/*; app/me/invitations/page.tsx; Invitations/InvitationAction schemas; docs09.
- Dependencies: S3; tier default; dùng shared client/operation đã ổn định ở S2.
- Công việc: inbox limit/offset/all states, timezone Asia/Saigon, processed_at null; confirm accept/decline body rỗng, key riêng; khóa hai actions khi pending/unknown; receipt success, refetch inbox/Profile. Fresh EVENT accept disabled nhưng decline không bị chặn vô cớ; expiry refetch hữu hạn, server quyết định. Không guard bằng membership.
- Verify: tests/typecheck; browser recipient chưa có org, accept/decline, terminal/expired/ALREADY_MEMBER, cross-user và logout race, profile reload lỗi sau accept.
- Exit: acceptance thêm membership qua server; không fabricate roles/status, không replay fresh vô hạn.
- Rollback: revert S7 container; accept đã commit không tự xóa membership.

### S8 — Regression, browser thật và bàn giao
- Context: toàn bộ S1–S7, frontend/tests, tests/frontend-auth-browser.spec.ts, tests/helpers.ts, scripts/test-db.cjs, docs/ui/reports.
- Dependencies: S4,S6,S7; tier strongest.
- Công việc: mở rộng harness hiện có cho bốn trang; DB test riêng, user OWNER/ADMIN/member/no-org/locked và invitation states. Tách provider thật, fault-injection và preview evidence. Review accessibility/focus/keyboard/mobile/light-dark/reduced-motion; cập nhật docs06–09 và report tương ứng, report tổng trong identity/report.
- Verify: npm run contracts:check; npm --prefix frontend test; npm --prefix frontend run test:coverage; npm --prefix frontend run typecheck; npm --prefix frontend run build; npm run typecheck. Provider qua runner test-db có --migrate --seed --runTestsByPath tests/p5-organization.spec.ts tests/p6-invitation.spec.ts tests/organization-auto-slug.spec.ts; đọc runner trước chạy để xác nhận DB disposable và prerequisites. Browser dùng harness auth hiện có, ghi command chính xác sau khi bổ sung suite; chưa có script mới thì không ghi PASS.
- Exit: ma trận §6 có evidence; vấn đề còn mở có owner/status; không coi local PASS là production-ready; auth suite vẫn pass.
- Rollback: revert theo dependency ngược S8→S6/S7/S4→S5→S3→S2→S1b; bản real bảo trì/error thay vì mock fallback. Không phục hồi phiên/mutation đã commit.

Dependency: S1→S1b→S2→S3; S3→S4,S5,S7; S5→S6; S4,S6,S7→S8. Shared lib/types/errors/session do S2 sở hữu; thay đổi bổ sung vào shared file phải tuần tự review trước khi các nhánh rebase. Mỗi PR ghi dependency và command/result, không hứa chạy song song khi cùng sửa layout/header.

## 6. Ma trận nghiệm thu tối thiểu

| Nhóm | Kịch bản bắt buộc |
|---|---|
| Transport | đúng path/method/query/key/body; reject internal/unlisted/path traversal; giữ201/409/429; timeout không fallback mock |
| Session | refresh-only; nhiều request401 một rotation;403 org giữ phiên; profile403 khóa; logout/tab khác/late response; safe next; profile invalidation đồng bộ |
| Account | profile thật; memberships rỗng; retry/network; logout chưa revoke confirmed |
| Create | auto-slug trên UI; explicit slug/duplicate kiểm backend;201; double-click; retry same key sau commit; refetch fail giữ receipt |
| Members | OWNER/ADMIN/role rỗng/outsider; scoped roles đầy đủ; page bounds; org switch race |
| Roles | []/no-op/self-demotion/last owner concurrent; inactive target; EVENT editor khóa; retry sau mất quyền |
| Invitations | create201/revoke; existing-user only; outgoing-list API đúng org/quyền, reload và revoke từ danh sách; accept/decline recipient; expired/terminal/races; EVENT fresh vs retry; inbox pagination |
| Privacy/UX | không token/email trong URL/log; không flash fixture/user trước; focus trap/return; error request_id an toàn; responsive/theme/reduced motion |

Trạng thái runtime hiện tại ghi ở §11. Báo cáo auth cũ là evidence lịch sử. Test coverage hiện loại useSession.ts nên 80% core không chứng minh hook/session UI đúng; bổ sung browser hoặc component test cho các race đó. Không chạy seed trên DB người dùng/shared.

## 7. Phần bổ sung và thông tin cần xác minh

Cập nhật theo chỉ đạo người dùng: các lựa chọn thông thường áp dụng theo đề xuất, không yêu cầu xác nhận lại. Phân biệt quyết định sản phẩm với kiểm chứng kỹ thuật: việc quan trọng về kỹ thuật vẫn phải test, nhưng không chuyển thành câu hỏi cho người dùng nếu có thể tự xác minh từ repo/môi trường.

### 7.1. Quyết định đã được người dùng chốt ngày 18/11/2026

| ID | Quyết định | Tác động thực hiện |
|---|---|---|
| Q6 | Chỉ tích hợp ORG | Không triển khai Event provider/adapter; snapshot EVENT vẫn đọc được, mutation theo giới hạn §4. |
| Q7 | Bổ sung API liệt kê lời mời đã gửi theo tổ chức và UI quản lý tương ứng | Thêm S1b contract/backend và mở rộng S6 với tab danh sách, phân trang, xem trạng thái và thu hồi sau reload. |
| Q10 | Triển khai và nghiệm thu local | Không deploy production; kiểm production dành cho kế hoạch rollout riêng. |

Không còn câu hỏi bắt buộc chặn phạm vi này. Các lựa chọn kỹ thuật thông thường thực hiện theo đề xuất §7.2–7.3; các kết quả kiểm chứng vẫn phải có evidence.

### 7.2. Các đề xuất áp dụng luôn, không cần người dùng xác nhận lại

| ID | Quyết định áp dụng | Giới hạn cần giữ |
|---|---|---|
| Q1 | Form chỉ nhập tên tổ chức; gửi {name}; backend tự sinh slug. | Đã xác minh ở §9; không gửi title, slug rỗng/null hoặc tự sinh slug frontend. |
| Q2 | Sau login quay về route nội bộ hợp lệ: /me, /organizations, /organizations/UUID hoặc /me/invitations; fallback /me. | Allowlist chặt; không nhận URL ngoài hoặc encoded bypass. |
| Q3 | Kế thừa localStorage/Web Locks và namespace session đã chốt trong auth report. | Không đổi kiến trúc lưu phiên; khả năng chạy trên browser/môi trường là việc kiểm kỹ thuật tại §7.3. |
| Q5 | Preview opt-in ở development; real route dùng dữ liệu live. | Production không mặc định fixture, lỗi upstream không fallback mock. |
| Q8 | Operation/key giữ trong memory; sau reload đối chiếu Profile/inbox/members/danh sách lời mời đã gửi theo thao tác, không tự gửi lại mutation. | Kết quả chưa rõ phải được thông báo trung thực; không hứa resume qua reload, không persist email/body nhạy cảm. Nếu cần resume bền vững sau này, thiết kế riêng. |

### 7.3. Các kiểm chứng kỹ thuật do agent/người triển khai tự làm

| ID | Việc phải xác minh | Thời điểm và bằng chứng | Khi nào mới cần hỏi người dùng |
|---|---|---|---|
| Q3-T | Web Locks, HTTPS/localhost và đồng bộ session liên tab trong môi trường mục tiêu. | S2/S8: test browser thực, timeout lock, tab đóng/logout/refresh; ghi browser và origin. | Chỉ khi người dùng yêu cầu browser không hỗ trợ hoặc môi trường ngoài phạm vi đã chốt. |
| Q4 | Phân biệt org403 với user LOCKED/profile403, kể cả sau retry. | S2: provider + client/browser regression; org403 không logout, profile403 xử lý tài khoản không khả dụng. | Không hỏi về facts có thể kiểm từ backend; chỉ báo blocker nếu contract không cho phân biệt được và cần đổi thiết kế. |
| Q5-T | Header/layout/route nào còn dùng fixture. | S3: inventory và browser production build; kiểm Header.tsx, AccountHeader.tsx và bốn entry routes. | Không cần hỏi; thay wiring trong phạm vi kế hoạch. |
| Q9 | Node24, Docker/Postgres disposable, ports, Chrome/Playwright, build real và runner đúng prerequisites. | Trước chạy suite/S8: kiểm môi trường, ghi command/result và executed/skipped; không lấy report cũ làm kết quả mới. | Chỉ hỏi nếu thiếu tài nguyên/quyền hoặc thông tin môi trường không thể tự tìm được. |
| Q10-T | Nếu sau này rollout production: proxy trust/IP/rate-limit, origin và CSP/XSS. | Trước rollout, theo kế hoạch production riêng. | Chỉ hỏi thông tin deployment còn thiếu; không chặn nghiệm thu local hiện tại. |

Bổ sung bắt buộc trong scope: proxy/classifier/query/key/PUT; sửa session403 và profile subscription; operation coordinator; typed validators/adapters; live route/header wiring; safe errors; regression tests; đồng bộ docs version/slug/storage. API GET outgoing invitations mới là phần bắt buộc đã được người dùng yêu cầu, triển khai tại S1b và nối UI tại S6.

## 8. Quy tắc cập nhật kế hoạch và review

Mỗi bước cập nhật TODO/IN_PROGRESS/DONE/BLOCKED cùng evidence path, command, kết quả, assumption. Chỉ DONE khi exit criteria đạt. Khi split/insert/reorder: giữ ID cũ, ghi lý do, dependencies mới, owner file, verification/rollback và tác động acceptance. Nếu contract thay đổi: sửa canonical/projection/generated và contract tests trong bước riêng trước consumer. Không skip unknown-outcome/security cases để đạt deadline.

Review phản biện độc lập: hoàn tất; các finding đã được tiếp nhận tại phần kết quả cuối file, không còn blocker kiến trúc nghiêm trọng được reviewer báo cáo. Bản kế hoạch là tài liệu chuẩn bị triển khai, không phải báo cáo đã nối API.

### Ghi chú kiểm tra bổ sung
- MyInvitationsPage.tsx hiện dùng `fixture.invitations.slice(page * limit, ...)`: S7 phải thay bằng server pagination, render trực tiếp items của response, không slice lần hai; total lấy server, đổi limit reset offset.
- Route handler Identity đã export PUT/PATCH/DELETE; S2 sửa policy trong proxy, không coi việc export method là quyền forward method đó.
- Lệnh provider cụ thể từ repo root: `node scripts/test-db.cjs --migrate --seed --runTestsByPath tests/p5-organization.spec.ts tests/p6-invitation.spec.ts tests/organization-auto-slug.spec.ts`. Runner hiện tạo PostgreSQL disposable; vẫn cần kiểm prerequisites khi thực thi.
- Khi viết code frontend, đọc hướng dẫn Next tương ứng trong frontend/node_modules/next/dist/docs theo frontend/AGENTS.md trước khi chọn API/framework pattern.

### Kết quả phản biện độc lập và sửa kế hoạch

Review bởi agent review_plan ngày 17/11/2026, đã tiếp nhận và sửa ba điểm:
1. **Ownership operation:** S2 phải tạo shared operation coordinator (đề xuất `frontend/src/lib/identityOperation.ts`) cùng unit tests; sở hữu snapshot/key/state/actor/generation/unknown outcome. S4/S6/S7 chỉ consume, không tự tạo ba implementation. Exit S2 thêm tests retry giữ body/key và cross-generation invalidate.
2. **Dependency nghiệm thu:** S4 kiểm create→Profile→link org bằng API/assert route, chưa yêu cầu overview live trước S5. S6 kiểm invitation receipt và provider inbox, chưa yêu cầu trang S7 sẵn sàng. Cross-page browser đầy đủ create→overview và invite→recipient UI thuộc S8 sau tất cả dependencies; các bước độc lập vẫn song song được.
3. **Harness browser:** harness auth hiện cần MAILPIT_URL và DB identity_test; build frontend với NEXT_PUBLIC_AUTH_MODE=real trước `next start`. Khi tái dùng harness, dùng runner có `--security` để dựng mail test, ví dụ `node scripts/test-db.cjs --migrate --seed --security --runTestsByPath tests/frontend-auth-browser.spec.ts` cho regression auth. Suite bốn trang bổ sung chạy cùng điều kiện hoặc tách harness không mail có chủ đích. Báo cáo phải kiểm số test executed/skipped, mode và server build; skip/missing prerequisites không được ghi PASS.

4. **Header wiring S3:** sửa cả `frontend/src/components/Header.tsx` (chọn AccountHeader cho bốn route) và `frontend/src/features/account/AccountHeader.tsx` (production đang truyền accountFixtures.success), ngoài IdentityHeader. Exit phải xác nhận header production không còn tên/email fixture. Mã lỗi bước S4/S6 đã đổi sang tên canonical đầy đủ.


## 9. Xác minh auto-slug backend — 17/11/2026

**Kết luận:** người dùng không bắt buộc nhập slug. Backend tạo slug từ **`name` (tên tổ chức)**, không phải field `title`. Nếu nhãn UI là “Tiêu đề”, adapter vẫn phải gửi `name`; không gửi `{title: ...}`.

### Bằng chứng đối chiếu

- `shared/contracts/http/identity.openapi.json`, schema CreateOrganization: required chỉ có name; slug optional, additionalProperties=false.
- `services/identity-service/src/modules/organizations/dto/organization.dto.ts`: name trim, dài1–100; slug chỉ validate khi khác undefined. Slug explicit phải dài3–63, đúng pattern; null và chuỗi rỗng không mang nghĩa tự sinh.
- `services/identity-service/src/modules/organizations/organizations.service.ts`, hàm create: dùng dto.name normalize NFD, bỏ dấu kết hợp, đổi đ/Đ thành d, lowercase, thay nhóm ký tự ngoài a–z/0–9 bằng dấu gạch nối và bỏ gạch đầu/cuối. Base rỗng dùng organization; base ngắn hơn3 thêm org-; cắt tối đa63 và bỏ gạch cuối.
- Khi auto-slug trùng hoặc gặp unique-index race, backend thêm hậu tố UUID vào base cắt tối đa26; thử tối đa5 vòng. Hết lượt trả409 CONFLICT, retry giữ cùng key. Slug explicit trùng trả409 SLUG_TAKEN.
- Response create201 chỉ chứa organization_id; slug thực tế đọc từ GET organization hoặc Profile memberships sau refetch, không dựng từ tên ở frontend.
- `tests/organization-auto-slug.spec.ts` đã có case thiếu slug qua Gateway, trim/replay cùng key, concurrent tên trùng, tiếng Việt/emoji/tên ngắn/dài, outbox chứa slug thực tế, explicit slug và invalid null/empty. Lượt xác minh này đọc code/test; **chưa chạy lại suite**, không ghi runtime PASS.

Ví dụ request: `POST /api/organizations`, body `{"name":"CLB Công nghệ"}`, kèm bearer và Idempotency-Key. Nếu chưa trùng, slug là `clb-cong-nghe`; nếu trùng có thể có hậu tố do backend cấp.

### Điều chỉnh triển khai và nghiệm thu S1/S4/S8

1. S1 cập nhật docs/ui/07-organizations.md: bỏ slug bắt buộc, bỏ ô nhập/gợi ý slug khỏi layout và bảng validation cho luồng tạo hiện tại; name là field duy nhất người dùng phải nhập. Giữ mô tả slug chỉ đọc trong danh sách/overview. Đây là công việc tài liệu trong bước triển khai, chưa sửa spec07 ở lượt này.
2. S4 sửa CreateOrganizationDialog và fixtures tương ứng để chỉ nhập tên; request snapshot chính xác `{name: normalizedName}`. Không gửi slug rỗng/null, không tự sinh slug frontend, không thêm title vào body. API explicit slug vẫn được backend hỗ trợ để tương thích consumer khác.
3. Giữ key và body name bất biến khi retry; không lấy slug từ GET rồi thêm vào body replay vì sẽ đổi hash request và gây409.
4. Khi create201 nhưng refetch thất bại, giữ receipt organization_id và cho tải lại; không suy slug hoặc tạo lại tổ chức.
5. Browser S8 bắt request để xác nhận chỉ có name; tạo hai org cùng tên bằng hai ý định/key khác nhau phải có hai ID và slug khác nhau; replay cùng key chỉ một ID. Kiểm tiếng Việt, tên ngắn, emoji và reload hiển thị slug do server trả. Explicit slug/SLUG_TAKEN thuộc regression backend, không ép UI phải có ô slug để test.
6. Chạy suite tập trung khi triển khai: `node scripts/test-db.cjs --migrate --seed --runTestsByPath tests/organization-auto-slug.spec.ts` trên DB disposable của runner; ghi kết quả thực tế và prerequisites vào report.

Phần này cập nhật đề xuất slug tùy chọn/nâng cao trước đó: luồng UI được lập kế hoạch là **chỉ nhập tên, backend tự sinh slug**.


## 10. UI quản lý lời mời đã gửi — phạm vi bổ sung 18/11/2026

- Trong Organization Detail thêm tab “Lời mời đã gửi” cạnh Tổng quan/Thành viên. Chỉ OWNER hiện tại thấy và tải tab này; ADMIN vẫn đọc members theo quyền cũ, không mặc nhiên được xem email người nhận lời mời.
- Component đề xuất: SentInvitationsPanel, SentInvitationTable/Card và tái sử dụng dialog revoke từ InvitationReceipt sau khi tách props/callback khỏi fixture. UI hiển thị người nhận (tên/email hiện tại), role/phạm vi tại lúc mời, ngày gửi/hết hạn/xử lý và nhãn trạng thái tiếng Việt. Inviter chỉ hiện UUID trong chi tiết nếu cần; không gọi internal endpoint để tìm tên.
- Load lazy theo orgId/tab, limit20/50/100, offset server, total server; reset offset khi đổi org/limit; không slice lần hai ở client. Có loading/empty/error/retry và nút Tải lại; không poll hoặc thêm ô search/filter giả server. Nếu offset vượt total, điều chỉnh/refetch hữu hạn.
- Có nút Mời thành viên mở dialog S6; sau create201 giữ receipt, đưa danh sách về trang đầu và refetch. Rời trang/reload rồi mở lại phải đọc toàn bộ danh sách từ DB, không phụ thuộc receipt cũ hoặc localStorage.
- Với PENDING còn hạn hiển thị Thu hồi, mở xác nhận người nhận/tổ chức; POST revoke hiện có với body rỗng và Idempotency-Key mới cho ý định này. EVENT snapshot cũng có thể revoke theo backend hiện tại, không cần resolver; giới hạn ORG-only áp dụng create/replace/fresh accept, không làm mất quyền hủy lời mời cũ.
- Khi submitting/unknown outcome khóa fresh revoke cùng invitation, giữ snapshot/key cho retry. Thành công refetch danh sách; response GET lỗi không xóa receipt đã revoke thành công. Server terminal/expiry conflict thì refetch, không tự gán REVOKED; đồng hồ browser chỉ hỗ trợ hiển thị.
- Nếu mất OWNER,403 phải xóa dữ liệu nhạy cảm của tab, khóa mutation và reload quyền/profile phù hợp; không logout nhầm. Abort/ignore response org/user trước khi đổi context; cache danh sách tách actor/generation/org/page. Không ghi email vào URL, toast/log kỹ thuật, localStorage hoặc report.
- Sau reload khi revoke trước đó unknown, GET để đối chiếu trạng thái hiện tại; không kết luận ai đã xử lý và không tự replay key đã mất. Nếu vẫn PENDING, người dùng có thể chủ động bắt đầu ý định revoke mới; backend quyết định conflict/idempotency.
- Cập nhật docs/ui/08-organization-detail.md và checklist/report tương ứng: thay giới hạn receipt-only bằng danh sách server; ghi rõ quyền OWNER, email hiện tại, pagination, API mới và effective expiry. Cập nhật docs00/handoff nếu còn khẳng định thiếu outgoing API, sau khi backend thực sự triển khai; hiện tại ghi planned.

### Kiểm chứng bổ sung S6/S8

1. OWNER tạo invitation → tab thấy row → reload/rời rồi quay lại vẫn thấy → revoke thành công → recipient inbox phản ánh REVOKED sau reload.
2. OWNER thứ hai trong cùng org xem/thu hồi lời mời do OWNER thứ nhất gửi; ADMIN/member/outsider hoặc OWNER org khác không đọc được danh sách/email qua direct request.
3. ACCEPTED/DECLINED/REVOKED/EXPIRED hiển thị đúng và không có fresh revoke; PENDING hết hạn đọc hiệu lực không gây UPDATE DB.
4. Pagination/order/total/empty/limit invalid; tên/email dài, mobile, keyboard/focus, theme; mất quyền và đổi org khi request đang chờ không lộ dữ liệu cũ.
5. Accept vs revoke race, timeout sau commit, retry cùng key, lỗi refetch sau success; không duplicate mutation hoặc đổi kết quả thành công thành thất bại do GET lỗi.
6. GET mới qua Next→Gateway→Identity thật, không fallback mock; query được giữ, không chuyển cookie/internal context; runtime validator schema mới và auth regression cùng pass.

Tại thời điểm bổ sung phạm vi, API/UI/migration còn ở bước thiết kế. Kết quả triển khai và runtime nằm ở §11.

Review độc lập phạm vi bổ sung 18/11/2026: không phát hiện critical kiến trúc; đã sửa kiểm explicit slug thành backend regression, bổ sung outgoing list vào đối chiếu sau reload và đưa ownership operation vào S2. Chưa chạy runtime tests cho API/UI mới.


## 11. Nhật ký triển khai local — 18/11/2026

| Bước | Trạng thái | Bằng chứng |
|---|---|---|
| S1 | DONE | Đọc code/contract và report auth, inventory route + header + form/dialog. Chụp git status và baseline diff vào thư mục tạm trước khi sửa; auth chưa commit được giữ. Baseline contracts:check và frontend typecheck PASS. |
| S1b | DONE | OpenAPI 1.5.0, Gateway, types và migration index. RED: 3 ca mới thất bại trước khi có route. Disposable PostgreSQL: P5/P6/auto-slug và contract P5/P6 34 PASS / 5 suites, 0 skip; schema diff rỗng; EXPLAIN sử dụng index outgoing. Giữ quy ước org không tồn tại 404, org tồn tại thiếu quyền 403. |
| S2 | DONE | 2 ca routing/proxy RED trước sửa. c8 frontend 38 PASS, 0 skip; real build và typecheck PASS. Unit chứng minh refresh-only, org403 sau rotation giữ phiên, profile403 khóa, same-key retry, giới hạn 24h và response sai org bị chặn. |
| S3 | DONE | Chrome xác minh Account thật, refresh-only hai tab một rotation, cache cập nhật giữa tab, deep link và logout lỗi chỉ clear local. Unit adapter PASS. |
| S4 | DONE | Chrome gửi đúng một field name, đọc slug thật, lần đầu mất response sau commit, replay cùng key/body, DB chỉ có một org. Receipt còn khi Profile GET lỗi. Provider explicit slug và trùng tên PASS. |
| S5 | DONE | Chrome OWNER/ADMIN đọc members, member role rỗng đọc overview, outsider403 giữ phiên. Unit phân trang và scoped roles; provider bounds PASS. |
| S6 | DONE | Chrome last-owner409, promotion/self-demotion, invite→reload→revoke, OWNER bị hạ quyền thì xóa email khỏi UI và giữ phiên. Provider isolation, expiry, no-store, race và index PASS. |
| S7 | DONE | Chrome accept/decline và inbox trang hai lấy server, body rỗng. Replay accept mất response cho cùng key và cùng receipt, chỉ một membership. |
| S8 | DONE | Real mode Next 16.4.5, Node 24.19.0, Chrome 157. Runner tổng hợp 82/82, 11 suites, 0 skip, gồm 18 ca Chrome. Frontend c8 38/38, 0 skip. Kiểm contract, typecheck, audit, schema và git diff đạt. Migrate/seed trong identity_test riêng. |


### Điều chỉnh theo code và review

- S1b giữ thứ tự kiểm quyền của provider. Với URI không khớp allowlist ở Next, proxy trả 404. DTO của Gateway/Identity vẫn kiểm UUID và phân trang ở các entry direct.
- S2 giữ cấu trúc role canonical cho inbox và outgoing. Với members, validate trường và UUID, giữ assignment chưa nhận diện để khóa editor của đúng hàng. Review sửa reload Profile cần request mới sau một read đã bay và phân biệt account403 sau token rotation.
- S3 / S4 giữ preview qua query development. CTA tạo org của Organizer ở real mode dẫn đến form chung để gửi đúng name/key; mock Event vẫn dùng luồng hiện có.
- S8 build Next 16.4.3 báo advisory. Đã nâng patch 16.4.5, build real PASS và frontend audit 0. Lượt browser đầy đủ đầu tiên chứng minh 38 auth/provider/contract test PASS; 7 ca mới chưa qua setup vì helper đang kỳ vọng register HTTP 201, canonical/provider trả 200. Đã cập nhật helper, chạy lại các ca mới trước full suite.

Lượt cuối đạt 82/82, 11 suites, 0 skip. Chrome kiểm chuyển org khi GET sent đang chờ, bỏ dữ liệu org trước sau điều hướng, production bỏ query preview, và giới hạn fresh accept với snapshot EVENT cũ. [Lệnh kiểm và kết quả](REPORT_FRONTEND_IDENTITY_PAGES_INTEGRATION_02.md) · [Báo cáo UI](../../../docs/ui/reports/identity-pages-integration-02.md).
