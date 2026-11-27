package com.luma.registration.ticketing;

import com.luma.registration.common.identity.AuthorizationClient;
import com.luma.registration.common.web.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

@Service
public class TicketTypeService {

    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    private final AuthorizationClient authorization;

    public TicketTypeService(JdbcTemplate jdbc, TransactionTemplate tx, AuthorizationClient authorization) {
        this.jdbc = jdbc;
        this.tx = tx;
        this.authorization = authorization;
    }

    private record SnapshotRow(String organizationId, String status) {
    }

    public UUID create(UUID eventId, CreateTicketTypeRequest req, String userId) {
        if (!req.salesEnd().isAfter(req.salesStart())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_FAILED",
                    "sales_end phải sau sales_start.");
        }
        List<SnapshotRow> rows = jdbc.query(
                "SELECT organization_id, status FROM event_snapshot WHERE event_id = ?",
                (rs, rowNum) -> new SnapshotRow(rs.getString("organization_id"), rs.getString("status")),
                eventId);
        if (rows.isEmpty() || !"PUBLISHED".equals(rows.getFirst().status())) {
            throw new ApiException(HttpStatus.CONFLICT, "CONFLICT",
                    "Event chưa publish, chưa tạo được loại vé.");
        }
        // Quyền hỏi Identity TRƯỚC khi mở transaction (BR-INV-03: không giữ connection khi gọi network).
        authorization.requireEventPermission(userId, rows.getFirst().organizationId(),
                eventId.toString(), "event.update");

        BigDecimal price = new BigDecimal(req.price());
        UUID ticketTypeId = UUID.randomUUID();
        tx.executeWithoutResult(status -> {
            jdbc.update("""
                    INSERT INTO ticket_types (id, event_id, name, price, currency, capacity, sales_start, sales_end)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                    ticketTypeId, eventId, req.name(), price, req.currency(), req.capacity(),
                    Timestamp.from(req.salesStart().toInstant()), Timestamp.from(req.salesEnd().toInstant()));
            jdbc.update("INSERT INTO inventory (ticket_type_id, capacity, sold, reserved) VALUES (?, ?, 0, 0)",
                    ticketTypeId, req.capacity());
        });
        return ticketTypeId;
    }

    public record TicketTypeView(UUID id, String name, String price, String currency, String status,
                                 OffsetDateTime salesStart, OffsetDateTime salesEnd) {
    }

    public record AvailabilityView(UUID ticketTypeId, String name, String price, String currency,
                                   int capacity, int sold, int reserved, int available, boolean salesOpen,
                                   OffsetDateTime salesStart, OffsetDateTime salesEnd, String status) {
    }

    /** Danh sách loại vé công khai: event chưa PUBLISHED coi như không tồn tại với công chúng (catalog §3). */
    public List<TicketTypeView> listPublished(UUID eventId) {
        requirePublishedForPublic(eventId);
        return jdbc.query("""
                SELECT id, name, price::text AS price, currency, status, sales_start, sales_end
                FROM ticket_types WHERE event_id = ? ORDER BY created_at, id""",
                (rs, n) -> new TicketTypeView(UUID.fromString(rs.getString("id")), rs.getString("name"),
                        rs.getString("price"), rs.getString("currency"), rs.getString("status"),
                        utc(rs, "sales_start"), utc(rs, "sales_end")),
                eventId);
    }

    /**
     * available = capacity - sold - reserved (BR-INV-08), tính trực tiếp từ inventory tại thời điểm gọi —
     * không cache nên mặc nhiên đáp "không quá 5 giây". sales_open theo BR-INV-05.
     */
    public List<AvailabilityView> availability(UUID eventId) {
        List<String> snapshotStatuses = jdbc.query(
                "SELECT status FROM event_snapshot WHERE event_id = ?", (rs, n) -> rs.getString("status"), eventId);
        if (snapshotStatuses.isEmpty()) {
            throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Không tìm thấy tài nguyên.");
        }
        if (!"PUBLISHED".equals(snapshotStatuses.getFirst())) {
            throw new ApiException(HttpStatus.CONFLICT, "SALES_CLOSED", "Event chưa mở bán.");
        }
        Instant now = Instant.now();
        return jdbc.query("""
                SELECT t.id, t.name, t.price::text AS price, t.currency, t.status,
                       t.sales_start, t.sales_end, i.capacity, i.sold, i.reserved
                FROM ticket_types t JOIN inventory i ON i.ticket_type_id = t.id
                WHERE t.event_id = ? ORDER BY t.created_at, t.id""",
                (rs, n) -> {
                    OffsetDateTime start = utc(rs, "sales_start");
                    OffsetDateTime end = utc(rs, "sales_end");
                    boolean open = "ACTIVE".equals(rs.getString("status"))
                            && !now.isBefore(start.toInstant()) && now.isBefore(end.toInstant());
                    return new AvailabilityView(UUID.fromString(rs.getString("id")), rs.getString("name"),
                            rs.getString("price"), rs.getString("currency"),
                            rs.getInt("capacity"), rs.getInt("sold"), rs.getInt("reserved"),
                            Math.max(0, rs.getInt("capacity") - rs.getInt("sold") - rs.getInt("reserved")),
                            open, start, end, rs.getString("status"));
                },
                eventId);
    }

    private void requirePublishedForPublic(UUID eventId) {
        List<String> statuses = jdbc.query(
                "SELECT status FROM event_snapshot WHERE event_id = ?", (rs, n) -> rs.getString("status"), eventId);
        if (statuses.isEmpty() || !"PUBLISHED".equals(statuses.getFirst())) {
            throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Không tìm thấy tài nguyên.");
        }
    }

    private static OffsetDateTime utc(java.sql.ResultSet rs, String column) throws java.sql.SQLException {
        return OffsetDateTime.ofInstant(rs.getTimestamp(column).toInstant(), ZoneOffset.UTC);
    }
}
