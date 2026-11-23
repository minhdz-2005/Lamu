package com.luma.registration.reservation;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// @MockitoBean tạo context riêng; nếu nó còn sống thì consumer của nó tranh tiêu message
// trên cùng hàng đợi dev với các test consumer. Đóng ngay sau class.
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
@SpringBootTest
@AutoConfigureMockMvc
class ReservationFreeTest {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String USER_ID = "11111111-1111-1111-1111-111111111111";
    private static final String EMAIL = "free@test.local";

    @Autowired
    private MockMvc mvc;

    @Autowired
    private JdbcTemplate jdbc;

    @MockitoBean
    private TicketCodeGenerator codes;

    private final List<UUID> events = new ArrayList<>();

    @AfterEach
    void donDevDb() {
        TestData.deleteAll(jdbc, events);
        events.clear();
    }

    private UUID freeEvent(int capacity) {
        UUID eventId = UUID.randomUUID();
        events.add(eventId);
        TestData.insertSnapshot(jdbc, eventId, "PUBLISHED");
        TestData.insertOpenWindowTicket(jdbc, eventId, "FREE", "0.00", capacity);
        return eventId;
    }

    private String typeId(UUID eventId) {
        return jdbc.queryForObject("SELECT id::text FROM ticket_types WHERE event_id = ?", String.class, eventId);
    }

    private org.springframework.test.web.servlet.ResultActions reserve(UUID eventId, String key, int qty)
            throws Exception {
        return mvc.perform(post("/events/" + eventId + "/reservations")
                .header("X-User-Id", USER_ID)
                .header("X-User-Email", EMAIL)
                .header("Idempotency-Key", key)
                .contentType("application/json")
                .content("{\"items\":[{\"ticket_type_id\":\"" + typeId(eventId) + "\",\"quantity\":" + qty + "}]}"));
    }

