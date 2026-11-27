package com.luma.registration.reservation;

import org.springframework.jdbc.core.JdbcTemplate;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;

/** Helper chèn/xóa dữ liệu test trực tiếp qua DB — các test HTTP dùng chung, dọn theo event_id. */
public final class TestData {

    private TestData() {
    }

    public static String insertSnapshot(JdbcTemplate jdbc, UUID eventId, String status) {
        UUID orgId = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO event_snapshot (event_id, organization_id, title, slug, status, starts_at, ends_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)""",
                eventId, orgId, "Event test " + eventId, "event-" + eventId, status,
                Timestamp.from(Instant.now()), Timestamp.from(Instant.now().plusSeconds(7200)));
        return orgId.toString();
    }

    public static UUID insertTicketType(JdbcTemplate jdbc, UUID eventId, String name, String price, int capacity,
                                        Instant salesStart, Instant salesEnd, String status) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO ticket_types (id, event_id, name, price, currency, capacity, sales_start, sales_end, status)
                VALUES (?, ?, ?, ?, 'VND', ?, ?, ?, ?)""",
                id, eventId, name, new BigDecimal(price), capacity,
                Timestamp.from(salesStart), Timestamp.from(salesEnd), status);
        jdbc.update("INSERT INTO inventory (ticket_type_id, capacity, sold, reserved) VALUES (?, ?, 0, 0)",
                id, capacity);
        return id;
    }

    public static void insertOpenWindowTicket(JdbcTemplate jdbc, UUID eventId, String name, String price, int capacity) {
        insertTicketType(jdbc, eventId, name, price, capacity,
                Instant.now().minusSeconds(3600), Instant.now().plusSeconds(3600), "ACTIVE");
    }

    /** Xóa mọi row liên quan tới event (kể cả chain reservations đã confirm + outbox). */
    public static void deleteAll(JdbcTemplate jdbc, Iterable<UUID> eventIds) {
        for (UUID e : eventIds) {
            jdbc.update("DELETE FROM outbox_events WHERE aggregate_id IN (SELECT id FROM reservations WHERE event_id = ?)", e);
            jdbc.update("""
                    DELETE FROM outbox_events WHERE aggregate_id IN (
                        SELECT reg.id FROM registrations reg JOIN reservations res ON res.id = reg.reservation_id
                        WHERE res.event_id = ?)""", e);
            jdbc.update("""
                    DELETE FROM outbox_events WHERE aggregate_id IN (
                        SELECT tc.id FROM tickets tc
                        JOIN registrations reg ON reg.id = tc.registration_id
                        JOIN reservations res ON res.id = reg.reservation_id WHERE res.event_id = ?)""", e);
            jdbc.update("""
                    DELETE FROM tickets WHERE registration_id IN (
                        SELECT reg.id FROM registrations reg JOIN reservations res ON res.id = reg.reservation_id
                        WHERE res.event_id = ?)""", e);
            jdbc.update("""
                    DELETE FROM registrations WHERE reservation_id IN (
                        SELECT id FROM reservations WHERE event_id = ?)""", e);
            jdbc.update("DELETE FROM reservation_items WHERE reservation_id IN (SELECT id FROM reservations WHERE event_id = ?)", e);
            jdbc.update("DELETE FROM reservations WHERE event_id = ?", e);
            jdbc.update("DELETE FROM inventory WHERE ticket_type_id IN (SELECT id FROM ticket_types WHERE event_id = ?)", e);
            jdbc.update("DELETE FROM ticket_types WHERE event_id = ?", e);
            jdbc.update("DELETE FROM event_snapshot WHERE event_id = ?", e);
        }
    }

    public static void deleteDummyChain(JdbcTemplate jdbc, UUID reservationId, UUID registrationId, UUID ticketId) {
        jdbc.update("DELETE FROM tickets WHERE id = ?", ticketId);
        jdbc.update("DELETE FROM registrations WHERE id = ?", registrationId);
        jdbc.update("DELETE FROM reservations WHERE id = ?", reservationId);
    }
}
