package com.luma.registration.outbox;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.core.MessageDeliveryMode;
import org.springframework.amqp.core.MessageProperties;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.format.DateTimeFormatter;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Worker outbox theo messaging §6: quét row chưa phát theo id tăng dần, publish lên
 * `luma.registration` với publisher confirm, chỉ điền `published_at` khi broker xác nhận.
 * Fail giữa chừng thì để nguyên — lần quét sau phát lại CÙNG event_id (§6.3).
 */
@Component
public class OutboxWorker {

    private static final Logger log = LoggerFactory.getLogger(OutboxWorker.class);
    private static final String EXCHANGE = "luma.registration";

    private record Routing(String routingKey, String aggregateType) {
    }

    private static final Map<String, Routing> ROUTES = Map.of(
            "ReservationCreated", new Routing("reservation.created.v1", "reservation"),
            "ReservationReleased", new Routing("reservation.released.v1", "reservation"),
            "RegistrationConfirmed", new Routing("registration.confirmed.v1", "registration"),
            "TicketIssued", new Routing("ticket.issued.v1", "ticket"),
            "BookingCancelled", new Routing("booking.cancelled.v1", "registration"));

    private final JdbcTemplate jdbc;
    private final RabbitTemplate rabbit;
    private final ObjectMapper mapper;

    public OutboxWorker(JdbcTemplate jdbc, RabbitTemplate rabbit, ObjectMapper mapper) {
        this.jdbc = jdbc;
        this.rabbit = rabbit;
        this.mapper = mapper;
    }

    private record PendingRow(long id, UUID eventId, UUID aggregateId, String eventType,
                              String payload, String requestId, Timestamp createdAt) {
    }

    @Scheduled(fixedDelayString = "${app.outbox.poll-ms:2000}",
            initialDelayString = "${app.outbox.poll-ms:2000}")
    public void publishPending() {
        List<PendingRow> rows = jdbc.query("""
                SELECT id, event_id, aggregate_id, event_type, payload::text AS payload, request_id, created_at
                FROM outbox_events WHERE published_at IS NULL ORDER BY id LIMIT 50""",
                (rs, n) -> new PendingRow(rs.getLong("id"), (UUID) rs.getObject("event_id"),
                        (UUID) rs.getObject("aggregate_id"), rs.getString("event_type"),
                        rs.getString("payload"), rs.getString("request_id"),
                        rs.getTimestamp("created_at")),
                new Object[]{});
        for (PendingRow row : rows) {
            Routing routing = ROUTES.get(row.eventType());
            if (routing == null) {
                log.error("outbox row {} có event_type '{}' không có trong routing key bảng messaging §2 — dừng quét",
                        row.id(), row.eventType());
                return;
            }
            try {
                Message message = buildMessage(row, routing);
                rabbit.invoke(operations -> {
                    operations.send(EXCHANGE, routing.routingKey(), message);
                    operations.waitForConfirmsOrDie(5_000);
                    return null;
                });
                jdbc.update("UPDATE outbox_events SET published_at = now() WHERE id = ?", row.id());
            } catch (Exception e) {
                log.warn("outbox row {} chưa được broker xác nhận ({}): để published_at NULL, quét sau phát lại",
                        row.id(), e.getMessage());
                return;
            }
        }
    }

    private Message buildMessage(PendingRow row, Routing routing) throws Exception {
        Map<String, Object> envelope = new LinkedHashMap<>();
        envelope.put("event_id", row.eventId().toString());
        envelope.put("event_type", row.eventType());
        envelope.put("version", 1);
        envelope.put("occurred_at", DateTimeFormatter.ISO_INSTANT.format(row.createdAt().toInstant()));
        envelope.put("aggregate_type", routing.aggregateType());
        envelope.put("aggregate_id", row.aggregateId().toString());
        envelope.put("producer", "registration");
        envelope.put("payload", (JsonNode) mapper.readTree(row.payload()));

        Message message = new Message(mapper.writeValueAsString(envelope).getBytes(StandardCharsets.UTF_8));
        MessageProperties props = message.getMessageProperties();
        props.setContentType("application/json");
        props.setMessageId(row.eventId().toString());
        props.setType(row.eventType());
        props.setTimestamp(Date.from(row.createdAt().toInstant()));
        props.setDeliveryMode(MessageDeliveryMode.PERSISTENT);
        if (row.requestId() != null) {
            props.setCorrelationId(row.requestId());
        }
        return message;
    }
}
