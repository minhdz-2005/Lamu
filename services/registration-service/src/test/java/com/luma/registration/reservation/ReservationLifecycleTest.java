package com.luma.registration.reservation;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class ReservationLifecycleTest {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String USER_ID = "11111111-1111-1111-1111-111111111111";

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

    /** Tạo event PUBLISHED + loại vé mở bán, giữ chỗ `qty` vé, trả reservation_id. */
    private String holdTickets(String key, String price, int capacity, int qty) throws Exception {
        UUID eventId = UUID.randomUUID();
        events.add(eventId);
        TestData.insertSnapshot(jdbc, eventId, "PUBLISHED");
        String type = TestData.insertTicketType(jdbc, eventId, "VIP", price, capacity,
                Instant.now().minusSeconds(3600), Instant.now().plusSeconds(3600), "ACTIVE").toString();
        String body = mvc.perform(post("/events/" + eventId + "/reservations")
                        .header("X-User-Id", USER_ID)
                        .header("X-User-Email", "owner@test.local")
                        .header("Idempotency-Key", key)
                        .contentType("application/json")
                        .content("{\"items\":[{\"ticket_type_id\":\"" + type + "\",\"quantity\":" + qty + "}]}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return com.jayway.jsonpath.JsonPath.read(body,
                price.equals("0.00") ? "$.registration_id" : "$.reservation_id");
    }

    @Test
    void getTraDungShapeCuaReservationHeld() throws Exception {
        String reservationId = holdTickets("lc-1", "150000.00", 10, 2);

        mvc.perform(get("/reservations/" + reservationId).header("X-User-Id", USER_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("HELD"))
                .andExpect(jsonPath("$.expires_at").isString())
                .andExpect(jsonPath("$.total_amount").value("300000.00"))
                .andExpect(jsonPath("$.payment_status").value("PENDING"))
                .andExpect(jsonPath("$.items[0].quantity").value(2))
                .andExpect(jsonPath("$.items[0].unit_price").value("150000.00"))
                .andExpect(jsonPath("$.items[0].ticket_type_name").value("VIP"));
    }

    @Test
    void getCuaNguoiKhacTra403() throws Exception {
        String reservationId = holdTickets("lc-2", "150000.00", 10, 1);
        mvc.perform(get("/reservations/" + reservationId)
                        .header("X-User-Id", "99999999-9999-9999-9999-999999999999"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("FORBIDDEN"));
    }

    @Test
    void getKhongTonTaiTra404() throws Exception {
        mvc.perform(get("/reservations/" + UUID.randomUUID()).header("X-User-Id", USER_ID))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("NOT_FOUND"));
    }

    @Test
    void deleteHeldNhaQuyenDungMotLanVaGhiOutboxReleased() throws Exception {
        String reservationId = holdTickets("lc-3", "150000.00", 10, 3);
        String type = jdbc.queryForObject(
                "SELECT ticket_type_id::text FROM reservation_items WHERE reservation_id = ?",
                String.class, UUID.fromString(reservationId));

        mvc.perform(delete("/reservations/" + reservationId).header("X-User-Id", USER_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("RELEASED"));

        assertThat(jdbc.queryForObject("SELECT reserved FROM inventory WHERE ticket_type_id = ?",
                Integer.class, UUID.fromString(type))).isZero();
        assertThat(jdbc.queryForObject("SELECT status FROM reservations WHERE id = ?",
                String.class, UUID.fromString(reservationId))).isEqualTo("RELEASED");

        JsonNode payload = JSON.readTree(jdbc.queryForObject(
                "SELECT payload::text FROM outbox_events WHERE event_type = 'ReservationReleased' AND aggregate_id = ?",
                String.class, UUID.fromString(reservationId)));
        for (String field : List.of("reservation_id", "event_id", "recipient_email",
                "event_title", "event_starts_at", "reason")) {
            assertThat(payload.hasNonNull(field)).as(field).isTrue();
        }
        assertThat(payload.get("reason").asText()).isEqualTo("CANCELLED");
        assertThat(payload.get("recipient_email").asText()).isEqualTo("owner@test.local");
    }

    @Test
    void deleteLanHaiTra409VaKhongNhaQuyenLanHai() throws Exception {
        String reservationId = holdTickets("lc-4", "150000.00", 10, 2);
        String type = jdbc.queryForObject(
                "SELECT ticket_type_id::text FROM reservation_items WHERE reservation_id = ?",
                String.class, UUID.fromString(reservationId));

        mvc.perform(delete("/reservations/" + reservationId).header("X-User-Id", USER_ID))
                .andExpect(status().isOk());
        mvc.perform(delete("/reservations/" + reservationId).header("X-User-Id", USER_ID))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("CONFLICT"));

        // Lần hai phải fail TRƯỚC khi trừ: reserved vẫn 0 (không thành -2), outbox vẫn đúng 1 row.
        assertThat(jdbc.queryForObject("SELECT reserved FROM inventory WHERE ticket_type_id = ?",
                Integer.class, UUID.fromString(type))).isZero();
        assertThat(jdbc.queryForObject(
                "SELECT count(*) FROM outbox_events WHERE event_type = 'ReservationReleased' AND aggregate_id = ?",
                Integer.class, UUID.fromString(reservationId))).isEqualTo(1);
    }

    @Test
    void deleteCuaNguoiKhacTra403KhongNhaQuyen() throws Exception {
        String reservationId = holdTickets("lc-5", "150000.00", 10, 2);
        String type = jdbc.queryForObject(
                "SELECT ticket_type_id::text FROM reservation_items WHERE reservation_id = ?",
                String.class, UUID.fromString(reservationId));

        mvc.perform(delete("/reservations/" + reservationId)
                        .header("X-User-Id", "99999999-9999-9999-9999-999999999999"))
                .andExpect(status().isForbidden());
        assertThat(jdbc.queryForObject("SELECT reserved FROM inventory WHERE ticket_type_id = ?",
                Integer.class, UUID.fromString(type))).isEqualTo(2);
    }

    @Test
    void deleteKhiDaConfirmedTra409() throws Exception {
        // Nhánh miễn phí: reservation sinh ra đã CONFIRMED → không hủy được (BR-TCK-05).
        String registrationId = holdTickets("lc-6", "0.00", 10, 1);
        String reservationId = jdbc.queryForObject(
                "SELECT reservation_id::text FROM registrations WHERE id = ?", String.class,
                UUID.fromString(registrationId));

        mvc.perform(delete("/reservations/" + reservationId).header("X-User-Id", USER_ID))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("CONFLICT"));
    }
}
