# Tích hợp frontend Identity Pages 02

Nghiệm thu local đạt ngày 18/11/2026 (Asia/Saigon). Phạm vi: Account, Organizations, Organization Detail và My Invitations. [Kế hoạch và nhật ký](PLAN_FRONTEND_IDENTITY_PAGES_INTEGRATION_02.md) · [Báo cáo UI](../../../docs/ui/reports/identity-pages-integration-02.md).

## Thay đổi

| Bước | Kết quả triển khai |
|---|---|
| S1 / S1b | HTTP Identity 1.5.0, Gateway projection, generated types. GET danh sách lời mời đã gửi theo tổ chức với kiểm quyền và phân trang trong cùng snapshot Repeatable Read. Migration index theo org, thời điểm tạo và ID. |
| S2 | Next allowlist method/path, query phân trang, body và Idempotency-Key. Không chuyển cookie, client IP hoặc identity context tự khai. Phản hồi private no-store; giới hạn body 64 KiB. Session xác minh qua Profile, rotation phối hợp Web Locks, phân biệt lỗi quyền nghiệp vụ và tài khoản bị khóa. |
| S3 / S4 | Header và Account dùng Profile thật. Tạo org chỉ gửi tên đã trim. Giữ ID đã xác nhận nếu tải lại Profile lỗi. |
| S5 / S6 | Overview và members lazy, phân trang server. OWNER quản lý role ORG, lời mời và thu hồi sau reload. ADMIN đọc members. Row có phạm vi EVENT hoặc assignment chưa hỗ trợ vẫn hiển thị dữ liệu và khóa editor. |
| S7 | Inbox phân trang server, accept/decline xác nhận và cập nhật theo server. Chặn fresh accept cho snapshot EVENT. Hỗ trợ decline/revoke lời mời cũ theo chính sách Identity. |
| S8 | Real build và browser trên Chrome, provider trên PostgreSQL riêng. Review auth, phạm vi quyền và dữ liệu liên tổ chức. |

## Quyết định kỹ thuật

- Giữ kiến trúc session v2 và auth có sẵn. Profile được xác minh trước khi hiện dữ liệu. Cache chỉ giữ các trường cần cho UI. Logout lỗi upstream hiển thị trạng thái đã xóa phiên local, chưa xác nhận revoke server.
- Retry mutation có kết quả chưa rõ dùng lại method, path, body và key trong 24 giờ. Khi hết cửa sổ hoặc reload trang, đọc trạng thái server để đối chiếu. Server vẫn có thể hoàn tất một thao tác đã gửi trước khi tab đóng hoặc phiên đổi.
- GET outgoing trả tên và email **hiện tại** của người nhận. Quyền OWNER phải còn hiệu lực khi bắt đầu đọc snapshot. Trạng thái EXPIRED được suy ra khi đọc và không sửa bản ghi. Gateway giữ quy ước 404 khi không tìm thấy tổ chức và 403 khi tổ chức tồn tại nhưng thiếu quyền.
- Cập nhật Next.js lên 16.4.5 sau khi build phát hiện advisory ở 16.4.3. Patch liên quan cache và tự host proxy. [Bản vá Next.js 16.4.5](https://github.com/vercel/next.js/releases/tag/v16.4.5).

## Kiểm chứng

| Lệnh | Kết quả |
|---|---|
| `npm run generate:contracts`, `npm run contracts:check` | PASS. Canonical, projection và types đồng bộ. |
| `npm run typecheck`, `npm --prefix frontend run typecheck` | PASS. |
| `npm --prefix frontend test`, `npm --prefix frontend run test:coverage` | PASS trên 38 test, 0 skip. c8 core 87,39% lines/statements, 85,95% branches, 86,89% functions. Phạm vi c8 theo script, React/session hook kiểm qua browser và test có mục tiêu. |
| `node scripts/test-db.cjs --migrate --seed --schema-check --runTestsByPath tests/p5-organization.spec.ts tests/p6-invitation.spec.ts tests/organization-auto-slug.spec.ts tests/p5-contract.spec.cjs tests/p6-contract.spec.cjs` | PASS 34 tests / 5 suites, 0 skip. 9 migrations, seed hai lần, Prisma không drift. EXPLAIN thật có index scan cho phân trang outgoing. |
| `$env:NEXT_PUBLIC_AUTH_MODE='real'; npm --prefix frontend run build` | PASS với Next.js 16.4.5, cả bốn route trong output. |
| `npm --prefix frontend audit --audit-level=moderate` | 0 vulnerabilities sau cập nhật patch. |
| Runner tổng hợp bên dưới | PASS 82/82 trong 11 suites, 0 skip. Gồm 18 ca Chrome (10 Identity Pages và 8 hồi quy auth), cùng provider/contract. 9 migration áp dụng thành công, Prisma không drift và seed chạy hai lần. |

Lệnh chạy tổng hợp từ repo root, sau khi build real:

```powershell
$env:NEXT_PUBLIC_AUTH_MODE='real'
node scripts/test-db.cjs --migrate --seed --security --schema-check --runTestsByPath tests/frontend-auth-browser.spec.ts tests/p2-auth.spec.ts tests/p3-jwt-profile.spec.ts tests/p4-session.spec.ts tests/recovery.spec.ts tests/frontend-auth-contract.spec.cjs tests/p5-organization.spec.ts tests/p6-invitation.spec.ts tests/organization-auto-slug.spec.ts tests/p5-contract.spec.cjs tests/p6-contract.spec.cjs
```

Môi trường Windows, Node 24.19.0, Docker 29.9.3, Playwright 1.56.1, Chrome 157 headless trên loopback HTTP. Runner cấp PostgreSQL 16 trên tmpfs và Mailpit local bằng cổng ngẫu nhiên, thay DATABASE_URL và dọn containers. Migration và seed chỉ dùng DB `identity_test` của runner.

## Review

Review độc lập đã kiểm luồng refresh/logout, generation, profile403, cache và read snapshot phân quyền. Đã sửa khả năng UI đăng nhập kẹt khi xác minh Profile gặp 403 hoặc mất phiên, bắt đầu lại Profile read khi invalidation đến giữa request, chỉ cache trường được phép, chặn payload proxy quá lớn và chuyển CTA tạo org real ở Organizer về form chung. Browser dùng xác thực thật; fault injection chỉ sửa cách trình duyệt nhận kết quả sau provider hoặc giả lỗi transport có chủ đích.

## Giới hạn

Local nghiệm thu luồng ORG. Event provider, gửi email lời mời, chỉnh sửa hồ sơ/media, rollout production và restore phiên/mutation sau reload thuộc phạm vi khác.


Browser nghiệm thu dùng Chrome trên loopback. Phối hợp Web Locks kiểm qua rotation nhiều tab, timeout và giải phóng khi đóng tab; dữ liệu sent kiểm qua điều hướng bỏ phản hồi muộn và mất quyền giữa phiên. Giới hạn EVENT kiểm bằng snapshot đã lưu trong DB test. Test khóa fresh accept, vẫn thực hiện decline qua provider thật. Thay đổi nằm trong working tree cùng auth baseline chưa commit.
