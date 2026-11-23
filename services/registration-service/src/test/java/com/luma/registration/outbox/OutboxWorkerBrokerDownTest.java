package com.luma.registration.outbox;

import com.luma.registration.common.web.RequestIdFilter;
import com.luma.registration.reservation.ReservationService;
import com.luma.registration.reservation.TestData;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.slf4j.MDC;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

/**
 * Broker chết thì outbox phải còn nguyên: point port AMQP sang cổng không ai nghe, worker chạy
 * một vòng, published_at phải ở lại NULL để lần quét sau phát lại cùng event_id (plan 2.3, BR-ASY-01).
 * Context riêng vì port khác, nên chỉ override port — hai poll-interval lấy từ application.properties
 * chung để worker nền của context này không đụng dữ liệu của test khác.
 */
@SpringBootTest(properties = "spring.rabbitmq.port=59999")
class OutboxWorkerBrokerDownTest {

    @Autowired
    private OutboxWorker worker;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private ReservationService service;

    private final List<UUID> events = new ArrayList<>();

    @AfterEach
    void donDevDb() {
        TestData.deleteAll(jdbc, events);
        events.clear();
        jdbc.update("DELETE FROM outbox_events");
    }

    @Test
    void brokerChetThiOutboxVanGhiVaKhongDuocDanhDauPublishedAt() {
        UUID eventId = UUID.randomUUID();
        events.add(eventId);
        TestData.insertSnapshot(jdbc, eventId, "PUBLISHED");
        String type = TestData.insertTicketType(jdbc, eventId, "VIP", "150000.00", 100,
                Instant.now().minusSeconds(3600), Instant.now().plusSeconds(3600), "ACTIVE").toString();

        MDC.put(RequestIdFilter.MDC_KEY, "req-broker-down");
        try {
            ReservationService.HeldResponse response = (ReservationService.HeldResponse)
                    service.reserve(new ReservationService.Command("11111111-1111-1111-1111-111111111111",
                            "down@test.local", eventId,
                            List.of(new ReservationService.ItemInput(type, 1)), "bd-1"));
            assertThat(jdbc.queryForObject(
                    "SELECT count(*) FROM outbox_events WHERE aggregate_id = ? AND published_at IS NULL",
                    Integer.class, UUID.fromString(response.reservationId()))).isEqualTo(1);

            assertThatCode(() -> worker.publishPending()).doesNotThrowAnyException();

            assertThat(jdbc.queryForObject(
                    "SELECT event_id FROM outbox_events WHERE aggregate_id = ? AND published_at IS NULL",
                    UUID.class, UUID.fromString(response.reservationId()))).isNotNull();
        } finally {
            MDC.clear();
        }
    }
}
