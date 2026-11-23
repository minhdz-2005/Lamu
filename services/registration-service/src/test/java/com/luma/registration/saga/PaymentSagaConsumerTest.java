package com.luma.registration.saga;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.luma.registration.common.messaging.Await;
import com.luma.registration.common.messaging.TestMessages;
import com.luma.registration.common.messaging.TopologyConfig;
import com.luma.registration.common.web.RequestIdFilter;
import com.luma.registration.reservation.ReservationService;
import com.luma.registration.reservation.TestData;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.amqp.rabbit.core.RabbitAdmin;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 3.4 — `registration.saga` trên broker dev: `PaymentSucceeded` là đường confirm duy nhất của vé có phí
 * (BR-RSV-01); reservation không còn HELD thì ack + bỏ qua kèm `request_id` trong log (BR-RSV-02,
 * messaging §9); `PaymentFailed` nhả chỗ và đóng dấu FAILED.
 */
@SpringBootTest
class PaymentSagaConsumerTest {

    private static final String USER = "11111111-1111-1111-1111-111111111111";

    @Autowired
    private RabbitTemplate rabbit;

    @Autowired
    private RabbitAdmin admin;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private ReservationService service;

    private final List<UUID> events = new ArrayList<>();
    private final UUID eventId = UUID.randomUUID();
    private UUID paidType;
    private ListAppender<ILoggingEvent> logs;

    @BeforeEach
    void chuanBiQueue() {
        events.add(eventId);
        admin.purgeQueue(TopologyConfig.SAGA_QUEUE + ".dlq", true);
        TestData.insertSnapshot(jdbc, eventId, "PUBLISHED");
        paidType = TestData.insertTicketType(jdbc, eventId, "VIP", "150000.00", 100,
                Instant.now().minusSeconds(3600), Instant.now().plusSeconds(3600), "ACTIVE");
        logs = new ListAppender<>();
        logs.start();
        ((Logger) LoggerFactory.getLogger(PaymentSagaService.class)).addAppender(logs);
    }

    @AfterEach
    void donDevDb() {
        ((Logger) LoggerFactory.getLogger(PaymentSagaService.class)).detachAppender(logs);
        TestData.deleteAll(jdbc, events);
        events.clear();
        jdbc.update("DELETE FROM processed_messages");
    }

    private String reserveHeld(String key) {
        MDC.put(RequestIdFilter.MDC_KEY, key);
        try {
            ReservationService.HeldResponse held = (ReservationService.HeldResponse) service.reserve(
                    new ReservationService.Command(USER, "buyer@test.local", eventId,
                            List.of(new ReservationService.ItemInput(paidType.toString(), 2)), key));
            return held.reservationId();
        } finally {
            MDC.clear();
        }
    }

    private int count(String sql, Object... args) {
        Integer value = jdbc.queryForObject(sql, Integer.class, args);
        return value == null ? 0 : value;
    }

