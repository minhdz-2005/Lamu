# Organization — Slug tự sinh từ name

Ngày15/11/2026 (Asia/Saigon). **IMPLEMENTED / kiểm tra phạm vi thay đổi PASS.** Nguồn: người dùng yêu cầu slug tự sinh từ name, không bắt buộc người dùng nhập. Dùng ecc:nestjs-patterns, contract-first và tdd-workflow. Không commit; giữ các thay đổi frontend/.gitignore/docs-ui có sẵn.

## Hành vi và tương thích

POST `/api/organizations` chỉ cần `{"name":"CLB Công nghệ"}` với access token và Idempotency-Key. Identity sinh `clb-cong-nghe`, người tạo vẫn là OWNER. Response201 `{organization_id}` giữ nguyên; đọc slug thực tế từ GET organization, public lookup hoặc users/me. Frontend không được sửa trong thay đổi backend này.

HTTP canonical1.3.0 được cập nhật trước production implementation; Gateway projection/consumer types sinh lại. Slug optional khi **bỏ field**; explicit slug vẫn trim/lowercase/validate3–63, null/rỗng/sai format trả400, explicit collision trả409 SLUG_TAKEN. Không yêu cầu client cũ đổi payload. Swagger có request example chỉ gồm name. [ADR0006](../../../docs/adr/0006-organization-generated-slug.md).

Sinh slug: NFD bỏ dấu, đ/Đ→d, lowercase, cụm ký tự ngoàiASCII a-z/0-9 thành dấu-, trim dấu- đầu/cuối, cắt tối đa63. Base ngắn hơn3 thêm org-, không còn ký tựASCII dùng organization. Base đã có hoặc unique-index race: thêm UUIDv4 với base cắt tối đa26 để tổng độ dài không quá63. Retry tối đa5 transaction cho auto unique conflicts, hết giới hạn trả409 CONFLICT để retry cùng key. DB unique constraint là bảo đảm cuối cùng; check existence không được coi là chống race một mình.

Idempotency hash dựa trên normalized **request** name/slug(null khi bỏ slug), không dựa vào generated output. Explicit request giữ hash cũ; replay không tạo organization/membership/event/revision mới. Organization/OWNER/membership/result/hai outbox events tiếp tục nguyên tử; OrganizationCreated ghi slug thực tế đã lưu theo event schema v1 hiện có. Không migration, không đổi slug tổ chức cũ hoặc reset DB, không dependency mới.

## RED/GREEN và kiểm chứng thực tế

Artifact mới tại [AUTO_SLUG_RUN_20261115_01](AUTO_SLUG_RUN_20261115_01/regression.txt), không ghi đè evidence M1/M2/M3/P8.

| Lệnh thực sự chạy | Expected | Actual |
|---|---|---|
| `git status --short` trước sửa | Giữ thay đổi có sẵn | Có frontend/docs-ui/.gitignore dirty; không sửa những file đó |
| `node scripts/test-db.cjs --migrate --seed --runTestsByPath tests/organization-auto-slug.spec.ts` trước implementation | RED cho omitted slug | 6failed/1passed,3.482s: contract bắt buộc slug và API name-only400 thay201; red.txt. Test đã compile và thực sự chạy, không dùng setup/compiler error làm RED |
| Canonical update → `node scripts/contract-projection.cjs`; `npm run generate:contracts`; `npm run contracts:check` | Authority/types/projection khớp trước production implementation | Exit0, openapi-typescript7.10.1; canonical1.3.0 |
| Cùng target PostgreSQL sau implementation | GREEN | 7/7 PASS,5.869s; green.txt |
| `npm run typecheck` | Build runtime/Identity/Gateway + test types | Exit0, không frontend build |
| `npm run test:m1` | Regression toàn bộ default backend suite/coverage | **24 suites/122 tests PASS**, không skipped,41.876s; regression.txt. Container `lamu-m1-test-1794676239463`, tmpfs DB riêng và cleanup đúng tên |
| `npm run format:check`; `npm run contracts:check`; `git diff --check` | Format/OpenAPI/projection/whitespace hợp lệ | Exit0; các cảnh báoCRLF của frontend dirty có sẵn không phải lỗi backend |

Default regression122 gồm auth/session, P5/P6, M3 unit/upgrade, P8 và7 tests auto-slug; **không gồm file `m3-broker.integration.cjs`**. Không dùng122 để suy RabbitMQ/lifecycle/Compose đã chạy lại. Source thay đổi chỉ createOrganization/DTO; no broker/client/migration/worker changes. Real broker/Compose mới và manual Swagger cho thay đổi này: NOT RUN. Existing evidence M3/P8 giữ nguyên nguồn lịch sử.

Coverage lượt này: statements91.65%, branches88.07%, functions88.20%, lines92.40%; global80% PASS. OrganizationsService S97.59/B97.39/F100/L97.38; nhánh exhaustion5th collision và unreachable guard không được tạo giả chỉ để tăng coverage.

## Guarantee và review

`tests/organization-auto-slug.spec.ts` kiểm:

- Canonical yêu cầu name, chấp nhận omitted slug nhưng không null.
- Name tiếng Việt/trim → đúng slug, OWNER, public lookup và slug trong outbox trùng DB; same-key concurrent/replay giữ org và đúng2 event; đổi name cùngkey409.
- Hai actor tạo đồng thời cùngname đều201 với hai slug hợp lệ/unique.
- Tên ngắn, emoji/không ASCII và dài100 ký tự vẫn sinh slug3–63 đúng pattern.
- Explicit slug normalization, old idempotency hash, replay và SLUG_TAKEN giữ tương thích; null/rỗng/sai slug và blank name400.

Validation vẫn global whitelist/forbidNonWhitelisted. Slug do server tính trong transaction sau current-actor authorization, SQL qua Prisma và unique index; không mở lookup user/tenant mới hoặc bỏ guard. Không log payload/credentials, không đọc `.env`. Existing org/public URLs, role/invitation/auth và event schemas không đổi. DTO chấp nhận undefined có chủ đích, không dùng IsOptional để vô tình chấp nhận null.

Tài liệu cập nhật: ADR0006/ADR index, catalog, Identity README, MASTER_PLAN/handoff. Các version1.2.0 trong evidence M2/P8 là lịch sử; authority HTTP hiện tại1.3.0. Frontend có thể gọi name-only; việc đổi UI/mock đang có không nằm trong lần sửa backend này.
