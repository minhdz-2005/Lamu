# Hợp đồng tích hợp

HTTP Identity canonical v1.2.0 ở [identity.openapi.json](http/identity.openapi.json); Gateway là [projection](http/gateway.openapi.json), types derive trong `http/generated/`. Ba schema/fixtures Identity v1 ở [events](events/README.md); delivery authority [messaging v1](../../docs/api/messaging.md).

P8: [Event authorization-context 0.1.0 DRAFT](http/event-context.draft.openapi.json), chưa ACCEPTED hoặc provider/adapter thật. Generated draft types không được application import. Envelope Error tham chiếu Identity canonical, không có bản payload Markdown độc lập. [D09/handoff](../../docs/integration/identity-handoff.md#d09-draft) ghi người nhận chưa gán và quyết định cần xác nhận trước M4.

Từ root: `npm run contracts:check` kiểm Identity/projection; `node scripts/check-event-context-draft.cjs` kiểm draft/fixtures/allowlist refs và parity cả Identity/draft generated types. Generate draft bằng pinned CLI: `node node_modules/openapi-typescript/bin/cli.js shared/contracts/http/event-context.draft.openapi.json -o shared/contracts/http/generated/event-context.draft.d.ts`. Chỉ local refs và canonical Identity Error được phép; không remote refs hoặc generator tải mới. Cập nhật artifact trước implementation, review diff và regenerate; breaking change phải review/version trước consumer adoption.
