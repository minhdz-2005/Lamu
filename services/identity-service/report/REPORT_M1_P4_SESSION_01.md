# M1 / P4 — Refresh/logout

Ngày: 13/11/2026 (Asia/Saigon). Implementation: **IMPLEMENTED trong working tree**. Verification: **PASS tự động trong phạm vi M1**. Manual handoff/Swagger bởi người nhận: **NOT RUN**.

P3 GREEN trước P4. AuthService dùng transaction PostgreSQL/tagged parameterized SQL khóa session; refresh kiểm expires/revoke và trạng thái user dưới khóa, rotation hash giữ sid/hạn; logout đối chiếu cả sub/sid rồi revoke hoặc retry cùng phiên. Controller mỏng, DTO validate, Gateway bảo vệ logout bằng JWT. Session/hash được giữ, chưa cleanup ở M1; refresh đã rotation không được dùng lại.

## TDD và bằng chứng

| Target / guarantee | RED thực tế | GREEN / kết quả |
|---|---|---|
| `tests/p4-session.spec.ts`: session/race/logout/rollback | `node scripts/test-db.cjs --migrate --testPathPatterns=p4-session`: 7 failed vì route 404 | Cùng lệnh: 7 passed. Lỗi escape trong SQL interpolation ở lần triển khai đầu gây 500; đã sửa về tagged SQL có parameter trước GREEN |
| `tests/p4-security.spec.ts`: Gateway readiness và auth rate limit riêng | Cùng test target với DB harness: 2 failed/3 passed, readiness 404 và auth rate thiếu (502 thay 429) | GREEN trong suite tổng; timeout 504/unavailable 502, request ID/envelope, malformed JSON, verified context đều đạt |
| `tests/p4-clock.spec.ts`: trước/đúng hạn bảy ngày, retry revoke | Bổ sung kiểm chứng cho code đã có RED HTTP session; không sửa production thêm vì test clock | PASS trên DB thật với clock injection; expires_at không tăng, đúng boundary 401, giữ revoked_at/hash |
| `tests/p4-env.spec.ts`: config/seed/startup | RED 1 failed/1 passed: URL PostgreSQL thiếu host/database chưa bị validate | GREEN sau URL parsing; final thêm subprocess hai entrypoint exit 1 khi secret sai, seed production bị chặn |
| Image runtime loại dev tools | `docker run ... gateway ...`: exit 1, `RED: development runner remains in runtime image` | Prune không dùng workspace filter; final Compose kiểm Jest/tsx vắng mặt cả hai runtime, tools image riêng |

Lần gọi security test trực tiếp thiếu test env không được tính RED; đã sửa cách chạy qua DB harness và lấy RED hợp lệ. Một lỗi TypeScript trong helper request header đã sửa trước RED hợp lệ. Không ghi các lỗi test setup thành bằng chứng hành vi.

`npm run test:m1`: **12 suites / 42 tests passed**, 19.651s. Coverage ứng dụng/runtime: statements **98.84%**, branches **95.30%**, functions **100%**, lines **99.02%**. Coverage loại main bootstrap và Prisma generated; main được kiểm bằng subprocess negative-config, container startup thật. Seed/scripts có smoke riêng, không nằm mẫu số coverage ứng dụng. Jest map package runtime sang source để không đo nhầm dist. `npm run typecheck` (gồm build ba workspace), `npm run format:check`, `npm run contracts:check`, `git diff --check`: exit 0. Lần format đầu chạm README scaffold cũ đã được sửa phạm vi check chỉ source/test/script mới, không format lại tài liệu không liên quan.

## Container/restart và baseline

`npm run test:compose` PASS cuối trên project `lamu-m1-smoke-1794545235520`, app thật/PostgreSQL 16.15. [Evidence image IDs](M1_COMPOSE_EVIDENCE_01.json). Không RabbitMQ, frontend hoặc Event thật.

- Auth/profile hai phiên: cặp lệch 401, logout A/retry 200, A refresh 401, B rotation 200.
- Chạy lại migrate deploy và restart DB/Identity/Gateway giữ ID/password hash/session hash/hạn/outbox payload/status; refresh phiên còn hạn thành công sau restart.
- Seed hai lần giữ state, không event demo; chỉ Gateway publish host port, user node chạy runtime; migration job exit 0.
- Cố ý stop DB trong project test: Identity healthz 200/readyz 503, Gateway healthz 200/readyz 503; DB start lại readiness hồi phục.
- Image app không có Jest/tsx; image tools riêng giữ CLI cho migration/seed/benchmark.

Lần smoke trước final giữ sai cổng ngẫu nhiên sau restart khiến script timeout mặc dù cả hai app đã healthy; đã sửa đọc lại port và timeout fetch, chạy lại toàn gate thành công. Đây là lỗi harness; không coi lần timeout đó là PASS. Project test được dọn đúng tên, không xóa volume demo.

[Baseline container](M1_ARGON2_BASELINE_01.txt): Node 24.19.0, Argon2 0.45.2, Linux x64, AMD Ryzen 5 6600H, Docker quota 2 CPU/256 MiB; OS nhìn thấy 12 CPU và khoảng 7.9 GB là số visible host/VM, không phải quota. Argon2id 19456 KiB/2/1; một warmup, mỗi ca 20 lần hash+verify input tổng hợp. Concurrency 1 p50 **35.66ms**, p95 **53.08ms**, 0 lỗi; concurrency 4 p50 **98.80ms**, p95 **110.64ms**, 0 lỗi. Chỉ baseline, không SLA hay end-to-end login load benchmark.

## Giới hạn/bàn giao

Access còn sống tối đa tới exp sau logout; không revoke access tức thời/logout-all/reuse-family revocation. Identity kiểm LOCKED hiện tại, chưa cam kết service M4. Bearer/refresh JSON cho Swagger/API client là contract đã chốt; browser storage/cookie/CSRF policy và frontend logout coordinator thuộc M4. Network trust chỉ local, chưa service-to-service authentication ngoài local. Rate limit IP trong RAM, auth 20/phút/general 100/phút mặc định; Identity sau Gateway có IP aggregate, không distributed/user limiter. No cleanup session M1.

Manual Swagger bởi người nhận/DOC-01, production-sized migration/restore, M1→M2/M3 upgrade thật, RabbitMQ worker/delivery, frontend/Event thật: **NOT RUN**. [Runbook](../README.md), [HTTP collection](../requests/m1.http), [Swagger contract](../../../shared/contracts/http/gateway.openapi.json) đã có. Không tự commit.
