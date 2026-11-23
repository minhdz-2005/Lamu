package com.luma.registration.snapshot;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.luma.registration.common.messaging.Await;
import com.luma.registration.common.messaging.IdempotentConsumer;
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
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 3.3 — EventCancelled trên chính queue snapshot: nhả mọi HELD của event, VOIDED vé còn ISSUED, và một
 * `BookingCancelled` cho TỪNG registration (email từ cột, tên/giờ từ payload — BR-ASY-06).
 */
@SpringBootTest
class EventCancelledConsumerTest {

    private static final String USER_A = "aaaaaaa1-1111-1111-1111-111111111111";
    private static final String USER_B = "bbbbbbb1-1111-1111-1111-111111111111";
    private static final String USER_C = "ccccccc1-1111-1111-1111-111111111111";

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
    void chuanBiEventMoBan() {
        events.add(eventId);
        admin.purgeQueue(TopologyConfig.SNAPSHOT_QUEUE + ".dlq", true);
        TestData.insertSnapshot(jdbc, eventId, "PUBLISHED");
        paidType = TestData.insertTicketType(jdbc, eventId, "VIP", "150000.00", 100,
                Instant.now().minusSeconds(3600), Instant.now().plusSeconds(3600), "ACTIVE");
        logs = new ListAppender<>();
        logs.start();
        ((Logger) LoggerFactory.getLogger(IdempotentConsumer.class)).addAppender(logs);
        ((Logger) LoggerFactory.getLogger(EventSnapshotService.class)).addAppender(logs);
    }

    @AfterEach
    void donDevDb() {
        ((Logger) LoggerFactory.getLogger(IdempotentConsumer.class)).detachAppender(logs);
        ((Logger) LoggerFactory.getLogger(EventSnapshotService.class)).detachAppender(logs);
        TestData.deleteAll(jdbc, events);
        events.clear();
        jdbc.update("DELETE FROM processed_messages");
    }

    private String heldReservation(String user, String key) {
        MDC.put(RequestIdFilter.MDC_KEY, key);
        try {
            ReservationService.HeldResponse held = (ReservationService.HeldResponse) service.reserve(
                    new ReservationService.Command(user, user.substring(0, 8) + "@test.local", eventId,
                            List.of(new ReservationService.ItemInput(paidType.toString(), 1)), key));
            return held.reservationId();
        } finally {
            MDC.clear();
        }
    }

    private int count(String sql, Object... args) {
        Integer value = jdbc.queryForObject(sql, Integer.class, args);
        return value == null ? 0 : value;
    }

    private String text(String sql, Object... args) {
        return jdbc.queryForObject(sql, String.class, args);
    }

    private Map<String, Object> cancelledPayload() {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("event_id", eventId.toString());
        payload.put("organization_id", UUID.randomUUID().toString());
        payload.put("slug", "slug-huy-" + eventId);
        payload.put("title", "Event bị hủy");
        payload.put("status", "CANCELLED");
        payload.put("starts_at", Instant.now().plus(1, ChronoUnit.DAYS).toString());
        payload.put("ends_at", Instant.now().plus(2, ChronoUnit.DAYS).toString());
        payload.put("cancelled_reason", "Thời tiết xấu");
        return payload;
    }

    /**
     * Không đợi bằng marker: broker dev là hàng đợi chung nên test khác (hoặc context khác) có thể có
     * consumer cùng hàng đợi, thứ tự giao tin không còn là bằng chứng. Chờ đúng kết quả của message
     * này và đối chiếu log của service để chắc là consumer — không phải test — đã viết ra.
     */
    private void awaitBookingCancelled(int expected) {
        Await.until("outbox có " + expected + " BookingCancelled", () -> count(
                "SELECT count(*) FROM outbox_events WHERE event_type = 'BookingCancelled'") == expected);
    }

    private long countLog(String needle) {
        return logs.list.stream().filter(event -> event.getFormattedMessage().contains(needle)).count();
    }

