package com.luma.registration.common.messaging;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.core.MessageDeliveryMode;
import org.springframework.amqp.core.MessageProperties;
import org.springframework.amqp.rabbit.core.RabbitTemplate;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Developer service khác publish message nghiệp vụ đúng envelope 8 field + header messaging §5 vào
 * exchange của họ, để test consumer đi qua cùng đường mà producer thật sẽ dùng.
 */
public final class TestMessages {

    private static final ObjectMapper JSON = new ObjectMapper();

    private TestMessages() {
    }

    /** Trả về `event_id` = `message_id` của message vừa phát — key chống trùng của consumer. */
    public static String published(RabbitTemplate rabbit, String exchange, String routingKey, String eventType,
                                   UUID aggregateId, Map<String, Object> payload, String correlationId) {
        String eventId = UUID.randomUUID().toString();
        return publishRaw(rabbit, exchange, routingKey, envelope(eventId, eventType, aggregateId, payload),
                eventId, correlationId);
    }

    /**
     * Envelope 8 field với `event_id` tự chọn — cần cho ca phát lại ĐÙNG message_id, nơi thân message
     * phải hợp lệ để chứng minh consumer chặn trùng bằng header chứ không bằng JSON hỏng.
     */
    public static String envelope(String eventId, String eventType, UUID aggregateId, Map<String, Object> payload) {
        Map<String, Object> envelope = new LinkedHashMap<>();
        envelope.put("event_id", eventId);
        envelope.put("event_type", eventType);
        envelope.put("version", 1);
        envelope.put("occurred_at", DateTimeFormatter.ISO_INSTANT.format(Instant.now()));
        envelope.put("aggregate_type", "event");
        envelope.put("aggregate_id", aggregateId.toString());
        envelope.put("producer", eventType.startsWith("Event") ? "event" : "payment");
        envelope.put("payload", payload);
        try {
            return JSON.writeValueAsString(envelope);
        } catch (Exception cannotSerialize) {
            throw new IllegalStateException(cannotSerialize);
        }
    }

    /** Cho ca message hỏng: tự chọn body/messageId, không kiểm tra schema. */
    public static String publishRaw(RabbitTemplate rabbit, String exchange, String routingKey, String body,
                                    String messageId, String correlationId) {
        Message message = new Message(body.getBytes(StandardCharsets.UTF_8));
        MessageProperties props = message.getMessageProperties();
        props.setContentType("application/json");
        props.setDeliveryMode(MessageDeliveryMode.PERSISTENT);
        props.setMessageId(messageId);
        props.setCorrelationId(correlationId);
        rabbit.send(exchange, routingKey, message);
        return messageId;
    }
}
