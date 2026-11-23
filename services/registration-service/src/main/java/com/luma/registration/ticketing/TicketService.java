package com.luma.registration.ticketing;

import com.luma.registration.common.identity.AuthorizationClient;
import com.luma.registration.common.web.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/**
 * Phần 4: ba đường vé — 4.1 "vé của tôi", 4.2 bảng vé cho bàn check-in, 4.3 check-in tại cửa.
 * `event_title`/`event_slug`/`event_starts_at`/`event_status` đọc từ `event_snapshot`, không gọi
 * REST sang Event (BR-ASY-06); quyền hỏi Identity ngoài transaction (BR-INV-03).
 */
@Service
public class TicketService {

    private static final List<String> STATUSES = List.of("ISSUED", "USED", "VOIDED");

    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    private final AuthorizationClient authorization;

    public TicketService(JdbcTemplate jdbc, TransactionTemplate tx, AuthorizationClient authorization) {
        this.jdbc = jdbc;
        this.tx = tx;
        this.authorization = authorization;
    }

    public record MyTicketView(UUID ticketId, String code, UUID eventId, String eventTitle, String eventSlug,
                               OffsetDateTime eventStartsAt, String eventStatus, String ticketTypeName,
                               String status, OffsetDateTime checkedInAt) {
    }

    /**
     * 4.1 — mảng thô 10 field (catalog §3). VOIDED vẫn trả (BR-TCK-04): chính API quyết định,
     * UI không tự loại. Sắp xếp theo ui/04 §2: `event_starts_at` tăng dần, event đã qua xuống cuối.
     */
    public List<MyTicketView> myTickets(String userId) {
        return jdbc.query("""
                SELECT k.id, k.code, res.event_id, es.title, es.slug, es.starts_at, es.status AS event_status,
                       t.name AS ticket_type_name, k.status, k.checked_in_at
                FROM tickets k
                JOIN registrations g ON g.id = k.registration_id
                JOIN reservations res ON res.id = g.reservation_id
                JOIN ticket_types t ON t.id = k.ticket_type_id
                JOIN event_snapshot es ON es.event_id = res.event_id
                WHERE g.user_id = ?
                ORDER BY (es.starts_at < now()), es.starts_at, k.code""",
                (rs, n) -> new MyTicketView((UUID) rs.getObject("id"), rs.getString("code"),
                        (UUID) rs.getObject("event_id"), rs.getString("title"), rs.getString("slug"),
                        utc(rs, "starts_at"), rs.getString("event_status"), rs.getString("ticket_type_name"),
                        rs.getString("status"), utc(rs, "checked_in_at")),
                UUID.fromString(requireUser(userId)));
    }

    public record BoardItem(UUID ticketId, String code, String ticketTypeName, String status,
                            OffsetDateTime checkedInAt) {
    }

    public record BoardPage(List<BoardItem> items, int total) {
    }

