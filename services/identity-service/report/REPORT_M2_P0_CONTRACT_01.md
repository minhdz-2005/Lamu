# M2/P5 — P0 contract review

Ngày: 14/11/2026 (Asia/Saigon). Trạng thái: **ACCEPTED cho P5** — người dùng trả lời “Chốt toàn bộ A–E theo báo cáo P0” và “tôi đã bật docker”. Dùng MASTER_PLAN hiện có, không lập lại kế hoạch tổng thể. Không bao gồm P6. Các mục A–E dưới đây giữ nguyên nội dung gói đề xuất đã được duyệt; nguồn xác nhận là câu trả lời này, không phải phê duyệt P0 M1.

Đầu ra sau xác nhận: [ADR 0003](../../../docs/adr/0003-m2-p5-organization-rbac.md), canonical [Identity OpenAPI v1.1.0](../../../shared/contracts/http/identity.openapi.json), Gateway projection/types, OrganizationCreated/MembershipChanged JSON Schema v1; catalog/architecture/handoff đồng bộ. Implementation và bằng chứng thực thi ghi tại [báo cáo P5](REPORT_M2_P5_ORGANIZATION_RBAC_01.md). Chưa có nghiệm thu consumer Event thật hoặc manual/DOC-01.

## Nguồn và hiện trạng

Đã đối chiếu MASTER_PLAN §5–§8/P5, REPORT_M1_AUTH_GATEWAY_01, REPORT_M1_TYPESCRIPT_CONFIG_01, REVIEW_MASTER_PLAN01 (đặc biệt F03–F07/F10/F11/F14), docs/integration/identity-handoff.md (D05/D06/D07-M2/D09/D12), docs/api/catalog.md, docs/architecture.md, ADR 0002, Identity OpenAPI và events/README.md. Đã đọc app/database/context guard/users service, Gateway proxy/Swagger/projection, Prisma schema/migration/seed và test harness hiện có. Working tree sạch trước lượt này; Node 24.19.0, npm 11.17.0.

D00, D04 và các quyết định M1 trong ADR 0002 được giữ nguyên. Ở thời điểm đọc hiện trạng, D05/D06/D07-M2/D09/D12 còn PROPOSED và HTTP chỉ có M1/chưa có hai event schema; đã hỏi và nhận xác nhận riêng trước implementation phụ thuộc. D09 chỉ duyệt interface P5, phần Event HTTP M4 chưa chốt. M1 đã có membership INACTIVE và user LOCKED trong DB; MembershipChanged P5 chỉ cho ACTIVE. P5 không thêm API đổi status.

Provider: Identity; consumer trực tiếp: Gateway/Swagger/API client. Consumer authorization tương lai: Event và service nghiệp vụ, chưa có provider Event thật trong P5. Người dùng xác nhận quyết định trong phiên; không tự gán reviewer của service khác hoặc ghi nhận họ đã approve.

## A — D05: DTO, status và quyền đề xuất

Tất cả object đóng field thừa; UUID string, JSON snake_case. Không thay Profile M1 hoặc auth/session. Public protected route dùng context sub/sid từ Gateway đã verify; actor không lấy từ body. Internal check nhận subject user_id từ service tin cậy trong network local; không nhận từ route public.

| Identity operation | Request | Success đề xuất |
|---|---|---|
| POST /organizations | `{name, slug}`; name trim 1–100; slug trim/lowercase, 3–63, `[a-z0-9]+(-[a-z0-9]+)*` | **201** `{organization_id}`; retry hợp lệ cũng trả status/body đã lưu |
| GET /organizations/{orgId} | UUID; user ACTIVE và membership ACTIVE (kể cả member không role) | 200 `{id,name,slug,my_roles:[code]}`; my_roles unique/sorted chỉ để hiển thị |
| GET /organizations/{orgId}/members | org.member.read; limit integer 1–100 mặc định 20, offset integer >=0 mặc định 0; chỉ nhận hai query này | 200 `{items:[{user_id,display_name,status,roles:[Assignment]}],total,limit,offset}`; status là membership ACTIVE/INACTIVE; sort user_id; không email |
| PUT /organizations/{orgId}/members/{userId}/roles | org.member.manage; `{roles:[Assignment]}` thay toàn bộ; chỉ target user và membership ACTIVE | 200 `{status:"OK"}`; không tạo membership mới |
| GET /public/organizations/{slug} | Không auth; slug đã canonical | 200 `{name,slug}` |
| POST /internal/authorization/check | 5 field bắt buộc: user_id, organization_id, resource_type, resource_id, permission | 200 `{allowed,reason}` theo bảng dưới |
| GET /internal/users/{userId}/public-profile | UUID; chỉ network nội bộ | 200 `{id,display_name}`; user không có/LOCKED: 404 NOT_FOUND; không avatar/email/session |

