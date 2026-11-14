**Cập nhật tiếp nối 14/11/2026:** người dùng đã xác nhận toàn bộ A–E P6; invitation đã triển khai theo ADR 0004/canonical v1.2.0. Xem [contract](REPORT_M2_P6_CONTRACT_01.md) và [evidence P6](REPORT_M2_P6_INVITATION_01.md) cho kết quả thực thi. Manual Swagger/DOC-01 sau đó PASS — USER-CONFIRMED; M2 COMPLETE theo [nghiệm thu](REPORT_M2_ACCEPTANCE_01.md). Phần dưới giữ nguyên nội dung bàn giao trước implementation, không phải trạng thái hiện tại.

# Bàn giao tiếp tục M2 — P6

Ngày: 14/11/2026. Đây là điểm tiếp tục từ MASTER_PLAN hiện có, không phải kế hoạch tổng thể mới. Chưa triển khai hoặc phê duyệt contract P6 trong lượt chuẩn bị này. Không commit.

## Mốc hiện tại

- M1 và P5 đã triển khai; bằng chứng gần nhất: [REPORT_M2_P5_ORGANIZATION_RBAC_01.md](REPORT_M2_P5_ORGANIZATION_RBAC_01.md), 16 suites/68 tests PASS, coverage statements 98.19%/branches 90.90%, Compose P5 PASS. Đây là kết quả lượt trước, không phải đã chạy lại trong lượt chuẩn bị.
- HTTP canonical v1.1.0, event schema v1; [ADR 0003](../../../docs/adr/0003-m2-p5-organization-rbac.md) chỉ duyệt P5. EVENT ownership chỉ fixture resolver inject từ test; cấu hình thường fail closed khi mutation cần resolver.
- Working tree có thay đổi M1/P5 chưa commit. Giữ nguyên; không reset/clean hoặc coi thiếu commit là thiếu implementation.
- Manual Swagger/DOC-01 chưa chạy; M2 chưa hoàn tất vì P6 còn thiếu.

## Phần M2 chưa hoàn tất

1. P0 cho P6: D08 invitation policy, phần invitation của D07, operation/target/replay của D06 và trigger accept của D12 chưa được duyệt riêng. TTL invitation 7 ngày vẫn là đề xuất; TTL idempotency 24h của P5 không tự trở thành quyết định cho mọi operation P6.
2. Canonical contract cho năm API P6 chưa có: tạo lời mời, danh sách lời mời của tôi, accept, decline, revoke; DTO/status/error/pagination và generated types/projection tương ứng.
3. Migration invitation chưa có: FK org/inviter/invitee, role snapshot phía server, trạng thái/hạn xử lý, uniqueness lời mời PENDING và xử lý EXPIRED dưới khóa. Giữ dữ liệu M1/P5 và backlog, không reset DB.
4. Nghiệp vụ P6 chưa có: tạo/list/accept/decline/revoke/expiry. Accept phải tạo membership/assignments/revision/MembershipChanged nguyên tử cùng result/idempotency; kiểm người nhận, inviter hiện còn quyền, trạng thái/scope và membership hiện có. Không nhận role mới từ body accept.
5. Gateway/Swagger/HTTP collection chưa có flow OWNER tạo → người nhận đăng nhập → xem/accept → users/me thấy membership. Internal endpoint vẫn không được route ra Gateway.
6. Test P6 chưa có: wrong recipient/org/role, thiếu token/key, user LOCKED/membership INACTIVE, hết hạn/thu hồi, inviter mất quyền khi chờ khóa, replay/conflict/TTL, accept cạnh tranh accept/decline/revoke, rollback/no-op/revision/event và upgrade giữ dữ liệu. Dùng PostgreSQL thật, ghi RED/GREEN; EVENT fixture tách riêng.
7. Nghiệm thu M2: regression M1/P5/P6, canonical response validation, coverage, Compose flow P6, security review tenant isolation/privilege escalation, manual Swagger/DOC-01 và tài liệu bàn giao còn phải hoàn thành theo phạm vi nghiệm thu.

## Những quyết định phải đưa ra để người dùng xác nhận trước phần phụ thuộc

| Chủ đề | Nội dung cần chốt |
|---|---|
| D08 | Thời hạn lời mời; lifecycle PENDING/ACCEPTED/DECLINED/REVOKED/EXPIRED; status/error từng API; email không tồn tại, đã là member, lời mời trùng, accept với key mới khi đã xử lý |
| D07 invitation | Snapshot assignments server-side, uniqueness PENDING, chuyển EXPIRED trước tạo mới, timestamps; khóa theo thứ tự tương thích key → org → users/invitation/membership và kiểm quyền/trạng thái lại |
| D06 P6 | Operation riêng CREATE/ACCEPT/DECLINE/REVOKE_INVITATION; hash có org/invitation target, TTL/lock policy, điều kiện được nhận cached success sau state đã thay đổi |
| D12 P6 | Accept tạo membership mới phát CREATED revision 1; create/decline/revoke/expire chưa đổi membership không phát MembershipChanged; replay/rollback không event/revision mới. Phải xác nhận/test cho P6, không suy từ PASS P5 |
| D09 | Giữ ORG thật, EVENT chỉ fixture test; create và accept đều xác minh scope; normal runtime không fallback fixture. Event thật M4 không thuộc P6 |

Nghiệp vụ mời **user đã có tài khoản**, người nhận tự đăng nhập/chấp nhận, và chưa gửi email đã được chốt trong MASTER_PLAN; không hỏi lại các điểm này. Không tự thêm event invitation, Notification, worker RabbitMQ hoặc frontend.

## Các điểm tài liệu cần đồng bộ

- MASTER_PLAN/P5 còn checkbox trống dù implementation đã có bằng chứng. Khi cập nhật tiến độ, đối chiếu báo cáo P5; không diễn giải checkbox cũ thành chưa triển khai.
- Catalog vẫn còn dòng invitation STRETCH/user chưa có tài khoản; trái phạm vi M2 trong MASTER_PLAN. Sửa khi P0 P6 freeze, không triển khai theo dòng cũ.
- Handoff H05 còn mô tả M1; cập nhật bàn giao tăng dần theo bằng chứng P5/P6 và người nhận thực tế, không ghi integration/manual PASS thay người nhận.

## Điểm bắt đầu cho lượt thực hiện

Đọc MASTER_PLAN/P6, báo cáo P0/P5, ADR 0003, identity-handoff và canonical contracts; kiểm working tree và chạy lại baseline phù hợp. Sau đó đề xuất contract P6 cụ thể và hỏi người dùng các quyết định còn mở ở trên. Chỉ sau xác nhận mới cập nhật canonical/projection/generated types và triển khai migration/handler bằng TDD. Không sửa identity.d.ts bằng tay. Dùng các skill NestJS, contract-first, database-migrations, tdd-workflow và security-review như lượt P5.

Đầu ra báo cáo gợi ý: REPORT_M2_P6_CONTRACT_01.md và REPORT_M2_P6_INVITATION_01.md trong thư mục này. Ghi lệnh thực sự chạy, expected/actual, RED/GREEN, coverage, provider thật/fixture và NOT RUN; không ghi đè bằng chứng P5 để báo hoàn tất P6.

M3 worker/broker/consumer projection và M4 Event/frontend/service nghiệp vụ thật là mốc riêng, không phải phần thiếu phải kéo vào để hoàn thành P6.
