package com.luma.registration.ticketing;

import com.luma.registration.common.identity.AuthorizationClient;
import com.luma.registration.common.web.ApiException;
import com.luma.registration.reservation.TestData;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// @MockitoBean tạo context riêng; nếu nó còn sống thì consumer của nó tranh tiêu message
// trên cùng hàng đợi dev với các test consumer. Đóng ngay sau class.
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
@SpringBootTest
@AutoConfigureMockMvc
class TicketTypePatchTest {

    @Autowired
    private MockMvc mvc;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private com.fasterxml.jackson.databind.ObjectMapper json;

    @MockitoBean
    private AuthorizationClient authorization;

    private final List<UUID> createdEvents = new ArrayList<>();
    private final List<String> orgIds = new ArrayList<>();
    private final String userId = UUID.randomUUID().toString();

    @AfterEach
    void donDevDb() {
        TestData.deleteAll(jdbc, createdEvents);
        createdEvents.clear();
        orgIds.clear();
    }

    private UUID newEvent() {
        UUID eventId = UUID.randomUUID();
        createdEvents.add(eventId);
        orgIds.add(TestData.insertSnapshot(jdbc, eventId, "PUBLISHED"));
        return eventId;
    }

    private UUID newTicketType(UUID eventId, int capacity) {
        return TestData.insertTicketType(jdbc, eventId, "VIP", "150000.00", capacity,
                Instant.now().minus(1, ChronoUnit.DAYS), Instant.now().plus(1, ChronoUnit.DAYS), "ACTIVE");
    }

    private ResultActions patchType(UUID ticketTypeId, Map<String, Object> body) throws Exception {
        return mvc.perform(patch("/ticket-types/" + ticketTypeId)
                .header("X-User-Id", userId)
                .contentType("application/json")
                .content(json.writeValueAsString(body)));
    }

    private Map<String, Object> row(UUID ticketTypeId) {
        return jdbc.queryForMap("""
                SELECT t.price, t.status, t.capacity AS type_capacity, t.sales_start, t.sales_end,
                       i.capacity AS inv_capacity
                FROM ticket_types t JOIN inventory i ON i.ticket_type_id = t.id WHERE t.id = ?""", ticketTypeId);
    }

    @Test
    void tangCapacityThiHaiBangDoiDung() throws Exception {
        UUID eventId = newEvent();
        UUID ticketTypeId = newTicketType(eventId, 100);

        patchType(ticketTypeId, Map.of("capacity", 250))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("OK"));