`Assignment = {code,resource_type,resource_id}`, cả ba bắt buộc: OWNER/ADMIN + ORG + orgId đích; SPEAKER/ATTENDEE + EVENT + event UUID. ORG serialize ID đầy đủ nhưng persistence resource_id NULL như M1. Không custom role. Tối đa 100 assignment/request; từ chối duplicate 400; roles rỗng hợp lệ nếu không làm mất OWNER cuối cùng. Tập assignment không có thứ tự: canonical sort theo code/type/id, UUID lowercase; đổi thứ tự không phải mutation hoặc idempotency conflict. Role trái scope/ORG sai ID: 400 VALIDATION_FAILED. Trạng thái membership/user target không ACTIVE: 403 FORBIDDEN, không ghi. Danh sách members vẫn cho quản trị viên thấy membership INACTIVE để phản ánh dữ liệu hiện tại.

| Permission | ORG | EVENT |
|---|---|---|
| org.read | Có | Không |
| org.member.read | Có | Không |
| org.member.manage | Có | Không |
| event.create | Có | Không |
| event.read | Có (list org) | Có (detail) |
| event.update | Không | Có |
| event.publish | Không | Có |
| event.cancel | Không | Có |
| ticket.checkin | Không | Có |
| payment.refund | Không | Có |

OWNER có cả 10 permission trong phạm vi phù hợp; ADMIN có cả 10 trừ org.member.manage. Assignment ORG được áp dụng cho EVENT trong cùng org theo context tin cậy; SPEAKER chỉ event.read đúng EVENT, không ORG/EVENT khác; ATTENDEE không có permission quản trị. Các scope không được đánh dấu Có trả 400, không trả deny mơ hồ.

Check đánh giá validation → user → membership ACTIVE → permission/scope. ORG resource_id phải bằng organization_id; EVENT resource_id bắt buộc, không fallback scope. Caller nội bộ sở hữu event phải resolve org đáng tin trước check; check không tự chứng minh quan hệ từ UUID do caller gửi. API mutation nhận EVENT phải dùng resolver ở mục E. M2 fixture test được ghi tách provider ORG thật và Event fixture; chưa chứng minh Event E2E.

| Điều kiện check | Response |
|---|---|
| Field thiếu/thừa, UUID/enum sai, permission lạ/sai resource, ORG ID lệch | 400 VALIDATION_FAILED |
| User không có | 200 `{allowed:false,reason:"USER_NOT_FOUND"}` |
| User LOCKED | 200 `{allowed:false,reason:"USER_LOCKED"}` |
| Membership không có hoặc INACTIVE | 200 `{allowed:false,reason:"NO_ACTIVE_MEMBERSHIP"}` |
| Đủ permission đúng scope | 200 `{allowed:true,reason:"PERMISSION_GRANTED"}` |
| Còn lại | 200 `{allowed:false,reason:"PERMISSION_DENIED"}` |
| DB/hạ tầng lỗi | 500 INTERNAL_ERROR/503 SERVICE_UNAVAILABLE theo boundary thực tế, không trả allowed hoặc deny thành công |

HTTP endpoint nghiệp vụ: context thiếu/sai 401 UNAUTHENTICATED; actor không có 401, actor LOCKED 403 FORBIDDEN; org không có 404 NOT_FOUND; org có nhưng actor không đủ quyền/member 403 FORBIDDEN. Kiểm actor trước khi lookup target member; không để actor ngoài org dò user qua lỗi target. Slug trùng 409 SLUG_TAKEN; mất OWNER cuối 409 LAST_OWNER_REQUIRED; missing key 400 IDEMPOTENCY_KEY_REQUIRED; key/target/body xung đột 409 CONFLICT; key đang khóa quá hạn 409 IDEMPOTENCY_IN_PROGRESS; thiếu Event resolver 409 EVENT_SCOPE_UNVERIFIED. Lỗi dùng envelope M1 và request_id của request hiện tại. Giữ 429/500/502/504 M1; không đổi semantics auth/refresh/logout hoặc thêm access revocation.

