# M1 / P1 — Hạ tầng và database

Ngày: 13/11/2026 (Asia/Saigon). Implementation: **IMPLEMENTED trong working tree**. Verification: **PASS tự động M1**, theo phạm vi và giới hạn bên dưới.

Quyết định đã được người dùng chốt, nguồn [ADR 0002](../../../docs/adr/0002-m1-auth-gateway.md). Đã tạo config validation, error envelope/request ID, liveness/readiness, shutdown; hai app NestJS độc lập và Dockerfile, root npm workspace/lockfile. Prisma 7 dùng pg adapter; migration `202611130001_m1` tạo tám bảng nền + outbox, CITEXT, CHECK/FK/unique nullable. Không worker/broker trong transaction. Seed riêng APP_ENV=local, lặp an toàn và không event.

| Guarantee / test target | RED thực tế | GREEN thực tế |
|---|---|---|
| Config/health, tests/p1-infra.spec.ts | `npm test -- --testPathPatterns=p1-infra`: TS2307 do các module cần triển khai chưa tồn tại (compile-time RED), 0 runtime tests | Cùng lệnh: 3 passed; weak config bị từ chối, DB unavailable readiness 503/liveness 200, internal Gateway 404/security headers |
| DDL/constraints, tests/p1-database.spec.ts | `node scripts/test-db.cjs --testPathPatterns=p1-database`: 2 failed, thiếu tables/users trên PostgreSQL thật | `node scripts/test-db.cjs --migrate --testPathPatterns=p1-database`: 2 passed, migration deploy exit 0 |
| Seed, tests/p1-seed.spec.ts | `node scripts/test-db.cjs --migrate --testPathPatterns=p1-seed`: expected 4 roles, received 0 | `node scripts/test-db.cjs --migrate --seed --testPathPatterns=p1`: 6 passed tổng P1, seed thực sự chạy hai lần, 4 roles/10 permissions/2 org/no outbox |

`npm run build`: ba workspace build exit 0. DB test dùng postgres:16-alpine riêng, tmpfs, random credentials trong RAM, host loopback port tạm; container được xóa sau suite. Không đụng volume demo. Migration rollback production là forward migration hoặc phục hồi backup đã kiểm chứng; migration đầu tạo schema mới không có auto destructive DOWN. Test dữ liệu production-sized/restore **NOT RUN**. Prisma warnings về thiếu OpenSSL khi build slim đã dẫn tới bổ sung OpenSSL/CA trước khi chạy container.

Gate P1 Compose **PASS**: `node scripts/compose-smoke.cjs`, project `lamu-m1-smoke-1794543843576`, exit 0; cả hai app healthy, migration Exited(0), Identity ready, inspect không có host bindings của Identity/DB, không chạy RabbitMQ. Project/volume test được dọn. Restart persistence và Argon2 container baseline sẽ kiểm tại bàn giao P4, hiện NOT RUN. `npm audit --omit=dev --audit-level=moderate`: 0 vulnerabilities sau cập nhật express-rate-limit 8.7.4/Ajv 8.20.0; final image phải rebuild với lockfile mới.

Cập nhật bàn giao P4: final `npm run test:compose` PASS project `lamu-m1-smoke-1794545235520`. [Image/version evidence](M1_COMPOSE_EVIDENCE_01.json) ghi PostgreSQL 16.15 và SHA256 các image. Restart/redeploy giữ user IDs/password hashes/session hashes/hạn/org seed/backlog; seed hai lần không thay state; DB outage/recovery readiness đúng; image runtime không có Jest/tsx. Target tools riêng cho Prisma CLI/seed/benchmark, không chứa broker worker. Baseline Argon2 thực tế tại [M1_ARGON2_BASELINE_01.txt](M1_ARGON2_BASELINE_01.txt).

Kiểm chứng bổ sung `tests/p1-constraints.spec.ts` trong `npm run test:m1`: DB thật chặn orphan FK, scope shape sai, assignment ORG NULL trùng; cho phép E1/E2 khác nhau. Check một row không thay kiểm role/scope/tenant nhiều bảng của M2. `tests/p4-env.spec.ts` chứng minh seed ngoài local bị chặn, cấu hình sai làm process hai app exit 1 trước listen. Migration dữ liệu production-sized, backup/restore và upgrade M1→M2/M3 vẫn **NOT RUN**.
