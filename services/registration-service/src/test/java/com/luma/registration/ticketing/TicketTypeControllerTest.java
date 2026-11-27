package com.luma.registration.ticketing;

import com.luma.registration.common.identity.AuthorizationClient;
import com.luma.registration.common.web.ApiException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class TicketTypeControllerTest {

    @Autowired
    private MockMvc mvc;

    @Autowired
    private JdbcTemplate jdbc;

    @MockitoBean
    private AuthorizationClient authorization;

    private final List<UUID> createdEvents = new ArrayList<>();
    private final String userId = UUID.randomUUID().toString();

    @AfterEach
    void donDevDb() {
        for (UUID eventId : createdEvents) {
            jdbc.update("DELETE FROM inventory WHERE ticket_type_id IN (SELECT id FROM ticket_types WHERE event_id = ?)", eventId);
            jdbc.update("DELETE FROM ticket_types WHERE event_id = ?", eventId);
            jdbc.update("DELETE FROM event_snapshot WHERE event_id = ?", eventId);
        }
        createdEvents.clear();
    }

    /** Chèn snapshot cho event, trả về organization_id đã ghi. */
    private String insertSnapshot(String status) {
        UUID eventId = UUID.randomUUID();
        UUID orgId = UUID.randomUUID();
        createdEvents.add(eventId);
        jdbc.update("""
                INSERT INTO event_snapshot (event_id, organization_id, title, slug, status, starts_at, ends_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)""",
                eventId, orgId, "Event test", "event-test-" + eventId, status,
                Timestamp.from(Instant.now()), Timestamp.from(Instant.now().plusSeconds(3600)));
        return orgId.toString();
    }

    private String body(String name, String price, String currency, int capacity,
                        String salesStart, String salesEnd) {
        return """
                {"name":"%s","price":"%s","currency":"%s","capacity":%d,"sales_start":"%s","sales_end":"%s"}"""
                .formatted(name, price, currency, capacity, salesStart, salesEnd);
    }

    private org.springframework.test.web.servlet.ResultActions createEvent(String eventId, String json)
            throws Exception {
        return mvc.perform(post("/events/" + eventId + "/ticket-types")
                .header("X-User-Id", userId)
                .contentType("application/json")
                .content(json));
    }

    private static final String HOP_LE = "2026-12-01T08:00:00+07:00";
    private static final String HOP_LE_KET_THUC = "2026-12-31T23:00:00+07:00";

    @Test
    void thieuSalesEndTra400ValidationFailed() throws Exception {
        createEvent(UUID.randomUUID().toString(),
                "{\"name\":\"VIP\",\"price\":\"150000.00\",\"currency\":\"VND\",\"capacity\":100,\"sales_start\":\"" + HOP_LE + "\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("VALIDATION_FAILED"));
    }

    @Test
    void priceSaiDinhDangThapPhanTra400() throws Exception {
        createEvent(UUID.randomUUID().toString(),
                body("VIP", "150000.000", "VND", 100, HOP_LE, HOP_LE_KET_THUC))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("VALIDATION_FAILED"));
    }

    @Test
    void currencyKhacVndTra400() throws Exception {
        createEvent(UUID.randomUUID().toString(),
                body("VIP", "150000.00", "USD", 100, HOP_LE, HOP_LE_KET_THUC))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("VALIDATION_FAILED"));
    }

    @Test
    void salesEndTruocSalesStartTra400() throws Exception {
        createEvent(UUID.randomUUID().toString(),
                body("VIP", "150000.00", "VND", 100, HOP_LE_KET_THUC, HOP_LE))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("VALIDATION_FAILED"));
    }

    @Test
    void capacityNgoaiKhoangTra400() throws Exception {
        createEvent(UUID.randomUUID().toString(),
                body("VIP", "150000.00", "VND", 0, HOP_LE, HOP_LE_KET_THUC))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("VALIDATION_FAILED"));
    }

    @Test
    void chuaCoSnapshotTra409() throws Exception {
        createEvent(UUID.randomUUID().toString(),
                body("VIP", "150000.00", "VND", 100, HOP_LE, HOP_LE_KET_THUC))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("CONFLICT"));
    }

    @Test
    void snapshotChuaPublishedTra409() throws Exception {
        insertSnapshot("DRAFT");
        UUID eventId = createdEvents.getFirst();
        createEvent(eventId.toString(), body("VIP", "150000.00", "VND", 100, HOP_LE, HOP_LE_KET_THUC))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("CONFLICT"));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM ticket_types WHERE event_id = ?", Integer.class, eventId))
                .isZero();
    }

    @Test
    void thanhCongTra200VaInventoryDungCapacity() throws Exception {
        String orgId = insertSnapshot("PUBLISHED");
        UUID eventId = createdEvents.getFirst();

        String response = createEvent(eventId.toString(), body("VIP", "150000.00", "VND", 120, HOP_LE, HOP_LE_KET_THUC))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        String ticketTypeId = com.jayway.jsonpath.JsonPath.read(response, "$.ticket_type_id");
        assertThat(UUID.fromString(ticketTypeId)).isNotNull();

        // Quyền hỏi Identity = event.update, organization_id lấy từ snapshot, gọi trước transaction.
        verify(authorization).requireEventPermission(userId, orgId, eventId.toString(), "event.update");

        List<java.util.Map<String, Object>> inv = jdbc.queryForList(
                "SELECT i.capacity, i.sold, i.reserved, t.name, t.price, t.currency "
                        + "FROM inventory i JOIN ticket_types t ON t.id = i.ticket_type_id WHERE t.event_id = ?",
                eventId);
        assertThat(inv).hasSize(1);
        assertThat(inv.getFirst())
                .containsEntry("capacity", 120)
                .containsEntry("sold", 0)
                .containsEntry("reserved", 0)
                .containsEntry("name", "VIP")
                .containsEntry("currency", "VND");
        assertThat(inv.getFirst().get("price")).asString().isEqualTo("150000.00");
    }

    @Test
    void identityTuChoiQuyenTra403KhongGhiDuLieu() throws Exception {
        insertSnapshot("PUBLISHED");
        UUID eventId = createdEvents.getFirst();
        doThrow(new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN", "Tài khoản không được phép thực hiện yêu cầu này."))
                .when(authorization).requireEventPermission(anyString(), anyString(), anyString(), anyString());

        createEvent(eventId.toString(), body("VIP", "150000.00", "VND", 100, HOP_LE, HOP_LE_KET_THUC))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("FORBIDDEN"));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM ticket_types WHERE event_id = ?", Integer.class, eventId))
                .isZero();
    }
}
