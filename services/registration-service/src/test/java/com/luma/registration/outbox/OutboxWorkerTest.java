package com.luma.registration.outbox;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.luma.registration.common.web.RequestIdFilter;
import com.luma.registration.reservation.ReservationService;
import com.luma.registration.reservation.TestData;
import com.rabbitmq.client.GetResponse;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.MDC;
import org.springframework.amqp.core.Binding;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.core.MessageDeliveryMode;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.rabbit.core.RabbitAdmin;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Cần RabbitMQ dev đang chạy (compose file gốc, cổng 5672). Scheduling tắt trong context này
 * qua poll-ms 1 giờ — test gọi thẳng worker.publishPending().
 */
@SpringBootTest(properties = "app.outbox.poll-ms=3600000")
class OutboxWorkerTest {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String USER_ID = "11111111-1111-1111-1111-111111111111";

    @Autowired
    private OutboxWorker worker;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private RabbitTemplate rabbit;

    @Autowired
    private RabbitAdmin admin;

    @Autowired
    private ReservationService service;

    private final List<UUID> events = new ArrayList<>();
    private String testQueue;

    @BeforeEach
    void chuanBiQueue() {
        jdbc.update("DELETE FROM outbox_events");
        testQueue = "test.outbox." + UUID.randomUUID();
        admin.declareQueue(new Queue(testQueue, true, false, false, null));
        admin.declareBinding(new Binding(testQueue, Binding.DestinationType.QUEUE,
                "luma.registration", "reservation.created.v1", null));
    }

    @AfterEach
    void donDevDb() {
        admin.deleteQueue(testQueue);
        TestData.deleteAll(jdbc, events);
        events.clear();
        jdbc.update("DELETE FROM outbox_events");
    }

    private String makeHeldReservation(String requestId) {
        UUID eventId = UUID.randomUUID();
        events.add(eventId);
        TestData.insertSnapshot(jdbc, eventId, "PUBLISHED");
        String type = TestData.insertTicketType(jdbc, eventId, "VIP", "150000.00", 100,
                Instant.now().minusSeconds(3600), Instant.now().plusSeconds(3600), "ACTIVE").toString();
        MDC.put(RequestIdFilter.MDC_KEY, requestId);
        try {
            ReservationService.HeldResponse response = (ReservationService.HeldResponse)
                    service.reserve(new ReservationService.Command(USER_ID, "worker@test.local", eventId,
                            List.of(new ReservationService.ItemInput(type, 1)), "wk-" + requestId));
            return response.reservationId();
        } finally {
            MDC.clear();
        }
    }

    @Test
    void envelopeDu8FieldHeaderDungMessaging5VaGhiPublishedAtSauConfirm() throws Exception {
        String reservationId = makeHeldReservation("req-worker-1");

        worker.publishPending();

        GetResponse delivered = rabbit.execute(channel -> channel.basicGet(testQueue, true));
        assertThat(delivered).as("message phải tới broker sau khi publishPending").isNotNull();
        JsonNode envelope = JSON.readTree(new String(delivered.getBody(), StandardCharsets.UTF_8));

        assertThat(envelope.hasNonNull("event_id")).isTrue();
        assertThat(envelope.hasNonNull("event_type")).isTrue();
        assertThat(envelope.get("version").asInt()).isEqualTo(1);
        assertThat(envelope.get("occurred_at").asText()).matches("^\\d{4}-\\d{2}-\\d{2}T.*Z$");
        assertThat(envelope.get("aggregate_type").asText()).isEqualTo("reservation");
        assertThat(envelope.get("aggregate_id").asText()).isEqualTo(reservationId);
        assertThat(envelope.get("producer").asText()).isEqualTo("registration");
        JsonNode payload = envelope.get("payload");
        for (String field : List.of("reservation_id", "event_id", "organization_id", "user_id",
                "total_amount", "currency", "expires_at")) {
            assertThat(payload.hasNonNull(field)).as(field).isTrue();
        }
        assertThat(payload.hasNonNull("expires_at")).isTrue();

        var props = delivered.getProps();
        assertThat(props.getMessageId()).isEqualTo(envelope.get("event_id").asText());
        assertThat(props.getCorrelationId()).isEqualTo("req-worker-1");
        assertThat(props.getType()).isEqualTo("ReservationCreated");
        assertThat(props.getTimestamp()).isNotNull();
        assertThat(props.getDeliveryMode()).as("messaging.md §5: delivery_mode=2")
                .isEqualTo(MessageDeliveryMode.toInt(MessageDeliveryMode.PERSISTENT));
        assertThat(props.getContentType()).isEqualTo("application/json");

        assertThat(jdbc.queryForObject("SELECT published_at FROM outbox_events WHERE aggregate_id = ?",
                Instant.class, UUID.fromString(reservationId))).isNotNull();
    }

    @Test
    void thatBayXacNhanThiPhatLaiDungNganEventId() throws Exception {
        String reservationId = makeHeldReservation("req-worker-2");

        worker.publishPending();
        Message first = rabbit.receive(testQueue, 5_000);
        assertThat(first).isNotNull();
        String eventIdFirst = JSON.readTree(new String(first.getBody(), StandardCharsets.UTF_8))
                .get("event_id").asText();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM outbox_events WHERE published_at IS NULL",
                Integer.class)).isZero();

        // Giả lập broker chết sau khi gửi nhưng chưa kịp lưu confirm: reset published_at về NULL.
        jdbc.update("UPDATE outbox_events SET published_at = NULL");

        worker.publishPending();
        Message replay = rabbit.receive(testQueue, 5_000);
        assertThat(replay).isNotNull();
        String eventIdReplay = JSON.readTree(new String(replay.getBody(), StandardCharsets.UTF_8))
                .get("event_id").asText();

        assertThat(eventIdReplay).isEqualTo(eventIdFirst);
        assertThat(replay.getMessageProperties().getMessageId()).isEqualTo(eventIdFirst);
        assertThat(jdbc.queryForObject("SELECT published_at FROM outbox_events WHERE aggregate_id = ?",
                Instant.class, UUID.fromString(reservationId))).isNotNull();
    }

    @Test
    void eventTypeKhongCoTrongBangRoutingThiKhongGhiPublishedAt() {
        jdbc.update("INSERT INTO outbox_events (aggregate_id, event_type, payload) VALUES (?, 'UnknownEvent', '{}'::jsonb)",
                UUID.randomUUID());

        worker.publishPending();

        assertThat(jdbc.queryForObject("SELECT count(*) FROM outbox_events WHERE published_at IS NOT NULL",
                Integer.class)).isZero();
    }
}