## B — D06: idempotency đề xuất

- Chỉ P5 POST organization và PUT roles bắt buộc một Idempotency-Key, 1–128 ký tự `[A-Za-z0-9._:-]+`, phân biệt hoa thường. Thiếu: IDEMPOTENCY_KEY_REQUIRED; trùng header/sai format: VALIDATION_FAILED. Gateway chỉ chuyển một key hợp lệ; không copy context client.
- Unique actor_user_id + operation + key; operation CREATE_ORGANIZATION hoặc REPLACE_MEMBER_ROLES. Hash SHA-256 bao gồm method/operation/target org,user và body đã validate/canonicalize. Không chứa token, request ID. Không có query có nghĩa nghiệp vụ ở hai mutation này.
- TTL **24 giờ** tính từ completed_at của kết quả thành công được commit; completed_at lấy tại bước hoàn tất transaction, expires_at = completed_at + 24h. Replay không gia hạn. Chỉ lưu success status/body và metadata target để kiểm quyền, không cache lỗi.
- Serialize theo actor/operation/key trong DB, sau đó khóa org; record/result/mutation/revision/outbox trong cùng transaction. Không commit record IN_PROGRESS riêng. Thời gian chờ khóa key **2 giây**; vượt: 409 IDEMPOTENCY_IN_PROGRESS. Khóa org timeout: 409 CONFLICT; retry cùng key, không retry tự động ở Gateway.
- Replay cùng hash trong TTL kiểm lại actor ACTIVE; create org kiểm actor còn được đọc org đã tạo, replace kiểm actor hiện còn org.member.manage và membership ACTIVE. Actor tự hạ mất quyền thì retry bị 403 dù lần trước đã commit; không hoàn tác lần trước.
- Quyền của actor bị mất được kiểm trước khi trả cached body/conflict cho target nhạy cảm. Replay không chạy lại mutation hoặc đòi snapshot target còn giống lúc commit. Không resolve lại Event cho cached success; quyền nhận kết quả vẫn phải hợp lệ.
- Record hết TTL được thay dưới cùng khóa, không background cleanup P5. Request sau TTL là mutation mới, vẫn áp constraint/policy; không cam kết exactly-once vĩnh viễn. Rollback không để record hoặc outbox/revision mới.

## C — D07-M2: dữ liệu và khóa đề xuất

Migration mới additive, không sửa migration M1 đã chạy; thêm memberships.membership_revision BIGINT NOT NULL DEFAULT 1, CHECK >0; thêm idempotency_records với FK actor, unique/key/hash/status/result/target/completed_at/expires_at và index expiry. Không invitation table. Revision JSON integer an toàn 1..Number.MAX_SAFE_INTEGER; overflow bị từ chối và rollback, không ép bigint mất chính xác.

Giữ user/session/org/assignments/outbox M1. Membership cũ có revision 1 làm baseline; không hồi tố MembershipChanged hay dựng lại lịch sử. Không reset/db push. Migration có ghi rõ rollback production bằng forward migration, không tự chạy destructive DOWN. Index bảng idempotency mới không khóa ghi bảng cũ; kiểm upgrade trên bản M1 có dữ liệu tổng hợp, không tuyên bố production-sized PASS.

Thứ tự: validate/resolve EVENT trước DB → transaction → idempotency lock → organization FOR UPDATE → khóa user actor/target theo UUID ổn định, membership/assignment → đọc lại ACTIVE/quyền hiện tại → OWNER check → mutation/revision/outbox/result → commit. Create org kiểm actor ACTIVE dưới khóa, insert org + OWNER membership + assignment + hai event + idempotency result nguyên tử. Role replacement tính OWNER hợp lệ bằng membership ACTIVE + user ACTIVE + OWNER đúng org. Hai OWNER cạnh tranh không được đưa org về zero OWNER. Không gọi HTTP/broker dưới DB lock.

