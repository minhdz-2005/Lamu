package com.luma.registration.snapshot;

import com.fasterxml.jackson.databind.JsonNode;
import com.luma.registration.common.messaging.Envelope;
import com.luma.registration.common.messaging.IdempotentConsumer;
import com.luma.registration.outbox.OutboxWriter;
import com.luma.registration.reservation.ReservationService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.time.format.DateTimeParseException;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Projection `event_snapshot` (BR-ASY-05): ghi đè đúng những field payload mang, `organization_id`
 * chỉ đổi khi payload có nó — `EventUpdated` không mang nên giá trị cũ giữ nguyên. Mọi giá trị đọc
 * từ payload, không gọi REST sang Event (BR-ASY-06).
 */
@Service
public class EventSnapshotService {

    private static final Logger log = LoggerFactory.getLogger(EventSnapshotService.class);

    private final JdbcTemplate jdbc;
    private final OutboxWriter outbox;
    private final ReservationService reservations;

    public EventSnapshotService(JdbcTemplate jdbc, OutboxWriter outbox, ReservationService reservations) {
        this.jdbc = jdbc;
        this.outbox = outbox;
        this.reservations = reservations;
    }

    /** Gọi trong transaction chống trùng của consumer: hoặc ghi xong, hoặc ném để thử lại. */
    public IdempotentConsumer.Result apply(Envelope envelope) {
        JsonNode payload = envelope.payload();
        switch (envelope.eventType()) {
            case "EventPublished", "EventUpdated" -> {
                upsert(payload);
                return IdempotentConsumer.Result.PROCESSED;
            }
            case "EventCancelled" -> {
                upsert(payload);
                return cancel(payload);
            }
            default -> {
                log.warn("event_type '{}' không thuộc bảng routing của queue snapshot — ack, không xử lý",
                        envelope.eventType());
                return IdempotentConsumer.Result.SKIPPED;
            }
        }
    }

    private void upsert(JsonNode payload) {
        UUID eventId = requiredUuid(payload, "event_id");
        jdbc.update("""
                INSERT INTO event_snapshot (event_id, organization_id, title, slug, status, starts_at, ends_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, now())
                ON CONFLICT (event_id) DO UPDATE SET
                    organization_id = COALESCE(EXCLUDED.organization_id, event_snapshot.organization_id),
                    title             = COALESCE(EXCLUDED.title, event_snapshot.title),
                    slug              = COALESCE(EXCLUDED.slug, event_snapshot.slug),
                    status            = COALESCE(EXCLUDED.status, event_snapshot.status),
                    starts_at         = COALESCE(EXCLUDED.starts_at, event_snapshot.starts_at),
                    ends_at           = COALESCE(EXCLUDED.ends_at, event_snapshot.ends_at),
                    updated_at        = now()""",
                eventId, optionalUuid(payload, "organization_id"), text(payload, "title"), text(payload, "slug"),
                text(payload, "status"), instant(payload, "starts_at"), instant(payload, "ends_at"));
    }

    /**
     * 3.3: nhả mọi chỗ HELD (`ReservationReleased(EVENT_CANCELLED)`), VOIDED vé còn ISSUED, rồi
     * một `BookingCancelled` cho TỪNG registration vừa bị hủy để Notification gửi email.
     */
    private IdempotentConsumer.Result cancel(JsonNode payload) {
        UUID eventId = requiredUuid(payload, "event_id");
        int released = reservations.releaseAllHeldForEvent(eventId, "EVENT_CANCELLED");

        Set<UUID> voidedRegistrations = new LinkedHashSet<>(jdbc.query("""
                UPDATE tickets SET status = 'VOIDED'
                WHERE status = 'ISSUED' AND registration_id IN (SELECT id FROM registrations WHERE reservation_id IN
                      (SELECT id FROM reservations WHERE event_id = ?))
                RETURNING registration_id""", (rs, n) -> (UUID) rs.getObject(1), eventId));
        for (UUID registrationId : voidedRegistrations) {
            outbox.enqueue(registrationId, "BookingCancelled", map(
                    "registration_id", registrationId.toString(),
                    "event_id", eventId.toString(),
                    "recipient_email", jdbc.queryForObject("""
                            SELECT r.recipient_email FROM reservations r JOIN registrations g ON g.reservation_id = r.id
                            WHERE g.id = ?""", String.class, registrationId),
                    "event_title", text(payload, "title"),
                    "event_starts_at", text(payload, "starts_at"),
                    "cancelled_reason", text(payload, "cancelled_reason")));
        }
        log.info("EventCancelled event={}: nhả {} giữ chỗ HELD, VOIDED {} registration",
                eventId, released, voidedRegistrations.size());
        return IdempotentConsumer.Result.PROCESSED;
    }

    private static String text(JsonNode payload, String field) {
        String value = payload.path(field).asText(null);
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("payload " + field + " rỗng");
        }
        return value;
    }

    private static java.time.OffsetDateTime instant(JsonNode payload, String field) {
        String value = text(payload, field);
        try {
            return java.time.OffsetDateTime.parse(value);
        } catch (DateTimeParseException bad) {
            throw new IllegalArgumentException(field + " không phải RFC3339: " + value);
        }
    }

    private static UUID requiredUuid(JsonNode payload, String field) {
        String value = text(payload, field);
        try {
            return UUID.fromString(value);
        } catch (IllegalArgumentException bad) {
            throw new IllegalArgumentException(field + " không phải UUID: " + value);
        }
    }

    private static UUID optionalUuid(JsonNode payload, String field) {
        return payload.hasNonNull(field) ? requiredUuid(payload, field) : null;
    }

    private static Map<String, Object> map(Object... kv) {
        Map<String, Object> result = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) {
            result.put((String) kv[i], kv[i + 1]);
        }
        return result;
    }
}
