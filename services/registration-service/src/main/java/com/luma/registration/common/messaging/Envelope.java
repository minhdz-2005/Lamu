package com.luma.registration.common.messaging;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.amqp.core.Message;

import java.nio.charset.StandardCharsets;
import java.util.UUID;

/**
 * Envelope 8 field theo shared/contracts/events/README.md, cộng header `correlation_id` của
 * messaging §5. `event_id` trong envelope và header `message_id` phải trùng khớp tuyệt đối —
 * consumer chống trùng bằng header nên lệch một ký tự là message hỏng, không phải chuyện để suy.
 */
public record Envelope(UUID eventId, String eventType, int version, String occurredAt, String aggregateType,
                       UUID aggregateId, String producer, JsonNode payload, String correlationId) {

    public static final class InvalidEnvelope extends RuntimeException {
        public InvalidEnvelope(String reason) {
            super(reason);
        }
    }

    public static Envelope parse(Message message, ObjectMapper mapper) {
        String headerMessageId = message.getMessageProperties().getMessageId();
        if (headerMessageId == null || headerMessageId.isBlank()) {
            throw new InvalidEnvelope("thiếu header message_id");
        }
        JsonNode node;
        try {
            node = mapper.readTree(new String(message.getBody(), StandardCharsets.UTF_8));
        } catch (Exception unreadable) {
            throw new InvalidEnvelope("body không phải JSON: " + unreadable.getMessage());
        }
        UUID eventId = uuid(node.path("event_id").asText(null), "event_id");
        UUID aggregateId = uuid(node.path("aggregate_id").asText(null), "aggregate_id");
        if (!eventId.equals(uuid(headerMessageId, "message_id"))) {
            throw new InvalidEnvelope("header message_id " + headerMessageId + " khác envelope event_id " + eventId);
        }
        String eventType = text(node, "event_type");
        if (!node.path("payload").isObject()) {
            throw new InvalidEnvelope("payload phải là object");
        }
        return new Envelope(eventId, eventType, node.path("version").asInt(),
                text(node, "occurred_at"), node.path("aggregate_type").asText(null), aggregateId,
                node.path("producer").asText(null), node.path("payload"),
                message.getMessageProperties().getCorrelationId());
    }

    private static String text(JsonNode node, String field) {
        String value = node.path(field).asText(null);
        if (value == null || value.isBlank()) {
            throw new InvalidEnvelope("thiếu field " + field);
        }
        return value;
    }

    private static UUID uuid(String raw, String field) {
        try {
            return UUID.fromString(raw);
        } catch (IllegalArgumentException | NullPointerException e) {
            throw new InvalidEnvelope(field + " không phải UUID: " + raw);
        }
    }
}
