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

import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// @MockitoBean tạo context riêng; nếu nó còn sống thì consumer của nó tranh tiêu message
// trên cùng hàng đợi dev với các test consumer. Đóng ngay sau class.
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
@SpringBootTest
@AutoConfigureMockMvc
class TicketCheckInTest {

    private static final Instant LAN_MOT = Instant.parse("2026-12-01T11:04:00Z");

    @Autowired
    private MockMvc mvc;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private TicketService service;

    @MockitoBean
    private AuthorizationClient authorization;

    private final List<UUID> createdEvents = new ArrayList<>();
    private final List<String> orgIds = new ArrayList<>();
    private final String organizer = UUID.randomUUID().toString();

    @AfterEach
    void donDevDb() {
        TestData.deleteAll(jdbc, createdEvents);
        createdEvents.clear();
        orgIds.clear();
    }

    private record Fixture(UUID eventId, UUID ticketId, String code) {
    }

    private Fixture newTicket(String status) {
        UUID eventId = UUID.randomUUID();
        createdEvents.add(eventId);
        orgIds.add(TestData.insertSnapshot(jdbc, eventId, "PUBLISHED"));
        UUID ticketTypeId = TestData.insertTicketType(jdbc, eventId, "VIP", "150000.00", 100,
                Instant.now().minus(1, ChronoUnit.DAYS), Instant.now().plus(1, ChronoUnit.DAYS), "ACTIVE");
        String code = TestData.ticketCode();
        UUID ticketId = TestData.insertTicket(jdbc, eventId, ticketTypeId, UUID.randomUUID().toString(),
                code, status, "USED".equals(status) ? LAN_MOT : null);
        return new Fixture(eventId, ticketId, code);
    }

    private ResultActions checkIn(String code) throws Exception {
        return mvc.perform(post("/tickets/check-in")
                .header("X-User-Id", organizer)
                .contentType("application/json")
                .content("{\"code\":\"" + code + "\"}"));
    }

    private Timestamp checkedInAt(UUID ticketId) {
        return jdbc.queryForObject("SELECT checked_in_at FROM tickets WHERE id = ?", Timestamp.class, ticketId);
    }

    @Test
    void maVietThuongKemKhoangVanTraUsed() throws Exception {
        Fixture ticket = newTicket("ISSUED");

        // BR-FMT-16: nhân viên gõ mã in trên tem, hoa/thường và khoảng trắng thừa không được làm hỏng tra cứu.
        checkIn("  " + ticket.code().toLowerCase(Locale.ROOT) + " ")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ticket_id").value(ticket.ticketId().toString()))
                .andExpect(jsonPath("$.status").value("USED"))
                .andExpect(jsonPath("$.event_id").value(ticket.eventId().toString()))
                .andExpect(jsonPath("$.event_title").value("Event test " + ticket.eventId()))
                .andExpect(jsonPath("$.ticket_type_name").value("VIP"))
                .andExpect(jsonPath("$.checked_in_at").exists());

        assertThat(jdbc.queryForObject("SELECT status FROM tickets WHERE id = ?", String.class, ticket.ticketId()))
                .isEqualTo("USED");
        assertThat(checkedInAt(ticket.ticketId())).isNotNull();
        // Quyền hỏi trên event SỞ HỮU mã vé (không phải event nào đó người gọi chọn).
        verify(authorization).requireEventPermission(organizer, orgIds.getFirst(),
                ticket.eventId().toString(), "ticket.checkin");
    }

    @Test
    void veDaUsedThi409KemDungTimestampRfc3339TrongMessage() throws Exception {
        Fixture ticket = newTicket("USED");

        checkIn(ticket.code())
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("ALREADY_CHECKED_IN"))
                // catalog §3: UI in nguyên văn message, server đã nhét timestamp lần check-in trước vào.
                .andExpect(jsonPath("$.error.message").value("Mã vé đã được check-in lúc 2026-12-01T11:04:00Z."));

        assertThat(checkedInAt(ticket.ticketId())).isEqualTo(Timestamp.from(LAN_MOT));
    }

    @Test
    void checkInLiveLanHaiThi409KhongDeLanCuaLanMot() throws Exception {
        Fixture ticket = newTicket("ISSUED");
        checkIn(ticket.code()).andExpect(status().isOk());
        Timestamp lanMot = checkedInAt(ticket.ticketId());

        checkIn(ticket.code())
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("ALREADY_CHECKED_IN"))
                .andExpect(jsonPath("$.error.message").value(org.hamcrest.Matchers.matchesPattern(
                        "Mã vé đã được check-in lúc \\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z\\.")));

        assertThat(checkedInAt(ticket.ticketId())).isEqualTo(lanMot);
    }

    @Test
    void veVoidedThi409TicketVoided() throws Exception {
        Fixture ticket = newTicket("VOIDED");

        checkIn(ticket.code())
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("TICKET_VOIDED"))
                .andExpect(jsonPath("$.error.message").value("Vé đã bị hủy vì sự kiện bị hủy."));
    }

    @Test
    void maLaThi404() throws Exception {
        checkIn("LUMA-FFFF-9FFF").andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("NOT_FOUND"));
    }

    @Test
    void codeRongThi400ValidationFailed() throws Exception {
        checkIn("").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("VALIDATION_FAILED"));
    }

    @Test
    void thieuHeaderDanhTinhThi401() throws Exception {
        mvc.perform(post("/tickets/check-in").contentType("application/json")
                        .content("{\"code\":\"LUMA-0000-0000\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error.code").value("UNAUTHENTICATED"));
    }

    @Test
    void identityTuChoiQuyenThi403VaVeVanLaIssued() throws Exception {
        Fixture ticket = newTicket("ISSUED");
        doThrow(new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN", "Tài khoản không được phép thực hiện yêu cầu này."))
                .when(authorization).requireEventPermission(anyString(), anyString(), anyString(), anyString());

        checkIn(ticket.code()).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("FORBIDDEN"));

        assertThat(jdbc.queryForObject("SELECT status FROM tickets WHERE id = ?", String.class, ticket.ticketId()))
                .isEqualTo("ISSUED");
    }

    /** Hai transaction đua trên cùng một hàng vé: `FOR UPDATE` phải khiến đúng một bên được 200. */
    @Test
    void haiMayQuetCungMotMaChiMotRequestDucThanhUsed() throws Exception {
        Fixture ticket = newTicket("ISSUED");
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            List<Callable<String>> both = List.of(() -> race(ticket.code()), () -> race(ticket.code()));
            List<Future<String>> futures = pool.invokeAll(both);
            assertThat(List.of(futures.get(0).get(), futures.get(1).get()))
                    .containsExactlyInAnyOrder("OK", "ALREADY_CHECKED_IN");
        } finally {
            pool.shutdownNow();
        }
        assertThat(jdbc.queryForObject(
                "SELECT count(*) FROM tickets WHERE id = ? AND status = 'USED'", Integer.class, ticket.ticketId()))
                .isEqualTo(1);
    }

    @Test
    void checkInKhongPhatEventTheoCatalog() throws Exception {
        Fixture ticket = newTicket("ISSUED");
        checkIn(ticket.code()).andExpect(status().isOk());

        assertThat(jdbc.queryForObject(
                "SELECT count(*) FROM outbox_events WHERE aggregate_id = ?", Integer.class, ticket.ticketId()))
                .isZero();
    }

    /** Gọi thẳng service vì MockMvc không an toàn khi hai luồng bắn cùng lúc. */
    private String race(String code) {
        try {
            service.checkIn(code, organizer);
            return "OK";
        } catch (ApiException e) {
            return e.getCode();
        }
    }
}
