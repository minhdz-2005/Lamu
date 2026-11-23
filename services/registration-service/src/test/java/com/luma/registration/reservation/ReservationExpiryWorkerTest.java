package com.luma.registration.reservation;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 3.5 — worker hết hạn: `expires_at` quá là nhả `reserved` và phát `ReservationReleased(EXPIRED)`;
 * `FOR UPDATE SKIP LOCKED` bảo đảm hai tiến trình cùng quét không nhả một chỗ hai lần (BR-RSV-04).
 * Scheduling nền tắt trong context này, test tự gọi `releaseOverdue()`.
 */
@SpringBootTest
class ReservationExpiryWorkerTest {

    @Autowired
    private ReservationService service;

    @Autowired
    private ReservationExpiryWorker worker;

    @Autowired
    private JdbcTemplate jdbc;

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

    private String reserveOverdue(String key, int quantity) {
        String reservationId = ((ReservationService.HeldResponse) service.reserve(
                new ReservationService.Command("11111111-1111-1111-1111-111111111111", "expire@test.local",
                        eventId, List.of(new ReservationService.ItemInput(paidType.toString(), quantity)), key)))
                .reservationId();
        jdbc.update("UPDATE reservations SET expires_at = now() - interval '10 seconds' WHERE id = ?",
                UUID.fromString(reservationId));
        return reservationId;
    }

    private int reserved() {
        Integer value = jdbc.queryForObject("SELECT reserved FROM inventory WHERE ticket_type_id = ?",
                Integer.class, paidType);
        return value == null ? 0 : value;
    }

    private int count(String sql, Object... args) {
        Integer value = jdbc.queryForObject(sql, Integer.class, args);
        return value == null ? 0 : value;
    }

    @Test
    void quaHanThiTuNhaChoVaPhatLyDoExpired() {
        String reservationId = reserveOverdue("exp-1", 3);
        assertThat(reserved()).isEqualTo(3);
        jdbc.update("DELETE FROM outbox_events");

        worker.releaseOverdue();

        assertThat(jdbc.queryForObject("SELECT status FROM reservations WHERE id = ?", String.class,
                UUID.fromString(reservationId))).isEqualTo("RELEASED");
        assertThat(reserved()).isZero();
        assertThat(count("SELECT count(*) FROM outbox_events WHERE event_type = 'ReservationReleased' "
                + "AND payload->>'reason' = 'EXPIRED' AND aggregate_id = ?", UUID.fromString(reservationId)))
                .isEqualTo(1);
    }

    @Test
    void conHanGiuKhongBiDong() {
        String fresh = ((ReservationService.HeldResponse) service.reserve(
                new ReservationService.Command("11111111-1111-1111-1111-111111111111", "keep@test.local",
                        eventId, List.of(new ReservationService.ItemInput(paidType.toString(), 2)), "exp-fresh")))
                .reservationId();

        worker.releaseOverdue();

        assertThat(jdbc.queryForObject("SELECT status FROM reservations WHERE id = ?", String.class,
                UUID.fromString(fresh))).isEqualTo("HELD");
        assertThat(reserved()).isEqualTo(2);
    }

    @Test
    void haiTienTrinhCungQuetKhongNhaMotChoHaiLan() throws Exception {
        List<String> reservations = new ArrayList<>();
        for (int i = 0; i < 8; i++) {
            reservations.add(reserveOverdue("exp-race-" + i, 1));
        }
        assertThat(reserved()).isEqualTo(8);
        jdbc.update("DELETE FROM outbox_events");

        ExecutorService pool = Executors.newFixedThreadPool(2);
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch go = new CountDownLatch(1);
        AtomicInteger failures = new AtomicInteger();
        List<java.util.concurrent.Future<?>> running = new ArrayList<>();
        for (int thread = 0; thread < 2; thread++) {
            running.add(pool.submit(() -> {
                ready.countDown();
                try {
                    go.await();
                    worker.releaseOverdue();
                    worker.releaseOverdue();
                } catch (Exception e) {
                    failures.incrementAndGet();
                }
            }));
        }
        ready.await();
        go.countDown();
        pool.shutdown();
        assertThat(pool.awaitTermination(30, TimeUnit.SECONDS)).isTrue();
        for (var future : running) {
            future.get();
        }
        assertThat(failures.get()).as("hai tiến trình quét song song không được lỗi").isZero();

        assertThat(reserved()).isZero();
        assertThat(count("SELECT count(*) FROM reservations WHERE status = 'RELEASED' AND event_id = ?", eventId))
                .isEqualTo(8);
        assertThat(count("SELECT count(*) FROM outbox_events WHERE event_type = 'ReservationReleased' "
                + "AND payload->>'reason' = 'EXPIRED'")).as("outbox không nhân đôi").isEqualTo(8);
        assertThat(count("SELECT count(*) FROM (SELECT aggregate_id FROM outbox_events GROUP BY aggregate_id "
                + "HAVING count(*) > 1) duplicates")).isZero();
    }
}
