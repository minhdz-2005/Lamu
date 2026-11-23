package com.luma.registration.ticketing;

import com.luma.registration.reservation.TestData;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 4.1 `GET /users/me/tickets`. Test không stub bất kỳ HTTP client nào: nếu service gọi sang
 * Event/Identity thì yêu cầu sẽ chết — cấu trúc này chính là bằng chứng "không lời gọi HTTP nào".
 */
@SpringBootTest
@AutoConfigureMockMvc
class MyTicketsQueryTest {

    @Autowired
    private MockMvc mvc;

    @Autowired
    private JdbcTemplate jdbc;

    private final List<UUID> createdEvents = new ArrayList<>();
    private final String userId = UUID.randomUUID().toString();
    private final String otherUserId = UUID.randomUUID().toString();

    @AfterEach
    void donDevDb() {
        TestData.deleteAll(jdbc, createdEvents);
        createdEvents.clear();
    }

    /** Event + một loại vé, starts_at chọn trước để kiểm tra thứ tự sắp tới/đã qua. */
    private UUID newEvent(Instant startsAt) {
        UUID eventId = UUID.randomUUID();
        createdEvents.add(eventId);
        TestData.insertSnapshot(jdbc, eventId, "PUBLISHED", startsAt);
        return eventId;
    }

    private UUID newTicketType(UUID eventId, String name) {
        return TestData.insertTicketType(jdbc, eventId, name, "150000.00", 100,
                Instant.now().minus(1, ChronoUnit.DAYS), Instant.now().plus(1, ChronoUnit.DAYS), "ACTIVE");
    }

    @Test
    void duTenFieldCuaCatalogVaKhongPhatSangEvent() throws Exception {
        UUID sapToi = newEvent(Instant.now().plus(3, ChronoUnit.DAYS));
        UUID ticketTypeId = newTicketType(sapToi, "VIP");
        String code = TestData.ticketCode();
        UUID ticketId = TestData.insertTicket(jdbc, sapToi, ticketTypeId, userId, code, "ISSUED", null);

        mvc.perform(get("/users/me/tickets").header("X-User-Id", userId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].ticket_id").value(ticketId.toString()))
                .andExpect(jsonPath("$[0].code").value(code))
                .andExpect(jsonPath("$[0].event_id").value(sapToi.toString()))
                .andExpect(jsonPath("$[0].event_title").value("Event test " + sapToi))
                .andExpect(jsonPath("$[0].event_slug").value("event-" + sapToi))
                .andExpect(jsonPath("$[0].event_starts_at").exists())
                .andExpect(jsonPath("$[0].event_status").value("PUBLISHED"))
                .andExpect(jsonPath("$[0].ticket_type_name").value("VIP"))
                .andExpect(jsonPath("$[0].status").value("ISSUED"))
                .andExpect(jsonPath("$[0].checked_in_at").doesNotExist());

        // checked_in_at null phải thành JSON null, không được xóa key khỏi mảng.
        assertThat(jdbc.queryForObject("SELECT count(*) FROM tickets WHERE id = ?", Integer.class, ticketId))
                .isEqualTo(1);
    }

    @Test
    void veEventDaQuaXepCuoiHonVeSapToi() throws Exception {
        UUID daQua = newEvent(Instant.now().minus(5, ChronoUnit.DAYS));
        UUID sapToi = newEvent(Instant.now().plus(5, ChronoUnit.DAYS));
        TestData.insertTicket(jdbc, daQua, newTicketType(daQua, "ECOMY"), userId, TestData.ticketCode(), "USED",
                Instant.now().minus(6, ChronoUnit.DAYS));
        TestData.insertTicket(jdbc, sapToi, newTicketType(sapToi, "VIP"), userId, TestData.ticketCode(), "ISSUED", null);

        mvc.perform(get("/users/me/tickets").header("X-User-Id", userId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].event_id").value(sapToi.toString()))
                .andExpect(jsonPath("$[1].event_id").value(daQua.toString()))
                .andExpect(jsonPath("$.length()").value(2));
    }

    @Test
    void veVoidedVanTraViApiQuyetDinhKhongPhaiUi() throws Exception {
        UUID eventId = newEvent(Instant.now().plus(1, ChronoUnit.DAYS));
        UUID ticketTypeId = newTicketType(eventId, "VIP");
        TestData.insertTicket(jdbc, eventId, ticketTypeId, userId, TestData.ticketCode(), "ISSUED", null);
        TestData.insertTicket(jdbc, eventId, ticketTypeId, userId, TestData.ticketCode(), "VOIDED", null);

        mvc.perform(get("/users/me/tickets").header("X-User-Id", userId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[?(@.status == 'VOIDED')]").exists());
    }

    @Test
    void khongLoVeCuaTaiKhoanKhac() throws Exception {
        UUID eventId = newEvent(Instant.now().plus(1, ChronoUnit.DAYS));
        UUID ticketTypeId = newTicketType(eventId, "VIP");
        UUID mine = TestData.insertTicket(jdbc, eventId, ticketTypeId, userId, TestData.ticketCode(), "ISSUED", null);
        UUID theirs = TestData.insertTicket(jdbc, eventId, ticketTypeId, otherUserId, TestData.ticketCode(), "ISSUED", null);

        String body = mvc.perform(get("/users/me/tickets").header("X-User-Id", userId))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        assertThat(body).contains(mine.toString()).doesNotContain(theirs.toString());
    }

    @Test
    void thieuHeaderDanhTinhThi401Unauthenticated() throws Exception {
        mvc.perform(get("/users/me/tickets"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error.code").value("UNAUTHENTICATED"));
    }

    @Test
    void headerDanhTinhKhongPhaiUuidThi401ChuKhongPhai500() throws Exception {
        mvc.perform(get("/users/me/tickets").header("X-User-Id", "not-a-uuid"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error.code").value("UNAUTHENTICATED"));
    }
}
