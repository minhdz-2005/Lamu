-- Worker outbox (plan 2.3): event_id phải GIỮ NGUYÊN qua mọi lần phát lại (messaging §6.3),
-- request_id mang X-Request-Id gốc cho header correlation_id (messaging §5).
ALTER TABLE outbox_events ADD COLUMN event_id UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE outbox_events ADD COLUMN request_id TEXT;
