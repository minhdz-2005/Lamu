# M2 — Nghiệm thu Organization, RBAC và Invitations

Ngày: 14/11/2026 (Asia/Saigon). **M2 ACCEPTED / COMPLETE trong phạm vi đã chốt.** Nguồn xác nhận: người dùng sau khi thực hiện hướng dẫn Swagger trả lời: “tất cả kiểm thử đã pass và đạt kết quả mong muốn hoàn thiện m2”. Không commit.

## Phạm vi và căn cứ

M2 gồm P5 organization/membership/role/authorization và P6 invitation create/list/accept/decline/revoke/expiry/idempotency, Gateway/Swagger, ghi outbox/revision nguyên tử. Dùng MASTER_PLAN hiện có, ADR 0003/P5 và ADR 0004/P6. Auth/session M1 được giữ nguyên.

| Gate | Kết quả / nguồn bằng chứng |
|---|---|
| Contract và generated types | HTTP canonical v1.2.0; projection Gateway và types generate; contract checks PASS theo báo cáo P6 |
| Regression M1/P5/P6 | 20 suites/99 tests PASS, không skipped; run tự động đã ghi ở báo cáo P6, không chạy lại trong lượt chốt tài liệu |
| Coverage | Statements98.05%, branches91.44%, functions98.76%, lines98.11% — kết quả run đã lưu, không phải run mới |
| PostgreSQL/constraint/upgrade/transaction/race/rollback | PASS theo tests và mapping P5/P6; DB thật, không reset dữ liệu demo |
| Compose P6 | PASS theo artifact02, project `lamu-m1-smoke-1794652405564`; giữ artifact01 và evidence M1/P5 |
| Build/typecheck/contracts/format/security review | PASS theo báo cáo P6; production dependency audit0 vulnerabilities tại lượt implementation |
| Manual Swagger M2 | **PASS — USER-CONFIRMED** qua xác nhận trong hội thoại sau hướng dẫn kiểm thử |
| DOC-01, tái hiện hướng dẫn M2 | **PASS — USER-CONFIRMED** cho việc người dùng tái hiện runbook/Swagger; không tự gán một tester khác hoặc bên nhận service |

Manual scope được người dùng xác nhận theo hướng dẫn đã trao đổi: tạo tổ chức A/B, membership/role, cách ly org, OWNER tạo lời mời → người nhận login/list/accept → users/me thấy membership, replay/key mới, wrong recipient, decline/revoke và bảo vệ OWNER cuối cùng. Actual được ghi ở mức người dùng báo đạt expected; không tự dựng response, screenshot, timestamp từng ca hoặc một lượt chạy công cụ mới của Codex.

Trong quá trình thao tác đã có lỗi nhập liệu 400 do JSON thiếu dấu đóng và 401 do ô Authorize chứa thừa nội dung response login; đã hướng dẫn sửa. Không coi hai lần lỗi này là PASS. Xác nhận cuối của người dùng là căn cứ cho các lần kiểm thử sau sửa đạt kỳ vọng. Không chép credentials, bearer/refresh token hoặc cURL nhạy cảm vào tài liệu.

## Giới hạn được giữ nguyên

- ORG/Identity/Gateway/PostgreSQL provider thật; EVENT ownership/error/timeout chỉ fixture resolver tiêm riêng trong tests. Normal runtime thiếu resolver fail closed, không fallback fixture.
- Manual PASS dựa xác nhận của người dùng; Codex không trực tiếp quan sát toàn bộ phiên Swagger, không có artifact response/screenshot mới cho từng ca. Không suy bên nhận Event/Registration/Payment đã nghiệm thu tích hợp.
- Chạy REST Client collection `requests/m2-p6.http` riêng chưa được xác nhận: **NOT RUN riêng collection**; Swagger là đường tái hiện được xác nhận cho DOC-01.
- Worker RabbitMQ, publish backlog/delivery/retry/topology/consumer projection thuộc **M3**; Event resolver thật/frontend/service integration thuộc **M4**. Email không thuộc phạm vi M2. Các mục này không được nâng thành PASS hoặc IMPLEMENTED từ việc đóng M2.
- Production-sized backup/restore/migration và OS/dev dependency audit vẫn ngoài bằng chứng local hiện có. Không mở API khóa user/membership lifecycle mới.

## Bàn giao

Nguồn HTTP: `shared/contracts/http/identity.openapi.json` v1.2.0; MembershipChanged/OrganizationCreated schema v1. Source trong working tree, chưa commit theo yêu cầu người dùng. Runbook: Identity/Gateway README; quyết định: ADR 0002–0004; bằng chứng implementation: [P5](REPORT_M2_P5_ORGANIZATION_RBAC_01.md), [P6 contract](REPORT_M2_P6_CONTRACT_01.md), [P6 implementation](REPORT_M2_P6_INVITATION_01.md), [Compose cuối](M2_P6_COMPOSE_EVIDENCE_02.json).

M2 không còn gate mở trong phạm vi local API đã nghiệm thu. Công đoạn kế tiếp trong MASTER_PLAN là P7/M3, chỉ triển khai khi được giao; không tự bắt đầu worker hoặc thay broker trong lượt chốt này.
