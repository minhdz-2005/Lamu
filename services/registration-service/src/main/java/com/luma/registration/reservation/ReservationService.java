package com.luma.registration.reservation;

import com.luma.registration.common.web.ApiException;
import com.luma.registration.outbox.OutboxWriter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class ReservationService {

    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    private final OutboxWriter outbox;
    private final TicketCodeGenerator codes;
    private final long holdTtlSeconds;

    public ReservationService(JdbcTemplate jdbc, TransactionTemplate tx, OutboxWriter outbox,
                              TicketCodeGenerator codes,
                              @Value("${app.reservation.hold-ttl-seconds}") long holdTtlSeconds) {
        this.jdbc = jdbc;
        this.tx = tx;
        this.outbox = outbox;
        this.codes = codes;
        this.holdTtlSeconds = holdTtlSeconds;
    }

    public record ItemInput(String ticketTypeId, int quantity) {
    }

    public record Command(String userId, String recipientEmail, UUID eventId,
                          List<ItemInput> items, String idempotencyKey) {
    }

    public record HeldResponse(String reservationId, String status, OffsetDateTime expiresAt,
                               String totalAmount, String currency) {
    }

    public record IssuedTicket(String ticketId, String code, String ticketTypeName, String status) {
    }

    public record FreeResponse(String registrationId, List<IssuedTicket> tickets) {
    }

    private record ExistingReservation(UUID id, UUID eventId, String userId, String status, Instant expiresAt) {
    }

    private record LockedType(UUID id, UUID eventId, String name, BigDecimal price, String currency,
                              String status, Instant salesStart, Instant salesEnd,
                              int capacity, int sold, int reserved) {
    }

    private record Snapshot(UUID organizationId, String title, String status, Instant startsAt) {
    }

    public Object reserve(Command cmd) {
        if (cmd.items().stream().map(ItemInput::ticketTypeId).distinct().count() != cmd.items().size()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_FAILED",
                    "Giỏ vé không được trùng loại vé.");
        }
        try {
            Object result = tx.execute(status -> doReserve(cmd));
            if (result != null) {
                return result;
            }
            throw new IllegalStateException("reserve không trả kết quả");
        } catch (DuplicateKeyException race) {
            // Hai request cùng Idempotency-Key chạy song song: bên thua đọc lại kết quả đã commit.
            Object replay = tx.execute(status -> findByKey(cmd));
            if (replay != null) {
                return replay;
            }
            throw race;
        }
    }

    private Object doReserve(Command cmd) {
        List<ExistingReservation> found = jdbc.query(
                "SELECT id, event_id, user_id, status, expires_at FROM reservations WHERE idempotency_key = ?",
                (rs, n) -> new ExistingReservation((UUID) rs.getObject("id"), (UUID) rs.getObject("event_id"),
                        rs.getString("user_id"), rs.getString("status"),
                        rs.getTimestamp("expires_at") == null ? null : rs.getTimestamp("expires_at").toInstant()),
                cmd.idempotencyKey());
        if (!found.isEmpty()) {
            ExistingReservation existing = found.getFirst();
            if (!existing.eventId().equals(cmd.eventId()) || !existing.userId().equals(cmd.userId())
                    || !sameBasket(existing.id(), cmd.items())) {
                throw new ApiException(HttpStatus.CONFLICT, "CONFLICT",
                        "Idempotency-Key đã được dùng cho nội dung khác.");
            }
            return buildResponse(existing);
        }

        List<UUID> typeIds = cmd.items().stream().map(i -> parseTypeId(i.ticketTypeId())).toList();
        Map<String, Object> byId = lockTypes(typeIds);

        List<Snapshot> snapshots = jdbc.query(
                "SELECT organization_id, title, status, starts_at FROM event_snapshot WHERE event_id = ?",
                (rs, n) -> new Snapshot((UUID) rs.getObject("organization_id"), rs.getString("title"),
                        rs.getString("status"), rs.getTimestamp("starts_at").toInstant()),
                cmd.eventId());
        if (snapshots.isEmpty()) {
            throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Không tìm thấy tài nguyên.");
        }
        Snapshot snapshot = snapshots.getFirst();
        if (!"PUBLISHED".equals(snapshot.status())) {
            throw new ApiException(HttpStatus.CONFLICT, "SALES_CLOSED", "Event chưa mở bán.");
        }

        Instant now = Instant.now();
        BigDecimal total = BigDecimal.ZERO;
        List<LockedType> types = new ArrayList<>();
        List<Integer> quantities = new ArrayList<>();
        for (ItemInput item : cmd.items()) {
            LockedType type = (LockedType) byId.get(item.ticketTypeId());
            if (!type.eventId().equals(cmd.eventId())) {
                throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Loại vé không thuộc event này.");
            }
            if (!"ACTIVE".equals(type.status()) || now.isBefore(type.salesStart()) || !now.isBefore(type.salesEnd())) {
                throw new ApiException(HttpStatus.CONFLICT, "SALES_CLOSED",
                        "Loại vé '" + type.name() + "' đang ngoài cửa bán.");
            }
            if (item.quantity() > type.capacity() - type.sold() - type.reserved()) {
                // BR-INV-02: một loại không đủ chỗ là toàn bộ request fail, không bán một phần.
                throw new ApiException(HttpStatus.CONFLICT, "SOLD_OUT", "Không còn đủ chỗ cho giỏ vé.");
            }
            types.add(type);
            quantities.add(item.quantity());
            total = total.add(type.price().multiply(BigDecimal.valueOf(item.quantity())));
        }

        boolean free = total.signum() == 0;
        UUID reservationId = UUID.randomUUID();
        Instant expiresAt = free ? null : now.plusSeconds(holdTtlSeconds);
        jdbc.update("""
                INSERT INTO reservations (id, user_id, recipient_email, event_id, status, payment_status, expires_at, idempotency_key)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                reservationId, UUID.fromString(cmd.userId()), cmd.recipientEmail(), cmd.eventId(),
                free ? "CONFIRMED" : "HELD", free ? null : "PENDING",
                expiresAt == null ? null : Timestamp.from(expiresAt), cmd.idempotencyKey());
        for (int i = 0; i < types.size(); i++) {
            jdbc.update("""
                    INSERT INTO reservation_items (id, reservation_id, ticket_type_id, quantity, unit_price)
                    VALUES (?, ?, ?, ?, ?)""",
                    UUID.randomUUID(), reservationId, types.get(i).id(), quantities.get(i), types.get(i).price());
            jdbc.update("""
                    UPDATE inventory SET sold = sold + ?, reserved = reserved + ?,
                                          version = version + 1, updated_at = now()
                    WHERE ticket_type_id = ?""",
                    free ? quantities.get(i) : 0, free ? 0 : quantities.get(i), types.get(i).id());
        }

        if (free) {
            return confirmFree(reservationId, cmd, types, quantities, total, snapshot);
        }
        outbox.enqueue(reservationId, "ReservationCreated", map(
                "reservation_id", reservationId.toString(),
                "event_id", cmd.eventId().toString(),
                "organization_id", snapshot.organizationId() == null ? null : snapshot.organizationId().toString(),
                "user_id", cmd.userId(),
                "total_amount", decimal(total),
                "currency", types.getFirst().currency(),
                "expires_at", rfc3339(expiresAt)));
        return new HeldResponse(reservationId.toString(), "HELD",
                OffsetDateTime.ofInstant(expiresAt, ZoneOffset.UTC), decimal(total), types.getFirst().currency());
    }

    /** Nhánh miễn phí (quyết định 2, BR-INV-07): registration + vé + outbox trong cùng transaction giữ chỗ. */
    private FreeResponse confirmFree(UUID reservationId, Command cmd, List<LockedType> types,
                                     List<Integer> quantities, BigDecimal total, Snapshot snapshot) {
        Issued issued = issueTickets(reservationId, UUID.fromString(cmd.userId()), types, quantities);
        return enqueueConfirmation(reservationId, cmd.eventId(), cmd.recipientEmail(), snapshot, total, issued);
    }

    private record Issued(UUID registrationId, List<IssuedTicket> tickets) {
    }

    /** registration + một vé cho từng suất trong giỏ, dùng cho cả nhánh miễn phí lẫn confirm qua saga. */
    private Issued issueTickets(UUID reservationId, UUID userId, List<LockedType> types, List<Integer> quantities) {
        UUID registrationId = UUID.randomUUID();
        jdbc.update("INSERT INTO registrations (id, reservation_id, user_id, status) VALUES (?, ?, ?, 'CONFIRMED')",
                registrationId, reservationId, userId);
        List<IssuedTicket> tickets = new ArrayList<>();
        for (int i = 0; i < types.size(); i++) {
            for (int q = 0; q < quantities.get(i); q++) {
                UUID ticketId = UUID.randomUUID();
                String code = insertTicketWithCode(ticketId, registrationId, types.get(i).id());
                tickets.add(new IssuedTicket(ticketId.toString(), code, types.get(i).name(), "ISSUED"));
            }
        }
        return new Issued(registrationId, tickets);
    }

    /**
     * Payload của hai event Notification đọc (BR-RSV-06): email lấy từ cột đã lưu, tên sự kiện và
     * thời điểm bắt đầu lấy từ projection `event_snapshot` — không gọi REST sang Event.
     */
    private FreeResponse enqueueConfirmation(UUID reservationId, UUID eventId, String recipientEmail,
                                             Snapshot snapshot, BigDecimal total, Issued issued) {
        UUID registrationId = issued.registrationId();
        List<IssuedTicket> tickets = issued.tickets();
        outbox.enqueue(registrationId, "RegistrationConfirmed", map(
                "registration_id", registrationId.toString(),
                "reservation_id", reservationId.toString(),
                "event_id", eventId.toString(),
                "recipient_email", recipientEmail,
                "event_title", snapshot.title(),
                "event_starts_at", rfc3339(snapshot.startsAt()),
                "total_amount", decimal(total)));
        for (IssuedTicket ticket : tickets) {
            outbox.enqueue(UUID.fromString(ticket.ticketId()), "TicketIssued", map(
                    "ticket_id", ticket.ticketId(),
                    "code", ticket.code(),
                    "registration_id", registrationId.toString(),
                    "event_id", eventId.toString(),
                    "ticket_type_name", ticket.ticketTypeName(),
                    "recipient_email", recipientEmail,
                    "event_title", snapshot.title(),
                    "event_starts_at", rfc3339(snapshot.startsAt())));
        }
        return new FreeResponse(registrationId.toString(), tickets);
    }

    /** Va chạm UNIQUE code → sinh lại TRONG cùng transaction nhờ savepoint (BR-TCK-01), không bao giờ 500. */
    private String insertTicketWithCode(UUID ticketId, UUID registrationId, UUID ticketTypeId) {
        for (int attempt = 1; ; attempt++) {
            String code = codes.generate();
            try {
                jdbc.execute("SAVEPOINT ticket_code");
                jdbc.update("INSERT INTO tickets (id, registration_id, ticket_type_id, code) VALUES (?, ?, ?, ?)",
                        ticketId, registrationId, ticketTypeId, code);
                jdbc.execute("RELEASE SAVEPOINT ticket_code");
                return code;
            } catch (DuplicateKeyException e) {
                jdbc.execute("ROLLBACK TO SAVEPOINT ticket_code");
                if (attempt >= 5) {
                    throw new ApiException(HttpStatus.BAD_GATEWAY, "CONFLICT", "Không sinh được mã vé, thử lại sau.");
                }
            }
        }
    }

    private Map<String, Object> lockTypes(List<UUID> typeIds) {
        String placeholders = typeIds.stream().map(id -> "?").collect(Collectors.joining(", "));
        List<LockedType> rows = jdbc.query("""
                SELECT t.id, t.event_id, t.name, t.price, t.currency, t.status,
                       t.sales_start, t.sales_end, i.capacity, i.sold, i.reserved
                FROM ticket_types t JOIN inventory i ON i.ticket_type_id = t.id
                WHERE t.id IN (""" + placeholders + ") ORDER BY t.id FOR UPDATE OF i",
                (rs, n) -> new LockedType((UUID) rs.getObject("id"), (UUID) rs.getObject("event_id"),
                        rs.getString("name"), rs.getBigDecimal("price"), rs.getString("currency"),
                        rs.getString("status"), rs.getTimestamp("sales_start").toInstant(),
                        rs.getTimestamp("sales_end").toInstant(),
                        rs.getInt("capacity"), rs.getInt("sold"), rs.getInt("reserved")),
                typeIds.toArray());
        Map<String, Object> byId = new LinkedHashMap<>();
        UUID eventId = null;
        for (LockedType row : rows) {
            if (eventId == null) {
                eventId = row.eventId();
            } else if (!eventId.equals(row.eventId())) {
                throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Loại vé không thuộc event này.");
            }
            byId.put(row.id().toString(), row);
        }
        if (byId.size() != typeIds.size()) {
            throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Loại vé không tồn tại.");
        }
        return byId;
    }

    private boolean sameBasket(UUID reservationId, List<ItemInput> items) {
        Map<String, Integer> expected = items.stream().collect(
                Collectors.toMap(ItemInput::ticketTypeId, ItemInput::quantity, Integer::sum));
        Map<String, Integer> stored = new LinkedHashMap<>();
        jdbc.query("SELECT ticket_type_id, quantity FROM reservation_items WHERE reservation_id = ?",
                (rs, n) -> stored.put(rs.getString("ticket_type_id"), rs.getInt("quantity")), reservationId);
        return expected.equals(stored);
    }

    private Object findByKey(Command cmd) {
        List<ExistingReservation> found = jdbc.query(
                "SELECT id, event_id, user_id, status, expires_at FROM reservations WHERE idempotency_key = ?",
                (rs, n) -> new ExistingReservation((UUID) rs.getObject("id"), (UUID) rs.getObject("event_id"),
                        rs.getString("user_id"), rs.getString("status"),
                        rs.getTimestamp("expires_at") == null ? null : rs.getTimestamp("expires_at").toInstant()),
                cmd.idempotencyKey());
        if (found.isEmpty()) {
            return null;
        }
        ExistingReservation existing = found.getFirst();
        if (!existing.eventId().equals(cmd.eventId()) || !existing.userId().equals(cmd.userId())
                || !sameBasket(existing.id(), cmd.items())) {
            throw new ApiException(HttpStatus.CONFLICT, "CONFLICT", "Idempotency-Key đã được dùng cho nội dung khác.");
        }
        return buildResponse(existing);
    }

    /** Replay đúng kết quả đã trả lần đầu — không trừ chỗ lần hai (BR-INV-09). */
    private Object buildResponse(ExistingReservation existing) {
        List<Map<String, Object>> items = jdbc.queryForList(
                "SELECT quantity, unit_price FROM reservation_items WHERE reservation_id = ?", existing.id());
        BigDecimal total = BigDecimal.ZERO;
        for (Map<String, Object> item : items) {
            total = total.add(((BigDecimal) item.get("unit_price"))
                    .multiply(BigDecimal.valueOf(((Number) item.get("quantity")).intValue())));
        }
        String currency = jdbc.queryForObject(
                "SELECT t.currency FROM reservation_items ri JOIN ticket_types t ON t.id = ri.ticket_type_id "
                        + "WHERE ri.reservation_id = ? LIMIT 1", String.class, existing.id());
        if ("CONFIRMED".equals(existing.status())) {
            UUID registrationId = jdbc.queryForObject("SELECT id FROM registrations WHERE reservation_id = ?",
                    UUID.class, existing.id());
            List<IssuedTicket> tickets = jdbc.queryForList("""
                    SELECT tc.id, tc.code, tc.status, t.name
                    FROM tickets tc JOIN ticket_types t ON t.id = tc.ticket_type_id
                    WHERE tc.registration_id = ? ORDER BY tc.id""", registrationId)
                    .stream()
                    .map(row -> new IssuedTicket(row.get("id").toString(), (String) row.get("code"),
                            (String) row.get("name"), (String) row.get("status")))
                    .toList();
            return new FreeResponse(registrationId.toString(), tickets);
        }
        return new HeldResponse(existing.id().toString(), existing.status(),
                existing.expiresAt() == null ? null : OffsetDateTime.ofInstant(existing.expiresAt(), ZoneOffset.UTC),
                decimal(total), currency);
    }

    private static UUID parseTypeId(String raw) {
        try {
            return UUID.fromString(raw);
        } catch (IllegalArgumentException e) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_FAILED", "ticket_type_id không hợp lệ.");
        }
    }

    private static String decimal(BigDecimal value) {
        return value.setScale(2, java.math.RoundingMode.UNNECESSARY).toPlainString();
    }

    private static String rfc3339(Instant instant) {
        return DateTimeFormatter.ISO_INSTANT.format(instant);
    }

    private static Map<String, Object> map(Object... kv) {
        Map<String, Object> result = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) {
            result.put((String) kv[i], kv[i + 1]);
        }
        return result;
    }

    public record ItemView(String ticketTypeId, String ticketTypeName, int quantity, String unitPrice) {
    }

    public record ReservationView(String status, OffsetDateTime expiresAt, List<ItemView> items,
                                  String totalAmount, String paymentStatus) {
    }

    /** GET /reservations/{id} — self-only (catalog §3). */
    public ReservationView get(UUID reservationId, String userId) {
        List<ExistingReservation> found = jdbc.query(
                "SELECT id, event_id, user_id, status, expires_at FROM reservations WHERE id = ?",
                (rs, n) -> new ExistingReservation((UUID) rs.getObject("id"), (UUID) rs.getObject("event_id"),
                        rs.getString("user_id"), rs.getString("status"),
                        rs.getTimestamp("expires_at") == null ? null : rs.getTimestamp("expires_at").toInstant()),
                reservationId);
        if (found.isEmpty()) {
            throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Không tìm thấy tài nguyên.");
        }
        ExistingReservation reservation = found.getFirst();
        if (!reservation.userId().equals(userId)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN", "Tài khoản không được phép thực hiện yêu cầu này.");
        }
        List<ItemView> items = jdbc.query("""
                SELECT ri.ticket_type_id, t.name, ri.quantity, ri.unit_price::text AS unit_price
                FROM reservation_items ri JOIN ticket_types t ON t.id = ri.ticket_type_id
                WHERE ri.reservation_id = ? ORDER BY ri.id""",
                (rs, n) -> new ItemView(rs.getString("ticket_type_id"), rs.getString("name"),
                        rs.getInt("quantity"), rs.getString("unit_price")),
                reservationId);
        BigDecimal total = BigDecimal.ZERO;
        for (ItemView item : items) {
            total = total.add(new BigDecimal(item.unitPrice()).multiply(BigDecimal.valueOf(item.quantity())));
        }
        String paymentStatus = jdbc.queryForObject("SELECT payment_status FROM reservations WHERE id = ?",
                String.class, reservationId);
        return new ReservationView(reservation.status(),
                reservation.expiresAt() == null ? null : OffsetDateTime.ofInstant(reservation.expiresAt(), ZoneOffset.UTC),
                items, decimal(total), paymentStatus);
    }

    /**
     * DELETE /reservations/{id} — chỉ HELD mới hủy được (BR-TCK-05). Repeat DELETE rơi vào nhánh
     * "không còn HELD" → 409, số dư không đổi lần hai.
     */
    public Map<String, String> release(UUID reservationId, String userId) {
        return tx.execute(status -> {
            ExistingReservation reservation = lockReservation(reservationId);
            if (reservation == null) {
                throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Không tìm thấy tài nguyên.");
            }
            if (!reservation.userId().equals(userId)) {
                throw new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN",
                        "Tài khoản không được phép thực hiện yêu cầu này.");
            }
            requireHeld(reservation);
            releaseLocked(reservation, "CANCELLED", null);
            return Map.of("status", "RELEASED");
        });
    }

    private static void requireHeld(ExistingReservation reservation) {
        if (!"HELD".equals(reservation.status())) {
            throw new ApiException(HttpStatus.CONFLICT, "CONFLICT",
                    "Reservation không còn ở trạng thái HELD để hủy.");
        }
    }

    private ExistingReservation lockReservation(UUID reservationId) {
        List<ExistingReservation> found = jdbc.query(
                "SELECT id, event_id, user_id, status, expires_at FROM reservations WHERE id = ? FOR UPDATE",
                (rs, n) -> new ExistingReservation((UUID) rs.getObject("id"), (UUID) rs.getObject("event_id"),
                        rs.getString("user_id"), rs.getString("status"),
                        rs.getTimestamp("expires_at") == null ? null : rs.getTimestamp("expires_at").toInstant()),
                reservationId);
        return found.isEmpty() ? null : found.getFirst();
    }

    /**
     * Phần bù trừ của saga: nhả `reserved` về đúng số đã giữ và ghi `ReservationReleased` cùng transaction.
     * Caller phải đang ở trong transaction và đã khóa hàng `reservations` (BR-ASY-01).
     */
    private void releaseLocked(ExistingReservation reservation, String reason, String paymentStatus) {
        UUID reservationId = reservation.id();
        List<ItemInput> items = jdbc.query(
                "SELECT ticket_type_id, quantity FROM reservation_items WHERE reservation_id = ? ORDER BY ticket_type_id",
                (rs, n) -> new ItemInput(rs.getString("ticket_type_id"), rs.getInt("quantity")), reservationId);
        // Cùng thứ tự lock (inventory theo id) như nhánh giữ chỗ để tránh deadlock.
        lockTypes(items.stream().map(i -> UUID.fromString(i.ticketTypeId())).toList());
        for (ItemInput item : items) {
            jdbc.update("""
                    UPDATE inventory SET reserved = reserved - ?, version = version + 1, updated_at = now()
                    WHERE ticket_type_id = ?""",
                    item.quantity(), UUID.fromString(item.ticketTypeId()));
        }
        jdbc.update("UPDATE reservations SET status = 'RELEASED', payment_status = COALESCE(?, payment_status) "
                + "WHERE id = ?", paymentStatus, reservationId);
        Snapshot snapshot = loadSnapshot(reservation.eventId());
        outbox.enqueue(reservationId, "ReservationReleased", map(
                "reservation_id", reservationId.toString(),
                "event_id", reservation.eventId().toString(),
                "recipient_email", jdbc.queryForObject(
                        "SELECT recipient_email FROM reservations WHERE id = ?", String.class, reservationId),
                "event_title", snapshot.title(),
                "event_starts_at", rfc3339(snapshot.startsAt()),
                "reason", reason));
    }

    /**
     * 3.5 — worker hết hạn. `FOR UPDATE SKIP LOCKED` để hai tiến trình cùng quét không bao giờ nhả
     * một chỗ hai lần (BR-RSV-04); chỗ đã bị tiến trình khác khóa thì bỏ qua, lần quét sau còn đó.
     */
    public List<String> expireOverdue(int limit) {
        return tx.execute(status -> {
            List<ExistingReservation> due = jdbc.query("""
                    SELECT id, event_id, user_id, status, expires_at FROM reservations
                    WHERE status = 'HELD' AND expires_at <= now() ORDER BY expires_at LIMIT ?
                    FOR UPDATE SKIP LOCKED""",
                    (rs, n) -> new ExistingReservation((UUID) rs.getObject("id"), (UUID) rs.getObject("event_id"),
                            rs.getString("user_id"), rs.getString("status"),
                            rs.getTimestamp("expires_at").toInstant()),
                    limit);
            for (ExistingReservation reservation : due) {
                releaseLocked(reservation, "EXPIRED", null);
            }
            return due.stream().map(r -> r.id().toString()).toList();
        });
    }

    /** 3.3 — EventCancelled nhả mọi chỗ HELD của event; trả về số reservation đã nhả. */
    public int releaseAllHeldForEvent(UUID eventId, String reason) {
        List<ExistingReservation> held = jdbc.query("""
                SELECT id, event_id, user_id, status, expires_at FROM reservations
                WHERE event_id = ? AND status = 'HELD' ORDER BY id FOR UPDATE""",
                (rs, n) -> new ExistingReservation((UUID) rs.getObject("id"), (UUID) rs.getObject("event_id"),
                        rs.getString("user_id"), rs.getString("status"),
                        rs.getTimestamp("expires_at") == null ? null : rs.getTimestamp("expires_at").toInstant()),
                eventId);
        for (ExistingReservation reservation : held) {
            releaseLocked(reservation, reason, null);
        }
        return held.size();
    }

    public record ConfirmResult(String outcome, FreeResponse issued) {
    }

    /** Consumer `PaymentFailed`: nhả chỗ và đóng dấu FAILED; trạng thái khác → không có việc gì làm. */
    public String failPayment(UUID reservationId) {
        return tx.execute(status -> {
            ExistingReservation reservation = lockReservation(reservationId);
            if (reservation == null) {
                return "NOT_FOUND";
            }
            if (!"HELD".equals(reservation.status())) {
                return "NOTHING_TO_CONFIRM";
            }
            releaseLocked(reservation, "PAYMENT_FAILED", "FAILED");
            return "RELEASED";
        });
    }

    /**
     * Use-case confirm dùng chung cho endpoint nội bộ và consumer `PaymentSucceeded` (BR-RSV-01).
     * Chỉ reservation còn `HELD` và chưa quá `expires_at` mới đổi `reserved` → `sold`; mọi trạng thái
     * khác trả outcome để caller tự quyết: REST → 409/403/404, consumer → ack + log request_id
     * (BR-RSV-02, messaging §9).
     */
    public ConfirmResult confirm(UUID reservationId, String userId) {
        return tx.execute(status -> doConfirm(reservationId, userId));
    }

    private ConfirmResult doConfirm(UUID reservationId, String userId) {
        ExistingReservation reservation = lockReservation(reservationId);
        if (reservation == null) {
            return new ConfirmResult("NOT_FOUND", null);
        }
        if (userId != null && !reservation.userId().equals(userId)) {
            return new ConfirmResult("FORBIDDEN", null);
        }
        boolean expired = reservation.expiresAt() != null && !Instant.now().isBefore(reservation.expiresAt());
        if (!"HELD".equals(reservation.status()) || expired) {
            return new ConfirmResult("NOTHING_TO_CONFIRM", null);
        }

        List<ItemInput> items = jdbc.query(
                "SELECT ticket_type_id, quantity FROM reservation_items WHERE reservation_id = ? ORDER BY ticket_type_id",
                (rs, n) -> new ItemInput(rs.getString("ticket_type_id"), rs.getInt("quantity")), reservationId);
        Map<String, Object> byId = lockTypes(items.stream().map(i -> UUID.fromString(i.ticketTypeId())).toList());
        List<LockedType> types = new ArrayList<>();
        List<Integer> quantities = new ArrayList<>();
        BigDecimal total = BigDecimal.ZERO;
        for (ItemInput item : items) {
            LockedType type = (LockedType) byId.get(item.ticketTypeId());
            types.add(type);
            quantities.add(item.quantity());
            total = total.add(type.price().multiply(BigDecimal.valueOf(item.quantity())));
            jdbc.update("""
                    UPDATE inventory SET sold = sold + ?, reserved = reserved - ?,
                                          version = version + 1, updated_at = now()
                    WHERE ticket_type_id = ?""",
                    item.quantity(), item.quantity(), type.id());
        }
        jdbc.update("UPDATE reservations SET status = 'CONFIRMED', payment_status = 'SUCCEEDED' WHERE id = ?",
                reservationId);
        String recipientEmail = jdbc.queryForObject("SELECT recipient_email FROM reservations WHERE id = ?",
                String.class, reservationId);
        Issued issued = issueTickets(reservationId, UUID.fromString(reservation.userId()), types, quantities);
        FreeResponse result = enqueueConfirmation(reservationId, reservation.eventId(), recipientEmail,
                loadSnapshot(reservation.eventId()), total, issued);
        return new ConfirmResult("CONFIRMED", result);
    }

    private Snapshot loadSnapshot(UUID eventId) {
        List<Snapshot> snapshots = jdbc.query(
                "SELECT organization_id, title, status, starts_at FROM event_snapshot WHERE event_id = ?",
                (rs, n) -> new Snapshot((UUID) rs.getObject("organization_id"), rs.getString("title"),
                        rs.getString("status"), rs.getTimestamp("starts_at").toInstant()),
                eventId);
        if (snapshots.isEmpty()) {
            throw new IllegalStateException("event_snapshot thiếu cho event " + eventId
                    + " — consumer phải upsert snapshot trước khi nhả chỗ");
        }
        return snapshots.getFirst();
    }
}