P5 chưa có API khóa user/vô hiệu membership; không cam kết lifecycle ngoài API được hỗ trợ. Phải thử actor đổi quyền trong lúc chờ org lock bằng hai connection/transaction thật. No-op lưu success idempotency nếu là request mới, giữ revision/event; replay không ghi side effect.

## D — D12: event schema/trigger đề xuất

Giữ envelope UserRegistered v1: event_id UUID, event_type, version=1, occurred_at UTC Z, aggregate_type/id, producer=identity-service, payload đóng field thừa. ID/thời gian/payload lưu một lần, M3 chỉ publish backlog gốc.

| Event | Aggregate / payload |
|---|---|
| OrganizationCreated v1 | aggregate_type=organization, aggregate_id=payload.organization_id; payload `{organization_id,slug,created_by}` |
| MembershipChanged v1 | aggregate_type=membership, aggregate_id=payload.membership_id; payload `{membership_id,organization_id,user_id,status:"ACTIVE",membership_revision,change_type,roles:[Assignment]}` |

change_type chỉ CREATED hoặc ROLES_REPLACED. roles là snapshot đầy đủ unique/sorted, ORG ID là org UUID kể cả DB NULL, EVENT UUID đã xác minh. MembershipChanged chưa chứa INACTIVE vì P5 không đổi lifecycle. Không event credential/email/contact; không consumer MUST mới.

| Hành vi P5 | Outbox / revision |
|---|---|
| Create organization | 1 OrganizationCreated + 1 MembershipChanged CREATED revision 1 |
| Thay tập role thực sự | 1 MembershipChanged ROLES_REPLACED, revision +1 |
| No-op/replay/rollback | Không event/revision mới |
| Migrate baseline/seed local | Không event hồi tố hoặc seed event |

P6 accept invitation chưa triển khai; trigger của P6 phải kiểm chứng riêng, không đánh PASS từ P5. Routing/binding/worker/consumer projection M3 chưa triển khai.

## E — D09: interface resolver cần cho P5

Interface nội bộ tiêm qua provider, resolve(eventId) trả `{event_id,organization_id}` đã validate UUID và đúng event được yêu cầu. Không mode fixture bằng env cấu hình thường; fixture chỉ được test inject tường minh. Default provider trả EVENT_SCOPE_UNVERIFIED khi mutation yêu cầu EVENT; ORG không phụ thuộc resolver.

Fixture/test resolver: unknown event 404 NOT_FOUND, wrong org 403 FORBIDDEN, response sai/lỗi kết nối 502 UPSTREAM_UNAVAILABLE, timeout 504 UPSTREAM_TIMEOUT. Không fallback fixture khi lỗi. Không call resolver dưới DB lock hoặc gọi vòng Identity check. Không implement HTTP Event adapter/endpoint thật M4 trong P5; không tự freeze URL/timeout tích hợp Event M4 từ interface này.

## Canonical artifact sau khi xác nhận