    /**
     * 4.2 — bảng vé của event cho nhân viên tại cửa. `total` đếm theo cùng bộ lọc `status` nên
     * `offset` vượt biên vẫn 200 với `items: []` (BR-FMT-17), không 400. Item không kèm tên/email
     * người mua (catalog §3) — chỉ bốn field được liệt kê.
     */
    public BoardPage eventTickets(UUID eventId, String status, Integer limit, Integer offset, String userId) {
        requireUser(userId);
        String orgId = snapshotOrg(eventId);
        authorization.requireEventPermission(userId, orgId, eventId.toString(), "event.read");

        String statusFilter = null;
        if (status != null && !status.isBlank()) {
            statusFilter = status.trim().toUpperCase(Locale.ROOT);
            if (!STATUSES.contains(statusFilter)) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_FAILED",
                        "status chỉ nhận ISSUED, USED hoặc VOIDED.");
            }
        }
        int size = limit == null ? 20 : limit;
        int from = offset == null ? 0 : offset;
        if (size < 1 || from < 0) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_FAILED",
                    "limit phải từ 1 trở lên, offset phải từ 0 trở lên.");
        }
        size = Math.min(size, 100);

        // Bộ lọc ghép chuỗi: text block tự cắt khoảng trắng cuối dòng nên dấu cách phải nằm ở literal.
        String filter = statusFilter == null ? "" : " AND k.status = ?";
        Object[] countArgs = statusFilter == null ? new Object[]{eventId} : new Object[]{eventId, statusFilter};
        Integer total = jdbc.queryForObject("""
                SELECT count(*)
                FROM tickets k
                JOIN registrations g ON g.id = k.registration_id
                JOIN reservations res ON res.id = g.reservation_id
                WHERE res.event_id = ?""" + filter, Integer.class, countArgs);

        Object[] pageArgs = statusFilter == null
                ? new Object[]{eventId, size, from}
                : new Object[]{eventId, statusFilter, size, from};
        List<BoardItem> items = jdbc.query("""
                SELECT k.id, k.code, t.name AS ticket_type_name, k.status, k.checked_in_at
                FROM tickets k
                JOIN registrations g ON g.id = k.registration_id
                JOIN reservations res ON res.id = g.reservation_id
                JOIN ticket_types t ON t.id = k.ticket_type_id
                WHERE res.event_id = ?""" + filter + " ORDER BY k.code LIMIT ? OFFSET ?",
                (rs, n) -> new BoardItem((UUID) rs.getObject("id"), rs.getString("code"),
                        rs.getString("ticket_type_name"), rs.getString("status"), utc(rs, "checked_in_at")),
                pageArgs);
        return new BoardPage(items, total == null ? 0 : total);
    }

    public record CheckInView(UUID ticketId, String status, OffsetDateTime checkedInAt, UUID eventId,
                              String eventTitle, String ticketTypeName) {
    }

    /**
     * 4.3 — check-in là POST không idempotent (plan §4): chặn lặp bằng trạng thái chứ không làm lại.
     * Đọc `FOR UPDATE` trong transaction để hai máy quét cùng một mã không cùng ra 200 (BR-TCK-03).
     */
    public CheckInView checkIn(String code, String userId) {
        requireUser(userId);
        String needle = code.trim().toUpperCase(Locale.ROOT);
        List<Located> found = jdbc.query("""
                SELECT k.id, res.event_id, es.organization_id::text AS organization_id
                FROM tickets k
                JOIN registrations g ON g.id = k.registration_id
                JOIN reservations res ON res.id = g.reservation_id
                LEFT JOIN event_snapshot es ON es.event_id = res.event_id
                WHERE UPPER(k.code) = ? ORDER BY k.code""",
                (rs, n) -> new Located((UUID) rs.getObject("id"), (UUID) rs.getObject("event_id"),
                        rs.getString("organization_id")),
                needle);
        if (found.isEmpty()) {
            throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Không tìm thấy tài nguyên.");
        }
        Located ticket = found.getFirst();
        authorization.requireEventPermission(userId, ticket.organizationId(), ticket.eventId().toString(),
                "ticket.checkin");

        return tx.execute(status -> {
            List<String> state = jdbc.queryForList(
                    "SELECT status FROM tickets WHERE id = ? FOR UPDATE", String.class, ticket.id());
            if (state.isEmpty()) {
                throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Không tìm thấy tài nguyên.");
            }
            String current = state.getFirst();
            if ("VOIDED".equals(current)) {
                throw new ApiException(HttpStatus.CONFLICT, "TICKET_VOIDED", "Vé đã bị hủy vì sự kiện bị hủy.");
            }
            if ("USED".equals(current)) {
                OffsetDateTime previous = jdbc.queryForObject(
                        "SELECT checked_in_at FROM tickets WHERE id = ?", OffsetDateTime.class, ticket.id());
                throw new ApiException(HttpStatus.CONFLICT, "ALREADY_CHECKED_IN",
                        "Mã vé đã được check-in lúc " + stamp(previous) + ".");
            }
            jdbc.update("UPDATE tickets SET status = 'USED', checked_in_at = now() WHERE id = ?", ticket.id());
            List<CheckInView> view = jdbc.query("""
                    SELECT k.id, k.checked_in_at, res.event_id, es.title, t.name AS ticket_type_name
                    FROM tickets k
                    JOIN registrations g ON g.id = k.registration_id
                    JOIN reservations res ON res.id = g.reservation_id
                    JOIN ticket_types t ON t.id = k.ticket_type_id
                    JOIN event_snapshot es ON es.event_id = res.event_id
                    WHERE k.id = ?""",
                    (rs, n) -> new CheckInView((UUID) rs.getObject("id"), "USED", utc(rs, "checked_in_at"),
                            (UUID) rs.getObject("event_id"), rs.getString("title"),
                            rs.getString("ticket_type_name")),
                    ticket.id());
            return view.getFirst();
        });
    }

    private record Located(UUID id, UUID eventId, String organizationId) {
    }

    private String snapshotOrg(UUID eventId) {
        List<String> orgs = jdbc.query("""
                SELECT es.organization_id::text FROM event_snapshot es WHERE es.event_id = ?""",
                (rs, n) -> rs.getString(1), eventId);
        if (orgs.isEmpty()) {
            throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Không tìm thấy tài nguyên.");
        }
        return orgs.getFirst();
    }

    /** Header danh tính do Gateway set; thiếu hoặc không phải UUID thì chưa có phiên hợp lệ (401). */
    private static String requireUser(String userId) {
        if (userId != null && !userId.isBlank()) {
            try {
                UUID.fromString(userId);
                return userId;
            } catch (IllegalArgumentException notAnAccount) {
                // rơi xuống 401
            }
        }
        throw new ApiException(HttpStatus.UNAUTHORIZED, "UNAUTHENTICATED", "Phiên hết hạn, đăng nhập lại.");
    }

    /** RFC3339 giây, đúng dạng ví dụ của catalog §3: "2026-12-01T11:04:00Z". */
    private static String stamp(OffsetDateTime value) {
        return DateTimeFormatter.ISO_INSTANT.format(value.toInstant().truncatedTo(ChronoUnit.SECONDS));
    }

    /** Cột timestamptz → OffsetDateTime UTC; `checked_in_at` chưa check-in thì null, không NPE. */
    private static OffsetDateTime utc(java.sql.ResultSet rs, String column) throws java.sql.SQLException {
        java.sql.Timestamp value = rs.getTimestamp(column);
        return value == null ? null : OffsetDateTime.ofInstant(value.toInstant(), ZoneOffset.UTC);
    }
}
