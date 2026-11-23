package com.luma.registration.outbox;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.luma.registration.common.messaging.TraceHeaders;
import com.luma.registration.common.web.RequestIdFilter;
import org.slf4j.MDC;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.UUID;

/** Ghi row outbox CÙNG transaction đang gọi (BR-ASY-01) — worker 2.3 mới publish, ở đây không đụng broker. */
@Component
public class OutboxWriter {

    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;

    public OutboxWriter(JdbcTemplate jdbc, ObjectMapper mapper) {
        this.jdbc = jdbc;
        this.mapper = mapper;
    }

    public void enqueue(UUID aggregateId, String eventType, Map<String, Object> payload) {
        String json;
        try {
            json = mapper.writeValueAsString(payload);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Không serialize được outbox payload " + eventType, e);
        }
        // request_id và causation_id đều đọc từ MDC: request path do RequestIdFilter ghi, consumer
        // path do IdempotentConsumer ghi. Đường không có message cha (HTTP, worker hết hạn) để NULL.
        String causation = MDC.get(TraceHeaders.CAUSATION_ID);
        jdbc.update("""
                INSERT INTO outbox_events (aggregate_id, event_type, payload, request_id, causation_id)
                VALUES (?, ?, ?::jsonb, ?, ?)""",
                aggregateId, eventType, json, MDC.get(RequestIdFilter.MDC_KEY),
                causation == null ? null : UUID.fromString(causation));
    }
}
