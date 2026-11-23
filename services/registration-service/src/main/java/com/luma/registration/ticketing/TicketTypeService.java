package com.luma.registration.ticketing;

import com.luma.registration.common.identity.AuthorizationClient;
import com.luma.registration.common.web.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.sql.Timestamp;
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
}
