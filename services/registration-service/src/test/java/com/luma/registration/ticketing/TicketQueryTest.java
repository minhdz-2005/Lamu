package com.luma.registration.ticketing;

import com.luma.registration.reservation.TestData;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class TicketQueryTest {

    @Autowired
    private MockMvc mvc;

    @Autowired
    private JdbcTemplate jdbc;

    private final List<UUID> events = new ArrayList<>();

    @AfterEach
    void donDevDb() {
        TestData.deleteAll(jdbc, events);
        events.clear();
    }

    private UUID publishedEvent(String ticketPrice, int capacity, Instant start, Instant end, String status) {
        UUID eventId = UUID.randomUUID();
        events.add(eventId);
        TestData.insertSnapshot(jdbc, eventId, "PUBLISHED");
        TestData.insertTicketType(jdbc, eventId, "VIP", ticketPrice, capacity, start, end, status);
        return eventId;
    }

    @Test
    void danhSachLoaiVeCongKhaiKhiEventPublished() throws Exception {
        UUID eventId = publishedEvent("150000.00", 100,
                Instant.now().minusSeconds(3600), Instant.now().plusSeconds(3600), "ACTIVE");

        mvc.perform(get("/events/" + eventId + "/ticket-types"))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith("application/json"))
                .andExpect(jsonPath("$").isArray())
                .andExpect(jsonPath("$[0].id").isString())
                .andExpect(jsonPath("$[0].name").value("VIP"))
                .andExpect(jsonPath("$[0].price").value("150000.00"))
                .andExpect(jsonPath("$[0].currency").value("VND"))
                .andExpect(jsonPath("$[0].status").value("ACTIVE"))
                .andExpect(jsonPath("$[0].sales_start").isString())
                .andExpect(jsonPath("$[0].sales_end").isString());
    }

    @Test
    void eventKhongTonTaiTra404CaHaiEndpoint() throws Exception {
        UUID eventId = UUID.randomUUID();
        mvc.perform(get("/events/" + eventId + "/ticket-types"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("NOT_FOUND"));
        mvc.perform(get("/events/" + eventId + "/availability"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("NOT_FOUND"));
    }

    @Test
    void eventChuaPublishedTra404KhiLietKeVa409KhiAvailability() throws Exception {
        UUID eventId = UUID.randomUUID();
        events.add(eventId);
        TestData.insertSnapshot(jdbc, eventId, "DRAFT");

        mvc.perform(get("/events/" + eventId + "/ticket-types"))
                .andExpect(status().isNotFound());
        mvc.perform(get("/events/" + eventId + "/availability"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("SALES_CLOSED"));
    }

    @Test
    void availabilityAvailableDungBangCapacityTruSoldTruReserved() throws Exception {
        UUID eventId = publishedEvent("150000.00", 100,
                Instant.now().minusSeconds(3600), Instant.now().plusSeconds(3600), "ACTIVE");
        jdbc.update("UPDATE inventory SET sold = 30, reserved = 20 "
                + "WHERE ticket_type_id IN (SELECT id FROM ticket_types WHERE event_id = ?)", eventId);

        mvc.perform(get("/events/" + eventId + "/availability"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].ticket_type_id").isString())
                .andExpect(jsonPath("$[0].capacity").value(100))
                .andExpect(jsonPath("$[0].sold").value(30))
                .andExpect(jsonPath("$[0].reserved").value(20))
                .andExpect(jsonPath("$[0].available").value(50))
                .andExpect(jsonPath("$[0].sales_open").value(true))
                .andExpect(jsonPath("$[0].status").value("ACTIVE"));
    }

    @Test
    void availabilityNgoaiCuaSalesOpenFalse() throws Exception {
        UUID eventId = publishedEvent("150000.00", 100,
                Instant.now().minusSeconds(7200), Instant.now().minusSeconds(60), "ACTIVE");

        mvc.perform(get("/events/" + eventId + "/availability"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].sales_open").value(false))
                .andExpect(jsonPath("$[0].available").value(100));
    }

    @Test
    void availabilityTypeClosedVanConTraRowKemStatus() throws Exception {
        UUID eventId = publishedEvent("150000.00", 100,
                Instant.now().minusSeconds(3600), Instant.now().plusSeconds(3600), "CLOSED");

        mvc.perform(get("/events/" + eventId + "/availability"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].status").value("CLOSED"))
                .andExpect(jsonPath("$[0].sales_open").value(false));
    }

    @Test
    void availabilityKhongAmVaKhongCache() throws Exception {
        UUID eventId = publishedEvent("50000.00", 10,
                Instant.now().minusSeconds(3600), Instant.now().plusSeconds(3600), "ACTIVE");
        jdbc.update("UPDATE inventory SET sold = 7, reserved = 3 "
                + "WHERE ticket_type_id IN (SELECT id FROM ticket_types WHERE event_id = ?)", eventId);

        mvc.perform(get("/events/" + eventId + "/availability"))
                .andExpect(jsonPath("$[0].available").value(0));

        // Không cache: đổi inventory là lần đọc kế tiếp thấy ngay (10 − 6 sold − 3 reserved = 1).
        jdbc.update("UPDATE inventory SET sold = 6 "
                + "WHERE ticket_type_id IN (SELECT id FROM ticket_types WHERE event_id = ?)", eventId);
        mvc.perform(get("/events/" + eventId + "/availability"))
                .andExpect(jsonPath("$[0].available").value(1));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM ticket_types WHERE event_id = ?", Integer.class, eventId))
                .isEqualTo(1);
    }
}