    @Test
    void huyEventNhaChotHuDaiVoidedVeVaHaiBookingCancelled() {
        String heldId = heldReservation(USER_A, "cx-held");
        String buyerA = heldReservation(USER_B, "cx-a");
        String buyerB = heldReservation(USER_C, "cx-b");
        assertThat(service.confirm(UUID.fromString(buyerA), null).outcome()).isEqualTo("CONFIRMED");
        assertThat(service.confirm(UUID.fromString(buyerB), null).outcome()).isEqualTo("CONFIRMED");
        assertThat(count("SELECT reserved FROM inventory WHERE ticket_type_id = ?", paidType)).isEqualTo(1);
        assertThat(count("SELECT sold FROM inventory WHERE ticket_type_id = ?", paidType)).isEqualTo(2);
        jdbc.update("DELETE FROM outbox_events");

        TestMessages.published(rabbit, TopologyConfig.EVENT_EXCHANGE, "event.cancelled.v1",
                "EventCancelled", eventId, cancelledPayload(), "req-cancel-1");
        awaitBookingCancelled(2);

        assertThat(countLog("EventCancelled event=" + eventId))
                .as("chính consumer xử lý tin, không phải code của test").isEqualTo(1);
        assertThat(count("SELECT count(*) FROM outbox_events WHERE event_type = 'ReservationReleased' "
                + "AND payload->>'reason' = 'EVENT_CANCELLED'")).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM tickets WHERE status = 'VOIDED' AND registration_id IN "
                + "(SELECT id FROM registrations WHERE reservation_id IN (?, ?))",
                UUID.fromString(buyerA), UUID.fromString(buyerB))).isEqualTo(2);
        assertThat(text("SELECT status FROM reservations WHERE id = ?", UUID.fromString(heldId)))
                .isEqualTo("RELEASED");
        assertThat(count("SELECT reserved FROM inventory WHERE ticket_type_id = ?", paidType)).isZero();
        assertThat(count("SELECT sold FROM inventory WHERE ticket_type_id = ?", paidType))
                .as("vé đã bán không bị trừ lại sold").isEqualTo(2);
        assertThat(count("SELECT count(*) FROM event_snapshot WHERE event_id = ? AND status = 'CANCELLED'", eventId))
                .isEqualTo(1);
    }

    @Test
    void payloadBookingCancelledMangEmailCuaChuVeVaLyDoHuy() {
        String buyer = heldReservation(USER_A, "cx-mail");
        assertThat(service.confirm(UUID.fromString(buyer), null).outcome()).isEqualTo("CONFIRMED");
        jdbc.update("DELETE FROM outbox_events");

        TestMessages.published(rabbit, TopologyConfig.EVENT_EXCHANGE, "event.cancelled.v1",
                "EventCancelled", eventId, cancelledPayload(), "req-cancel-2");
        awaitBookingCancelled(1);

        String payload = jdbc.queryForObject(
                "SELECT payload::text FROM outbox_events WHERE event_type = 'BookingCancelled'", String.class);
        assertThat(payload).contains("aaaaaaa1@test.local")
                .contains("Event bị hủy").contains("Thời tiết xấu");
    }

    @Test
    void cungMessageIdKhongNhaChotLanHai() {
        String buyer = heldReservation(USER_A, "cx-dup");
        assertThat(service.confirm(UUID.fromString(buyer), null).outcome()).isEqualTo("CONFIRMED");
        jdbc.update("DELETE FROM outbox_events");

        Map<String, Object> payload = cancelledPayload();
        String messageId = TestMessages.published(rabbit, TopologyConfig.EVENT_EXCHANGE, "event.cancelled.v1",
                "EventCancelled", eventId, payload, "req-cancel-3");
        awaitBookingCancelled(1);

        // Cùng message_id nhưng body hợp lệ: chặn trùng phải đến từ header, không phải từ JSON hỏng.
        TestMessages.publishRaw(rabbit, TopologyConfig.EVENT_EXCHANGE, "event.cancelled.v1",
                TestMessages.envelope(messageId, "EventCancelled", eventId, payload), messageId, "req-cancel-3b");
        Await.until("consumer nhận ra message_id đã tiêu",
                () -> countLog(messageId + " đã tiêu trước đó") == 1);

        assertThat(count("SELECT count(*) FROM outbox_events WHERE event_type = 'BookingCancelled'"))
                .as("message_id trùng => bỏ qua, không email lần hai").isEqualTo(1);
        assertThat(count("SELECT count(*) FROM processed_messages WHERE message_id = ?",
                UUID.fromString(messageId))).isEqualTo(1);
    }
}
