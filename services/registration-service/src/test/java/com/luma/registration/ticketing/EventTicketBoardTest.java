package com.luma.registration.ticketing;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
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

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// @MockitoBean tạo context riêng; nếu nó còn sống thì consumer của nó tranh tiêu message
// trên cùng hàng đợi dev với các test consumer. Đóng ngay sau class.
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
@SpringBootTest
@AutoConfigureMockMvc
class EventTicketBoardTest {

    @Autowired
    private MockMvc mvc;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private ObjectMapper objectMapper;

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

    private UUID newEvent(int ticketCount) {
        UUID eventId = UUID.randomUUID();
        createdEvents.add(eventId);
        orgIds.add(TestData.insertSnapshot(jdbc, eventId, "PUBLISHED"));
        UUID ticketTypeId = TestData.insertTicketType(jdbc, eventId, "VIP", "150000.00", 500,
                Instant.now().minus(1, ChronoUnit.DAYS), Instant.now().plus(1, ChronoUnit.DAYS), "ACTIVE");
        for (int i = 1; i <= ticketCount; i++) {
            TestData.insertTicket(jdbc, eventId, ticketTypeId, userId, TestData.ticketCode(),
                    i % 3 == 0 ? "USED" : "ISSUED",
                    i % 3 == 0 ? Instant.now().minus(1, ChronoUnit.HOURS) : null);
        }
        return eventId;
    }

    private org.springframework.test.web.servlet.ResultActions board(UUID eventId, String query) throws Exception {
        return mvc.perform(get("/events/" + eventId + "/tickets" + query).header("X-User-Id", userId));
    }

    @Test
    void phanTrangTraItemsVaKhemMax100() throws Exception {
        UUID eventId = newEvent(105);

        board(eventId, "?limit=200")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(105))
                .andExpect(jsonPath("$.items.length()").value(100));

        verify(authorization).requireEventPermission(userId, orgIds.getFirst(), eventId.toString(), "event.read");
    }

    @Test
    void offsetVuotBienVanTraItemsRong() throws Exception {
        UUID eventId = newEvent(3);

        board(eventId, "?offset=99999")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(0))
                .andExpect(jsonPath("$.total").value(3));
    }

    @Test
    void locStatusDungTapVaTotalCungBoLoc() throws Exception {
        UUID eventId = newEvent(9);

        JsonNode page = objectMapper.readTree(board(eventId, "?status=USED")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(3))
                .andReturn().getResponse().getContentAsString());
        assertThat(page.get("items")).hasSize(3);
        page.get("items").forEach(item -> assertThat(item.get("status").asText()).isEqualTo("USED"));
    }

    @Test
    void itemChiCoNamFieldKhongLoEmailHoacTenNguoiMua() throws Exception {
        UUID eventId = newEvent(1);

        JsonNode page = objectMapper.readTree(board(eventId, "").andReturn().getResponse().getContentAsString());
        assertThat(fieldNames(page.get("items").get(0)))
                .containsExactlyInAnyOrder("ticket_id", "code", "ticket_type_name", "status", "checked_in_at");
        assertThat(page.get("items").get(0).get("ticket_type_name").asText()).isEqualTo("VIP");
        assertThat(page.toString()).doesNotContain("ticket-fixture@test.local");
    }

    private static List<String> fieldNames(JsonNode node) {
        List<String> names = new ArrayList<>();
        node.fieldNames().forEachRemaining(names::add);
        return names;
    }

    @Test
    void statusLaThi400ValidationFailed() throws Exception {
        UUID eventId = newEvent(1);
        board(eventId, "?status=PAID").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("VALIDATION_FAILED"));
    }

    @Test
    void eventKhongCoSnapshotThi404() throws Exception {
        board(UUID.randomUUID(), "").andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("NOT_FOUND"));
    }

    @Test
    void identityTuChoiThi403() throws Exception {
        UUID eventId = newEvent(1);
        doThrow(new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN", "Tài khoản không được phép thực hiện yêu cầu này."))
                .when(authorization).requireEventPermission(anyString(), anyString(), anyString(), anyString());

        board(eventId, "").andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("FORBIDDEN"));
    }

    @Test
    void thieuHeaderDanhTinhThi401() throws Exception {
        UUID eventId = newEvent(1);
        mvc.perform(get("/events/" + eventId + "/tickets"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error.code").value("UNAUTHENTICATED"));
    }
}
