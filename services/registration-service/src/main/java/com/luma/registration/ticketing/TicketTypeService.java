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
import java.util.ArrayList;
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

    private record CurrentRow(int capacity, int sold, int reserved) {
    }

    /**
     * 1.4 — sửa loại vé theo từng field; field null giữ nguyên. `capacity` CHỈ được tăng (BR-INV-06):
     * CHECK `sold + reserved <= capacity` của inventory luôn đúng, nên mọi mức thấp hơn mức hiện tại
     * tất yếu thấp hơn `sold + reserved` — một nhánh 409 bao cả hai cách diễn đạt của catalog.
     */
    public void patch(UUID ticketTypeId, PatchTicketTypeRequest req, String userId) {
        List<TicketTypeTarget> targets = jdbc.query("""
                SELECT event_id, sales_start, sales_end FROM ticket_types WHERE id = ?""",
                (rs, n) -> new TicketTypeTarget((UUID) rs.getObject("event_id"),
                        utc(rs, "sales_start"), utc(rs, "sales_end")),
                ticketTypeId);
        if (targets.isEmpty()) {
            throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Không tìm thấy tài nguyên.");
        }
        UUID eventId = targets.getFirst().eventId();
        List<String> orgIds = jdbc.query(
                "SELECT organization_id::text FROM event_snapshot WHERE event_id = ?",
                (rs, n) -> rs.getString(1), eventId);
        if (orgIds.isEmpty()) {
            throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Không tìm thấy tài nguyên.");
        }
        authorization.requireEventPermission(userId, orgIds.getFirst(), eventId.toString(), "event.update");

        // Ghép field mới vào field cũ rồi mới kiểm tra cửa bán: bảng có CHECK sales_end > sales_start.
        OffsetDateTime salesStart = req.salesStart() != null ? req.salesStart() : targets.getFirst().salesStart();
        OffsetDateTime salesEnd = req.salesEnd() != null ? req.salesEnd() : targets.getFirst().salesEnd();
        if (!salesEnd.isAfter(salesStart)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_FAILED",
                    "sales_end phải sau sales_start.");
        }

        tx.executeWithoutResult(status -> {
            List<CurrentRow> current = jdbc.query("""
                    SELECT t.capacity, i.sold, i.reserved
                    FROM ticket_types t JOIN inventory i ON i.ticket_type_id = t.id
                    WHERE t.id = ? FOR UPDATE OF i""",
                    (rs, n) -> new CurrentRow(rs.getInt("capacity"), rs.getInt("sold"), rs.getInt("reserved")),
                    ticketTypeId);
            if (current.isEmpty()) {
                throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Không tìm thấy tài nguyên.");
            }
            if (req.capacity() != null && req.capacity() < current.getFirst().capacity()) {
                throw new ApiException(HttpStatus.CONFLICT, "CONFLICT",
                        "Capacity chỉ được tăng (hiện tại " + current.getFirst().capacity()
                                + ", đã bán + đang giữ " + (current.getFirst().sold() + current.getFirst().reserved()) + ").");
            }

            List<String> sets = new ArrayList<>();
            List<Object> args = new ArrayList<>();
            if (req.price() != null) {
                sets.add("price = ?");
                args.add(new BigDecimal(req.price()));
            }
            if (req.status() != null) {
                sets.add("status = ?");
                args.add(req.status());
            }
            if (req.salesStart() != null) {
                sets.add("sales_start = ?");
                args.add(Timestamp.from(req.salesStart().toInstant()));
            }
            if (req.salesEnd() != null) {
                sets.add("sales_end = ?");
                args.add(Timestamp.from(req.salesEnd().toInstant()));
            }
            if (req.capacity() != null) {
                sets.add("capacity = ?");
                args.add(req.capacity());
            }
            if (!sets.isEmpty()) {
                args.add(ticketTypeId);
                jdbc.update("UPDATE ticket_types SET " + String.join(", ", sets) + " WHERE id = ?", args.toArray());
            }
            if (req.capacity() != null) {
                jdbc.update("""
                        UPDATE inventory SET capacity = ?, version = version + 1, updated_at = now()
                        WHERE ticket_type_id = ?""", req.capacity(), ticketTypeId);
            }
        });
    }

    private record TicketTypeTarget(UUID eventId, OffsetDateTime salesStart, OffsetDateTime salesEnd) {
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