    private Map<String, Object> paymentPayload(String reservationId, String extraField, String extraValue) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("payment_id", UUID.randomUUID().toString());
        payload.put("reservation_id", reservationId);
        payload.put("event_id", eventId.toString());
        payload.put("amount", "300000.00");
        payload.put("currency", "VND");
        if (extraField != null) {
            payload.put(extraField, extraValue);
        }
        return payload;
    }

    private int ticketsOf(String reservationId) {
        return count("SELECT count(*) FROM tickets WHERE registration_id IN "
                + "(SELECT id FROM registrations WHERE reservation_id = ?)", UUID.fromString(reservationId));
    }

    @Test
    void paymentSucceededXuatVeVaChotQuota() {
        String reservationId = reserveHeld("saga-ok");
        jdbc.update("DELETE FROM outbox_events");

        String parentEventId = TestMessages.published(rabbit, TopologyConfig.PAYMENT_EXCHANGE,
                "payment.succeeded.v1", "PaymentSucceeded", UUID.randomUUID(),
                paymentPayload(reservationId, null, null), "req-saga-1");
        Await.until("reservation CONFIRMED", () -> "CONFIRMED".equals(jdbc.queryForObject(
                "SELECT status FROM reservations WHERE id = ?", String.class, UUID.fromString(reservationId))));

        assertThat(jdbc.queryForObject("SELECT payment_status FROM reservations WHERE id = ?",
                String.class, UUID.fromString(reservationId))).isEqualTo("SUCCEEDED");
        assertThat(count("SELECT reserved FROM inventory WHERE ticket_type_id = ?", paidType)).isZero();
        assertThat(count("SELECT sold FROM inventory WHERE ticket_type_id = ?", paidType)).isEqualTo(2);
        assertThat(count("SELECT count(*) FROM tickets WHERE registration_id IN "
                + "(SELECT id FROM registrations WHERE reservation_id = ?)", UUID.fromString(reservationId)))
                .isEqualTo(2);
        assertThat(count("SELECT count(*) FROM outbox_events WHERE event_type = 'RegistrationConfirmed'"))
                .isEqualTo(1);
        assertThat(count("SELECT count(*) FROM outbox_events WHERE event_type = 'TicketIssued'")).isEqualTo(2);
        String issued = jdbc.queryForObject("SELECT code FROM tickets LIMIT 1", String.class);
        assertThat(issued).matches("^LUMA-[0-9A-F]{4}-[0-9A-F]{4}$");
        // messaging §5: ba event handler này sinh ra đều phải trỏ về đúng message PaymentSucceeded cha.
        assertThat(count("SELECT count(*) FROM outbox_events WHERE causation_id = ?",
                UUID.fromString(parentEventId)))
                .as("causation_id = event_id của message cha, mọi event sinh trong handler")
                .isEqualTo(3);
    }

    @Test
    void messageThuHaiKhacEventIdCungReservationKhongSinhVeThuHai() {
        String reservationId = reserveHeld("saga-twice");
        TestMessages.published(rabbit, TopologyConfig.PAYMENT_EXCHANGE, "payment.succeeded.v1",
                "PaymentSucceeded", UUID.randomUUID(), paymentPayload(reservationId, null, null), "req-saga-2");
        Await.until("confirm lần đầu", () -> "CONFIRMED".equals(jdbc.queryForObject(
                "SELECT status FROM reservations WHERE id = ?", String.class, UUID.fromString(reservationId))));
        int ticketsAfterFirst = ticketsOf(reservationId);
        jdbc.update("DELETE FROM outbox_events");

        TestMessages.published(rabbit, TopologyConfig.PAYMENT_EXCHANGE, "payment.succeeded.v1",
                "PaymentSucceeded", UUID.randomUUID(), paymentPayload(reservationId, null, null), "req-saga-2b");
        Await.until("consumer log bỏ qua cho req-saga-2b", () -> logs.list.stream().anyMatch(event ->
                event.getFormattedMessage().contains("req-saga-2b")
                        && event.getFormattedMessage().contains("bị bỏ qua")));

        assertThat(ticketsOf(reservationId)).as("không có vé thứ hai").isEqualTo(ticketsAfterFirst);
        assertThat(count("SELECT count(*) FROM outbox_events WHERE aggregate_id IN "
                + "(SELECT id FROM registrations WHERE reservation_id = ?)", UUID.fromString(reservationId)))
                .as("message thứ hai không sinh event").isZero();
        assertThat(count("SELECT sold FROM inventory WHERE ticket_type_id = ?", paidType)).isEqualTo(2);
    }

    @Test
    void reservationDaNhuChoThiAckBoQuaVaLogCoRequestId() {
        String reservationId = reserveHeld("saga-released");
        service.release(UUID.fromString(reservationId), USER);
        int reserved = count("SELECT reserved FROM inventory WHERE ticket_type_id = ?", paidType);
        int sold = count("SELECT sold FROM inventory WHERE ticket_type_id = ?", paidType);

        TestMessages.published(rabbit, TopologyConfig.PAYMENT_EXCHANGE, "payment.succeeded.v1",
                "PaymentSucceeded", UUID.randomUUID(), paymentPayload(reservationId, null, null), "req-saga-3");
        Await.until("log bỏ qua có request_id", () -> logs.list.stream().anyMatch(event ->
                event.getFormattedMessage().contains("req-saga-3")
                        && event.getFormattedMessage().contains("bị bỏ qua")));

        assertThat(count("SELECT count(*) FROM tickets")).isZero();
        assertThat(count("SELECT reserved FROM inventory WHERE ticket_type_id = ?", paidType)).isEqualTo(reserved);
        assertThat(count("SELECT sold FROM inventory WHERE ticket_type_id = ?", paidType)).isEqualTo(sold);
        assertThat(count("SELECT count(*) FROM outbox_events WHERE event_type = 'RegistrationConfirmed'")).isZero();
    }

    @Test
    void paymentFailedNhaChotVaDongDauFailed() {
        String reservationId = reserveHeld("saga-fail");
        jdbc.update("DELETE FROM outbox_events");

        TestMessages.published(rabbit, TopologyConfig.PAYMENT_EXCHANGE, "payment.failed.v1",
                "PaymentFailed", UUID.randomUUID(),
                paymentPayload(reservationId, "failure_reason", "CARD_DECLINED"), "req-saga-4");
        Await.until("reservation RELEASED", () -> "RELEASED".equals(jdbc.queryForObject(
                "SELECT status FROM reservations WHERE id = ?", String.class, UUID.fromString(reservationId))));

        assertThat(jdbc.queryForObject("SELECT payment_status FROM reservations WHERE id = ?",
                String.class, UUID.fromString(reservationId))).isEqualTo("FAILED");
        assertThat(count("SELECT reserved FROM inventory WHERE ticket_type_id = ?", paidType)).isZero();
        assertThat(count("SELECT count(*) FROM outbox_events WHERE event_type = 'ReservationReleased' "
                + "AND payload->>'reason' = 'PAYMENT_FAILED'")).isEqualTo(1);
    }

    @Test
    void payloadThieuReservationIdXuongDlqSauBaLanThu() {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("payment_id", UUID.randomUUID().toString());
        payload.put("event_id", eventId.toString());
        payload.put("amount", "300000.00");
        payload.put("currency", "VND");
        TestMessages.published(rabbit, TopologyConfig.PAYMENT_EXCHANGE, "payment.succeeded.v1",
                "PaymentSucceeded", UUID.randomUUID(), payload, "req-saga-5");

        Await.until("message vào DLQ saga",
                () -> admin.getQueueInfo(TopologyConfig.SAGA_QUEUE + ".dlq").getMessageCount() == 1);
        assertThat(count("SELECT count(*) FROM processed_messages")).isZero();
    }
}