        assertThat(row(ticketTypeId))
                .containsEntry("type_capacity", 250)
                .containsEntry("inv_capacity", 250);
        verify(authorization).requireEventPermission(userId, orgIds.getFirst(), eventId.toString(), "event.update");
    }

    @Test
    void capacityBangGiaTriCuThi200() throws Exception {
        UUID eventId = newEvent();
        UUID ticketTypeId = newTicketType(eventId, 100);

        patchType(ticketTypeId, Map.of("capacity", 100)).andExpect(status().isOk());
        assertThat(row(ticketTypeId)).containsEntry("inv_capacity", 100);
    }

    @Test
    void giamCapacityDuoiSoldPlusReservedThi409() throws Exception {
        UUID eventId = newEvent();
        UUID ticketTypeId = newTicketType(eventId, 100);
        jdbc.update("UPDATE inventory SET sold = 40, reserved = 10 WHERE ticket_type_id = ?", ticketTypeId);

        patchType(ticketTypeId, Map.of("capacity", 45))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("CONFLICT"))
                .andExpect(jsonPath("$.error.message").value(
                        "Capacity chỉ được tăng (hiện tại 100, đã bán + đang giữ 50)."));

        assertThat(row(ticketTypeId)).containsEntry("type_capacity", 100).containsEntry("inv_capacity", 100);
    }

    @Test
    void doiPriceVaStatusThiGhiDung() throws Exception {
        UUID eventId = newEvent();
        UUID ticketTypeId = newTicketType(eventId, 100);

        patchType(ticketTypeId, Map.of("price", "250000.50", "status", "CLOSED"))
                .andExpect(status().isOk());

        Map<String, Object> after = row(ticketTypeId);
        assertThat((BigDecimal) after.get("price")).isEqualByComparingTo("250000.50");
        assertThat(after).containsEntry("status", "CLOSED");
    }

    @Test
    void chiSuaSalesStartThiCuaVanDungTheoSalesEndCu() throws Exception {
        UUID eventId = newEvent();
        UUID ticketTypeId = newTicketType(eventId, 100);
        String newStart = Instant.now().minus(2, ChronoUnit.HOURS).toString();

        patchType(ticketTypeId, Map.of("sales_start", newStart))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("OK"));

        assertThat(jdbc.queryForObject("SELECT sales_start FROM ticket_types WHERE id = ?",
                java.sql.Timestamp.class, ticketTypeId).toInstant())
                .isCloseTo(Instant.parse(newStart), org.assertj.core.api.Assertions.within(1, java.time.temporal.ChronoUnit.SECONDS));
    }

    @Test
    void salesStartMoiNamSauSalesEndCuThi400() throws Exception {
        UUID eventId = newEvent();
        UUID ticketTypeId = newTicketType(eventId, 100);
        Instant salesEnd = jdbc.queryForObject("SELECT sales_end FROM ticket_types WHERE id = ?",
                java.sql.Timestamp.class, ticketTypeId).toInstant();

        patchType(ticketTypeId, Map.of("sales_start", Instant.now().plus(2, ChronoUnit.DAYS).toString()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("VALIDATION_FAILED"));

        assertThat(jdbc.queryForObject("SELECT sales_end FROM ticket_types WHERE id = ?",
                java.sql.Timestamp.class, ticketTypeId).toInstant()).isEqualTo(salesEnd);
    }

    @Test
    void suaCaHaiMocThoiGianThiGhiCaHai() throws Exception {
        UUID eventId = newEvent();
        UUID ticketTypeId = newTicketType(eventId, 100);
        String start = "2026-12-01T08:00:00+07:00";
        String end = "2026-12-31T23:00:00+07:00";

        patchType(ticketTypeId, Map.of("sales_start", start, "sales_end", end)).andExpect(status().isOk());

        assertThat(jdbc.queryForObject("SELECT sales_end > sales_start FROM ticket_types WHERE id = ?",
                Boolean.class, ticketTypeId)).isTrue();
    }

    @Test
    void priceSaiThapPhanThi400() throws Exception {
        UUID eventId = newEvent();
        UUID ticketTypeId = newTicketType(eventId, 100);

        patchType(ticketTypeId, Map.of("price", "150000.000"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("VALIDATION_FAILED"));
    }

    @Test
    void loaiVeKhongTonTaiThi404() throws Exception {
        patchType(UUID.randomUUID(), Map.of("capacity", 10)).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("NOT_FOUND"));
    }

    @Test
    void eventChuaCoSnapshotThi404() throws Exception {
        UUID eventId = UUID.randomUUID();
        createdEvents.add(eventId);
        UUID ticketTypeId = newTicketType(eventId, 100);

        patchType(ticketTypeId, Map.of("capacity", 200)).andExpect(status().isNotFound());
    }

    @Test
    void identityTuChoiQuyenThi403KhongDoiGia() throws Exception {
        UUID eventId = newEvent();
        UUID ticketTypeId = newTicketType(eventId, 100);
        doThrow(new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN", "Tài khoản không được phép thực hiện yêu cầu này."))
                .when(authorization).requireEventPermission(anyString(), anyString(), anyString(), anyString());

        patchType(ticketTypeId, Map.of("price", "1000.00")).andExpect(status().isForbidden());
        assertThat((BigDecimal) row(ticketTypeId).get("price")).isEqualByComparingTo("150000.00");
    }

    @Test
    void bodyRongKhongDoiGiCavaVan200() throws Exception {
        UUID eventId = newEvent();
        UUID ticketTypeId = newTicketType(eventId, 100);
        Map<String, Object> before = row(ticketTypeId);

        patchType(ticketTypeId, Map.of()).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("OK"));
        assertThat(row(ticketTypeId)).isEqualTo(before);
    }
}
