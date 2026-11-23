package com.luma.registration.reservation;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.luma.registration.common.web.ApiException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class ReservationPaidTest {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String USER_ID = "11111111-1111-1111-1111-111111111111";
    private static final String EMAIL = "buyer@test.local";

    @Autowired
    private MockMvc mvc;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private ReservationService service;

    private final List<UUID> events = new ArrayList<>();

    @AfterEach
    void donDevDb() {
        TestData.deleteAll(jdbc, events);
        events.clear();
    }

    private UUID eventWithTicketType(String price, int capacity) {
        UUID eventId = UUID.randomUUID();
        events.add(eventId);
        TestData.insertSnapshot(jdbc, eventId, "PUBLISHED");
        TestData.insertOpenWindowTicket(jdbc, eventId, "VIP", price, capacity);
        return eventId;
    }

    private String typeId(UUID eventId) {
        return jdbc.queryForObject("SELECT id::text FROM ticket_types WHERE event_id = ?", String.class, eventId);
    }

    private org.springframework.test.web.servlet.ResultActions reserve(UUID eventId, String key, String basketJson)
            throws Exception {
        return mvc.perform(post("/events/" + eventId + "/reservations")
                .header("X-User-Id", USER_ID)
                .header("X-User-Email", EMAIL)
                .header("Idempotency-Key", key)
                .contentType("application/json")
                .content(basketJson));
    }

    private static String basket(String typeId, int qty) {
        return "{\"items\":[{\"ticket_type_id\":\"" + typeId + "\",\"quantity\":" + qty + "}]}";
    }

    @Test
    void thieuIdempotencyKeyTra400MachuyDinh() throws Exception {
        UUID eventId = eventWithTicketType("150000.00", 100);
        mvc.perform(post("/events/" + eventId + "/reservations")
                        .header("X-User-Id", USER_ID).header("X-User-Email", EMAIL)
                        .contentType("application/json").content(basket(typeId(eventId), 1)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("IDEMPOTENCY_KEY_REQUIRED"));
    }

    @Test
    void thieuXUserEmailTra400ValidationFailed() throws Exception {
        UUID eventId = eventWithTicketType("150000.00", 100);
        mvc.perform(post("/events/" + eventId + "/reservations")
                        .header("X-User-Id", USER_ID).header("Idempotency-Key", "k-1")
                        .contentType("application/json").content(basket(typeId(eventId), 1)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("VALIDATION_FAILED"));
    }

    @Test
    void cungKeyCungBodyTraDungKetQuaCuKhongTruChoLanHai() throws Exception {
        UUID eventId = eventWithTicketType("150000.00", 100);
        String first = reserve(eventId, "same-key", basket(typeId(eventId), 2))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        String second = reserve(eventId, "same-key", basket(typeId(eventId), 2))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();

        String firstId = com.jayway.jsonpath.JsonPath.read(first, "$.reservation_id");
        String secondId = com.jayway.jsonpath.JsonPath.read(second, "$.reservation_id");
        assertThat(secondId).isEqualTo(firstId);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM reservations WHERE event_id = ?", Integer.class, eventId))
                .isEqualTo(1);
        assertThat(jdbc.queryForObject(
                "SELECT reserved FROM inventory WHERE ticket_type_id = ?", Integer.class, UUID.fromString(typeId(eventId))))
                .isEqualTo(2);
        assertThat(jdbc.queryForObject(
                "SELECT count(*) FROM outbox_events WHERE event_type = 'ReservationCreated' AND aggregate_id = ?",
                Integer.class, UUID.fromString(com.jayway.jsonpath.JsonPath.read(first, "$.reservation_id"))))
                .isEqualTo(1);
    }

    @Test
    void cungKeyKhacBodyTra409Conflict() throws Exception {
        UUID eventId = eventWithTicketType("150000.00", 100);
        reserve(eventId, "dup-key", basket(typeId(eventId), 1)).andExpect(status().isOk());
        reserve(eventId, "dup-key", basket(typeId(eventId), 2))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("CONFLICT"));
    }

    @Test
    void soldOutToanBoRequestFailKhongBanMotPhan() throws Exception {
        UUID eventId = UUID.randomUUID();
        events.add(eventId);
        TestData.insertSnapshot(jdbc, eventId, "PUBLISHED");
        String typeA = TestData.insertTicketType(jdbc, eventId, "A", "100000.00", 5,
                Instant.now().minusSeconds(3600), Instant.now().plusSeconds(3600), "ACTIVE").toString();
        String typeB = TestData.insertTicketType(jdbc, eventId, "B", "200000.00", 5,
                Instant.now().minusSeconds(3600), Instant.now().plusSeconds(3600), "ACTIVE").toString();
        // type B hết chỗ trước: request A(5)+B(2) phải fail TOÀN BỘ, A không bị trừ.
        jdbc.update("UPDATE inventory SET reserved = 5 WHERE ticket_type_id = ?", UUID.fromString(typeB));

        reserve(eventId, "k-so", "{\"items\":[{\"ticket_type_id\":\"" + typeA + "\",\"quantity\":5},"
                + "{\"ticket_type_id\":\"" + typeB + "\",\"quantity\":2}]}")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("SOLD_OUT"));

        assertThat(jdbc.queryForObject("SELECT reserved FROM inventory WHERE ticket_type_id = ?",
                Integer.class, UUID.fromString(typeA))).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM reservations WHERE event_id = ?",
                Integer.class, eventId)).isZero();
    }

    @Test
    void quantityNgoaiKhoangVaTrungLoaiTra400() throws Exception {
        UUID eventId = eventWithTicketType("150000.00", 100);
        String t = typeId(eventId);
        reserve(eventId, "k-q1", basket(t, 11)).andExpect(status().isBadRequest());
        reserve(eventId, "k-q2", "{\"items\":[]}").andExpect(status().isBadRequest());
        reserve(eventId, "k-q3", "{\"items\":[{\"ticket_type_id\":\"" + t + "\",\"quantity\":1},"
                + "{\"ticket_type_id\":\"" + t + "\",\"quantity\":1}]}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("VALIDATION_FAILED"));
    }

    @Test
    void salesClosedKhiNgoaiCuaHoacEventChuaMou() throws Exception {
        UUID eventId = UUID.randomUUID();
        events.add(eventId);
        TestData.insertSnapshot(jdbc, eventId, "PUBLISHED");
        String closedType = TestData.insertTicketType(jdbc, eventId, "VIP", "150000.00", 100,
                Instant.now().minusSeconds(7200), Instant.now().minusSeconds(60), "ACTIVE").toString();
        reserve(eventId, "k-w", basket(closedType, 1))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("SALES_CLOSED"));

        UUID draftEvent = UUID.randomUUID();
        events.add(draftEvent);
        TestData.insertSnapshot(jdbc, draftEvent, "DRAFT");
        String draftType = TestData.insertTicketType(jdbc, draftEvent, "VIP", "150000.00", 100,
                Instant.now().minusSeconds(3600), Instant.now().plusSeconds(3600), "ACTIVE").toString();
        reserve(draftEvent, "k-d", basket(draftType, 1))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("SALES_CLOSED"));
    }

    @Test
    void loaiVeKhongThuocEventTra404() throws Exception {
        UUID eventId = eventWithTicketType("150000.00", 100);
        UUID otherEvent = eventWithTicketType("150000.00", 100);
        reserve(eventId, "k-wrong", basket(typeId(otherEvent), 1))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("NOT_FOUND"));
    }

    @Test
    void heldDungShapeTtlVaOutboxDu7Field() throws Exception {
        UUID eventId = eventWithTicketType("150000.00", 100);
        String body = reserve(eventId, "k-held", basket(typeId(eventId), 2))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("HELD"))
                .andExpect(jsonPath("$.total_amount").value("300000.00"))
                .andExpect(jsonPath("$.currency").value("VND"))
                .andReturn().getResponse().getContentAsString();

        String reservationId = com.jayway.jsonpath.JsonPath.read(body, "$.reservation_id");
        String expiresAt = com.jayway.jsonpath.JsonPath.read(body, "$.expires_at");
        Instant expiry = Instant.parse(expiresAt);
        assertThat(expiry).isBetween(Instant.now().plusSeconds(100), Instant.now().plusSeconds(140));

        JsonNode payload = JSON.readTree(jdbc.queryForObject(
                "SELECT payload::text FROM outbox_events WHERE event_type = 'ReservationCreated' AND aggregate_id = ?",
                String.class, UUID.fromString(reservationId)));
        assertThat(payload.hasNonNull("reservation_id")).isTrue();
        assertThat(payload.hasNonNull("event_id")).isTrue();
        assertThat(payload.hasNonNull("organization_id")).isTrue();
        assertThat(payload.hasNonNull("user_id")).isTrue();
        assertThat(payload.hasNonNull("total_amount")).isTrue();
        assertThat(payload.hasNonNull("currency")).isTrue();
        assertThat(payload.hasNonNull("expires_at")).isTrue();

        assertThat(jdbc.queryForObject("SELECT payment_status FROM reservations WHERE id = ?",
                String.class, UUID.fromString(reservationId))).isEqualTo("PENDING");
        assertThat(jdbc.queryForObject("SELECT recipient_email FROM reservations WHERE id = ?",
                String.class, UUID.fromString(reservationId))).isEqualTo(EMAIL);
    }

    @Test
    void haiTramRequestDongThoiTrenCapacity100Dung100ThanhCong() throws Exception {
        UUID eventId = eventWithTicketType("150000.00", 100);
        String type = typeId(eventId);
        var executor = Executors.newFixedThreadPool(50);
        try {
            List<Future<Boolean>> futures = new ArrayList<>();
            for (int i = 0; i < 200; i++) {
                String key = "load-" + i;
                Callable<Boolean> call = () -> {
                    try {
                        service.reserve(new ReservationService.Command(USER_ID, EMAIL, eventId,
                                List.of(new ReservationService.ItemInput(type, 1)), key));
                        return true;
                    } catch (ApiException e) {
                        if (e.getStatus() == HttpStatus.CONFLICT && "SOLD_OUT".equals(e.getCode())) {
                            return false;
                        }
                        throw e;
                    }
                };
                futures.add(executor.submit(call));
            }
            long ok = 0;
            for (Future<Boolean> f : futures) {
                if (f.get(120, TimeUnit.SECONDS)) {
                    ok++;
                }
            }
            assertThat(ok).isEqualTo(100);
            assertThat(jdbc.queryForObject("SELECT reserved FROM inventory WHERE ticket_type_id = ?",
                    Integer.class, UUID.fromString(type))).isEqualTo(100);
            assertThat(jdbc.queryForObject("SELECT count(*) FROM reservations WHERE event_id = ?",
                    Integer.class, eventId)).isEqualTo(100);
        } finally {
            executor.shutdownNow();
        }
    }
}