HTTP duy nhất: shared/contracts/http/identity.openapi.json; generated/identity.d.ts dùng generator đã pin. Gateway OpenAPI phải là projection **lọc bỏ /internal/**, bỏ header context và dùng bearerAuth đúng route; thêm route allowlist tường minh, không wildcard proxy. Hiện projection copy tất cả path nên phải sửa bằng TDD trước thêm internal path vào projection. Event có hai JSON Schema versioned riêng trong shared/contracts/events/, fixture máy kiểm được; không chép payload schema thành type/interface độc lập. Catalog/architecture/handoff sẽ cập nhật decision theo nguồn xác nhận thực tế, không sửa ADR M1 để giả phê duyệt M2.

Trong lúc chờ xác nhận chưa thay canonical/generated types/migration/production code. Sau xác nhận, đã thay canonical và sinh types, rồi mới implementation. Các bảng trên lưu lịch sử lựa chọn được duyệt, không phải nguồn payload runtime thứ hai. Canonical artifact là nguồn duy nhất; contract tests/provider responses cùng kiểm theo artifact.

Container P5 lần đầu phát hiện dữ liệu RBAC hệ thống chỉ có sau demo seed (app/auth healthy, create org 500 vì thiếu OWNER). Đã thêm migration **DML riêng** `202611140002_rbac_reference` sau schema migration P5; khởi tạo đúng bốn role/mười permission, không demo user/org, không event, giữ ID/mapping M1 có sẵn, dừng nếu scope/extra grant drift. Test DB mới không demo seed ghi RED 500→GREEN 201/authorization allow; upgrade giữ dữ liệu và lặp reference provisioning an toàn. Đây là phần provisioning cần thiết để thực hiện contract đã duyệt, không thêm policy hoặc P6.

## Bằng chứng nền M1 trong lượt này

| Lệnh thực sự chạy | Expected | Actual | Kết luận |
|---|---|---|---|
| npm run typecheck | Build 3 workspace + tests typecheck exit 0 | Exit 0 | PASS |
| npm run contracts:check | OpenAPI/local refs/projection hợp lệ | Exit 0, PASS local references, OpenAPI documents and Gateway projection | PASS M1 hiện tại |
| npm run test:m1 | PostgreSQL riêng, migrate/seed/test/coverage | Exit 1: dockerDesktopLinuxEngine pipe không tồn tại; chưa tạo DB | BLOCKED môi trường; test/coverage NOT RUN |
| npm run test:compose | Rebuild Node16 trên project riêng và chạy gate | Exit 1: Docker engine unavailable; cleanup cũng báo daemon unavailable; chưa build/chạy app | BLOCKED; Compose Node16 NOT RUN |
| npm test -- --runTestsByPath tests/p0-contract.spec.cjs tests/p4-env.spec.ts tests/p4-clock.spec.ts tests/p4-boundaries.spec.ts | Kiểm thử chọn lọc | Exit 1, 2 suites/5 tests pass, 2 suites/6 tests fail vì Invalid JWT_SECRET; boundaries cleanup cũng lỗi khi setup không thành công | Lỗi chọn harness: hai suite DB chạy ngoài test-db.cjs; không phải RED hợp lệ hoặc regression PASS |
| npm test -- --runTestsByPath tests/p0-contract.spec.cjs tests/p4-env.spec.ts | Chỉ contract/config không cần DB | Exit 0, 2 suites/5 tests pass, 1.741s | PASS phạm vi hẹp |

Các dòng Docker unavailable trong bảng là **lần thử trước xác nhận**, không phải trạng thái cuối. Sau khi người dùng bật Docker: `npm run test:m1` baseline M1 PASS 12 suites/42 tests, statements 98.84%, branches 91.71%, functions 100%, lines 99.02%, 23.812s. `npm run test:compose` rebuild Node16 PASS trên project `lamu-m1-smoke-1794648203384`, evidence ở M1_COMPOSE_EVIDENCE_01.json. Không dùng image IDs cũ trước Node16 làm bằng chứng mới. Kết quả cuối M1+P5 và Compose P5 ở báo cáo P5.

P0 TDD: `npm test -- --runTestsByPath tests/p5-contract.spec.cjs` RED 4 test: thiếu route, projection lộ internal và thiếu hai event schema; sau canonical/projection `npm test -- --runTestsByPath tests/p5-contract.spec.cjs tests/p0-contract.spec.cjs` GREEN 2 suites/6 tests, 0.86s. `node scripts/contract-projection.cjs`, `npm run generate:contracts`, `npm run contracts:check` đều exit 0. Generator openapi-typescript 7.10.1 pin lockfile, chỉ local refs; reviewed generated diff. M1 test exact path list được chuyển sang kiểm các operation M1 vẫn tồn tại để chấp nhận bổ sung additive.

Package-manager detector trong skill đã chạy `node C:/Users/trank/.codex/plugins/cache/ecc/ecc/2.2.3/scripts/setup-package-manager.js --detect`: npm từ package.json/lockfile; test runner thực là Jest 30.5.2/ts-jest, không Bun. Validation dùng scripts đã inspect và được yêu cầu bởi người dùng; không thực thi lệnh cài đặt hoặc lệnh phá dữ liệu từ plan. Không checkpoint commit theo yêu cầu người dùng; RED/GREEN được lưu báo cáo. Manual Swagger/DOC-01 vẫn NOT RUN.
