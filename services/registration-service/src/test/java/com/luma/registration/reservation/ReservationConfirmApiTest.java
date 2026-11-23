package com.luma.registration.reservation;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 3.4 — `POST /reservations/{id}/confirm` (nội bộ, catalog §3): UI không có nút xác nhận nên đường này
 * chỉ saga/ops dùng; 403 khi không phải chủ, 409 khi không còn HELD (đã confirm hoặc hết hạn).
 */
@SpringBootTest
@AutoConfigureMockMvc
class ReservationConfirmApiTest {

    private static final String OWNER = "11111111-1111-1111-1111-111111111111";
    private static final String OTHER = "22222222-2222-2222-2222-222222222222";

    @Autowired
    private MockMvc mvc;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private ReservationService service;

    private final List<UUID> events = new ArrayList<>();
    private UUID eventId;
    private UUID paidType;

    @BeforeEach
    void chuanBiEvent() {
        eventId = UUID.randomUUID();
        events.add(eventId);
        TestData.insertSnapshot(jdbc, eventId, "PUBLISHED");
        paidType = TestData.insertTicketType(jdbc, eventId, "VIP", "150000.00", 100,
                Instant.now().minusSeconds(3600), Instant.now().plusSeconds(3600), "ACTIVE");
    }

    @AfterEach
    void donDevDb() {
        TestData.deleteAll(jdbc, events);
        events.clear();
    }

    private String reserve(String user, String key) {
        return ((ReservationService.HeldResponse) service.reserve(new ReservationService.Command(
                user, "buyer@test.local", eventId,
                List.of(new ReservationService.ItemInput(paidType.toString(), 1)), key))).reservationId();
    }

    @Test
    void confirmCuaMinhTraRegistrationVaDanhSachVe() throws Exception {
        String reservationId = reserve(OWNER, "api-confirm-ok");

        mvc.perform(post("/reservations/{id}/confirm", reservationId).header("X-User-Id", OWNER))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.registration_id").isNotEmpty())
                .andExpect(jsonPath("$.tickets.length()").value(1))
                .andExpect(jsonPath("$.tickets[0].code").value(org.hamcrest.Matchers.matchesPattern(
                        "^LUMA-[0-9A-F]{4}-[0-9A-F]{4}$")));

        assertThat(jdbc.queryForObject("SELECT status FROM reservations WHERE id = ?", String.class,
                UUID.fromString(reservationId))).isEqualTo("CONFIRMED");
    }

    @Test
    void nguoiKhacXacNhanHoThi403() throws Exception {
        String reservationId = reserve(OWNER, "api-confirm-403");

        mvc.perform(post("/reservations/{id}/confirm", reservationId).header("X-User-Id", OTHER))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("FORBIDDEN"));

        assertThat(jdbc.queryForObject("SELECT status FROM reservations WHERE id = ?", String.class,
                UUID.fromString(reservationId))).isEqualTo("HELD");
    }

    @Test
    void confirmLanHaiHoacDaHetHanThi409() throws Exception {
        String reservationId = reserve(OWNER, "api-confirm-twice");
        mvc.perform(post("/reservations/{id}/confirm", reservationId).header("X-User-Id", OWNER))
                .andExpect(status().isOk());

        mvc.perform(post("/reservations/{id}/confirm", reservationId).header("X-User-Id", OWNER))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("CONFLICT"));

        String expired = reserve(OTHER, "api-confirm-expired");
        jdbc.update("UPDATE reservations SET expires_at = now() - interval '1 second' WHERE id = ?",
                UUID.fromString(expired));
        mvc.perform(post("/reservations/{id}/confirm", expired).header("X-User-Id", OTHER))
                .andExpect(status().isConflict());
        assertThat(jdbc.queryForObject("SELECT status FROM reservations WHERE id = ?", String.class,
                UUID.fromString(expired))).as("hết hạn thì confirm không được tự đổi trạng thái").isEqualTo("HELD");
    }

    @Test
    void reservationKhongTonTaiThi404() throws Exception {
        mvc.perform(post("/reservations/{id}/confirm", UUID.randomUUID()).header("X-User-Id", OWNER))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("NOT_FOUND"));
    }
}