    @Test
    void totalZeroXacNhanMotBuocXuatVaToanBoTrongCungRequest() throws Exception {
        UUID eventId = freeEvent(10);
        when(codes.generate()).thenReturn("LUMA-1234-ABCD", "LUMA-5678-EF90");

        String body = reserve(eventId, "free-1", 2)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.registration_id").isString())
                .andExpect(jsonPath("$.tickets", org.hamcrest.Matchers.hasSize(2)))
                .andExpect(jsonPath("$.tickets[0].code",
                        org.hamcrest.Matchers.matchesPattern("^LUMA-[0-9A-F]{4}-[0-9A-F]{4}$")))
                .andExpect(jsonPath("$.tickets[0].ticket_type_name").value("FREE"))
                .andExpect(jsonPath("$.tickets[0].status").value("ISSUED"))
                .andReturn().getResponse().getContentAsString();

        String registrationId = com.jayway.jsonpath.JsonPath.read(body, "$.registration_id");
        assertThat(jdbc.queryForObject("SELECT status FROM reservations WHERE event_id = ?", String.class, eventId))
                .isEqualTo("CONFIRMED");
        assertThat(jdbc.queryForObject("SELECT sold FROM inventory WHERE ticket_type_id = ?",
                Integer.class, UUID.fromString(typeId(eventId)))).isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT reserved FROM inventory WHERE ticket_type_id = ?",
                Integer.class, UUID.fromString(typeId(eventId)))).isZero();

        List<String> eventTypes = jdbc.queryForList("""
                SELECT DISTINCT o.event_type FROM outbox_events o
                WHERE o.aggregate_id IN (
                    SELECT id FROM reservations WHERE event_id = ?
                    UNION SELECT reg.id FROM registrations reg JOIN reservations res ON res.id = reg.reservation_id WHERE res.event_id = ?
                    UNION SELECT tc.id FROM tickets tc JOIN registrations reg ON reg.id = tc.registration_id
                        JOIN reservations res ON res.id = reg.reservation_id WHERE res.event_id = ?)""",
                String.class, eventId, eventId, eventId);
        // Nhánh miễn phí: không có message nào hướng Payment (quyết định 2).
        assertThat(eventTypes).containsExactlyInAnyOrder("RegistrationConfirmed", "TicketIssued");

        JsonNode confirmed = JSON.readTree(jdbc.queryForObject(
                "SELECT payload::text FROM outbox_events WHERE event_type = 'RegistrationConfirmed' AND aggregate_id = ?",
                String.class, UUID.fromString(registrationId)));
        for (String field : List.of("registration_id", "reservation_id", "event_id", "recipient_email",
                "event_title", "event_starts_at", "total_amount")) {
            assertThat(confirmed.hasNonNull(field)).as(field).isTrue();
        }
        assertThat(confirmed.get("total_amount").asText()).isEqualTo("0.00");

        List<JsonNode> issued = jdbc.queryForList(
                "SELECT payload::text FROM outbox_events WHERE event_type = 'TicketIssued'", String.class)
                .stream().map(s -> {
                    try {
                        return JSON.readTree(s);
                    } catch (Exception e) {
                        throw new IllegalStateException(e);
                    }
                }).toList();
        assertThat(issued).hasSize(2);
        for (JsonNode ticket : issued) {
            for (String field : List.of("ticket_id", "code", "registration_id", "event_id", "ticket_type_name",
                    "recipient_email", "event_title", "event_starts_at")) {
                assertThat(ticket.hasNonNull(field)).as(field).isTrue();
            }
            assertThat(ticket.get("recipient_email").asText()).isEqualTo(EMAIL);
        }
    }

    @Test
    void cungKeyTraLaiDungNganMaVeDaXuat() throws Exception {
        UUID eventId = freeEvent(10);
        when(codes.generate()).thenReturn("LUMA-AAAA-1111", "LUMA-BBBB-2222",
                "LUMA-CCCC-3333", "LUMA-DDDD-4444");

        String first = reserve(eventId, "free-replay", 2)
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        String second = reserve(eventId, "free-replay", 2)
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();

        List<String> firstCodes = com.jayway.jsonpath.JsonPath.read(first, "$.tickets[*].code");
        List<String> secondCodes = com.jayway.jsonpath.JsonPath.read(second, "$.tickets[*].code");
        String firstReg = com.jayway.jsonpath.JsonPath.read(first, "$.registration_id");
        String secondReg = com.jayway.jsonpath.JsonPath.read(second, "$.registration_id");
        assertThat(secondReg).isEqualTo(firstReg);
        assertThat(secondCodes).containsExactlyInAnyOrderElementsOf(firstCodes);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM tickets WHERE registration_id = ?",
                Integer.class, UUID.fromString(com.jayway.jsonpath.JsonPath.read(first, "$.registration_id"))))
                .isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT sold FROM inventory WHERE ticket_type_id = ?",
                Integer.class, UUID.fromString(typeId(eventId)))).isEqualTo(2);
    }

    @Test
    void codeTrungUNIQUEThiSinhLaiTrongCungTransactionKhong500() throws Exception {
        // Gài trước một vé có code LUMA-0000-0000 để buộc va chạm UNIQUE.
        UUID dummyRes = UUID.randomUUID();
        UUID dummyReg = UUID.randomUUID();
        UUID dummyTicket = UUID.randomUUID();
        UUID eventId = freeEvent(10);
        String type = typeId(eventId);
        jdbc.update("""
                INSERT INTO reservations (id, user_id, recipient_email, event_id, status, idempotency_key)
                VALUES (?, ?, ?, ?, 'CONFIRMED', 'dummy-chain')""",
                dummyRes, UUID.fromString(USER_ID), "dummy@test.local", eventId);
        jdbc.update("INSERT INTO registrations (id, reservation_id, user_id, status) VALUES (?, ?, ?, 'CONFIRMED')",
                dummyReg, dummyRes, UUID.fromString(USER_ID));
        jdbc.update("INSERT INTO tickets (id, registration_id, ticket_type_id, code) VALUES (?, ?, ?, 'LUMA-0000-0000')",
                dummyTicket, dummyReg, UUID.fromString(type));

        when(codes.generate()).thenReturn("LUMA-0000-0000", "LUMA-0000-0000", "LUMA-9999-8888");

        reserve(eventId, "free-collision", 1)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tickets[0].code").value("LUMA-9999-8888"));

        assertThat(jdbc.queryForObject("SELECT count(*) FROM tickets WHERE code = 'LUMA-0000-0000'",
                Integer.class)).isEqualTo(1);
        TestData.deleteDummyChain(jdbc, dummyRes, dummyReg, dummyTicket);
    }
}
