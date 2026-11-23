package com.luma.registration.reservation;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;

import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 5.2 — bằng chứng tuần 3 (architecture §6, business-rules §200 request): 200 request giữ chỗ
 * ĐỒNG THỜI trên loại vé capacity 100, bắn qua HTTP thật (RANDOM_PORT) để Tomcat + Hikari (pool 10,
 * cố ý không tăng — hàng đợi nằm ở pool) chịu tải thật.
 *
 * CONTEXT KEY KHÁC các test khác (webEnvironment) nên phải đóng sau class: nếu còn sống, hai listener
 * Rabbit của nó tranh tiêu message trên cùng hàng đợi dev với các test consumer.
 */
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        // Cổng nghe mặc định nhận backlog 100; 200 SYN cùng lúc làm Windows từ chối thẳng (WSAECONNREFUSED)
        // thay vì xếp hàng, nên test nâng backlog lên trên số request. Đây là cấu hình của harness tải,
        // không đổi code production và không che lỗi quota (SOLD_OUT vẫn phải đúng 100).
        properties = "server.tomcat.accept-count=512")
class ConcurrentReservationLoadTest {

    private static final int REQUESTS = 200;
    private static final int CAPACITY = 100;

    @Autowired
    private TestRestTemplate rest;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private ObjectMapper json;

    private final List<UUID> createdEvents = new ArrayList<>();

    @AfterEach
    void donDevDb() {
        TestData.deleteAll(jdbc, createdEvents);
        createdEvents.clear();
    }

    @Test
    void haiTramRequestDongThoiTrenCapacityMotTramKhongVuotQuota() throws Exception {
        UUID eventId = UUID.randomUUID();
        createdEvents.add(eventId);
        TestData.insertSnapshot(jdbc, eventId, "PUBLISHED");
        UUID ticketTypeId = TestData.insertTicketType(jdbc, eventId, "VIP", "150000.00", CAPACITY,
                Instant.now().minus(1, ChronoUnit.DAYS), Instant.now().plus(1, ChronoUnit.DAYS), "ACTIVE");

        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(10));
        factory.setReadTimeout(Duration.ofSeconds(120));
        rest.getRestTemplate().setRequestFactory(factory);

        ExecutorService pool = Executors.newFixedThreadPool(REQUESTS);
        CountDownLatch gate = new CountDownLatch(1);
        List<Future<String>> futures = new ArrayList<>();
        try {
            for (int i = 0; i < REQUESTS; i++) {
                String userId = UUID.randomUUID().toString();
                String idempotencyKey = "load-" + UUID.randomUUID();
                futures.add(pool.submit(() -> {
                    gate.await();
                    return shoot(eventId, ticketTypeId, userId, idempotencyKey);
                }));
            }
            long startedAt = System.nanoTime();
            gate.countDown();
            List<String> outcomes = new ArrayList<>();
            for (Future<String> future : futures) {
                outcomes.add(future.get());
            }
            long millis = Duration.ofNanos(System.nanoTime() - startedAt).toMillis();

            long thanhCong = outcomes.stream().filter("OK"::equals).count();
            long soldOut = outcomes.stream().filter("SOLD_OUT"::equals).count();
            assertThat(outcomes).as("mọi request chỉ được phân loại OK hoặc SOLD_OUT")
                    .allMatch(outcome -> outcome.equals("OK") || outcome.equals("SOLD_OUT"));
            assertThat(thanhCong).as("đúng %d request thắng quota".formatted(CAPACITY)).isEqualTo(CAPACITY);
            assertThat(soldOut).as("%d request còn lại phải là SOLD_OUT", REQUESTS - CAPACITY)
                    .isEqualTo(REQUESTS - CAPACITY);

            Map<String, Object> inventory = jdbc.queryForMap(
                    "SELECT sold, reserved FROM inventory WHERE ticket_type_id = ?", ticketTypeId);
            int sold = ((Number) inventory.get("sold")).intValue();
            int reserved = ((Number) inventory.get("reserved")).intValue();
            // BR-INV-01/02: bất biến tồn kho vẫn đúng sau khi hai trăm transaction đua nhau.
            assertThat(sold + reserved).isEqualTo(CAPACITY);

            Integer reservations = jdbc.queryForObject(
                    "SELECT count(*) FROM reservations WHERE event_id = ?", Integer.class, eventId);
            Integer distinctKeys = jdbc.queryForObject("""
                    SELECT count(DISTINCT idempotency_key) FROM reservations WHERE event_id = ?""",
                    Integer.class, eventId);
            assertThat(reservations).isEqualTo(CAPACITY);
            assertThat(distinctKeys).as("0 reservation trùng Idempotency-Key").isEqualTo(CAPACITY);

            System.out.printf("[5.2] %d request đồng thời / capacity %d -> %d thành công, %d SOLD_OUT, "
                            + "sold+reserved=%d, reservations=%d, idempotency_key distinct=%d (%d ms)%n",
                    REQUESTS, CAPACITY, thanhCong, soldOut, sold + reserved, reservations, distinctKeys, millis);
        } finally {
            pool.shutdownNow();
        }
    }

    /** Một phát bắn: trả "OK" hoặc mã lỗi, những đường khác trả nguyên "<status>:<code>" để fail loudly. */
    private String shoot(UUID eventId, UUID ticketTypeId, String userId, String idempotencyKey) throws Exception {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.set("X-User-Id", userId);
        headers.set("X-User-Email", "load@test.local");
        headers.set("Idempotency-Key", idempotencyKey);
        String body = "{\"items\":[{\"ticket_type_id\":\"" + ticketTypeId + "\",\"quantity\":1}]}";

        ResponseEntity<String> response = rest.exchange("/events/" + eventId + "/reservations",
                HttpMethod.POST, new HttpEntity<>(body, headers), String.class);
        if (response.getStatusCode().is2xxSuccessful()) {
            return "OK";
        }
        String code = json.readTree(response.getBody()).path("error").path("code").asText("");
        return "SOLD_OUT".equals(code) ? "SOLD_OUT" : response.getStatusCode().value() + ":" + code;
    }
}
