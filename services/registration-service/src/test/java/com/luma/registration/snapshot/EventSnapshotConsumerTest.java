package com.luma.registration.snapshot;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.luma.registration.common.messaging.Await;
import com.luma.registration.common.messaging.IdempotentConsumer;
import com.luma.registration.common.messaging.TestMessages;
import com.luma.registration.common.messaging.TopologyConfig;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.core.QueueInformation;
import org.springframework.amqp.rabbit.core.RabbitAdmin;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 3.2 — consumer `registration.event-snapshot` trên broker dev thật: publish đúng schema thì projection
 * có hàng; trùng `message_id` thì không ghi lần hai; payload thiếu field bắt buộc thì sau ba lần thử
 * rơi sang DLQ và dấu đã tiêu không còn lại (rollback cùng transaction, BR-ASY-02/03).
 */
@SpringBootTest
class EventSnapshotConsumerTest {

    @Autowired
    private RabbitTemplate rabbit;

    @Autowired
    private RabbitAdmin admin;

    @Autowired
    private JdbcTemplate jdbc;

    private final UUID eventId = UUID.randomUUID();
    private final UUID orgId = UUID.randomUUID();
    private final List<UUID> created = new ArrayList<>();
    private ListAppender<ILoggingEvent> logs;

    @BeforeEach
    void donSan() {
        created.add(eventId);
        admin.purgeQueue(TopologyConfig.SNAPSHOT_QUEUE + ".dlq", true);
        logs = new ListAppender<>();
        logs.start();
        ((Logger) LoggerFactory.getLogger(IdempotentConsumer.class)).addAppender(logs);
    }

    @AfterEach
    void donTheo() {
        ((Logger) LoggerFactory.getLogger(IdempotentConsumer.class)).detachAppender(logs);
        created.forEach(id -> jdbc.update("DELETE FROM event_snapshot WHERE event_id = ?", id));
        created.clear();
    }

    /** Depth của DLQ snapshot — 0 khi queue chưa có message nào nằm lại sau purge. */
    private long dlqDepth() {
        QueueInformation dlq = admin.getQueueInfo(TopologyConfig.SNAPSHOT_QUEUE + ".dlq");
        return dlq == null ? 0 : dlq.getMessageCount();
    }

    private long countLogLines(String needle) {
        return logs.list.stream().filter(e -> e.getFormattedMessage().contains(needle)).count();
    }

    private Map<String, Object> payload(String title, boolean withOrganization) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("event_id", eventId.toString());
        if (withOrganization) {
            payload.put("organization_id", orgId.toString());
        }
        payload.put("slug", "slug-" + eventId);
        payload.put("title", title);
        payload.put("status", "PUBLISHED");
        payload.put("starts_at", Instant.now().plus(1, ChronoUnit.DAYS).toString());
        payload.put("ends_at", Instant.now().plus(2, ChronoUnit.DAYS).toString());
        return payload;
    }

    private String fieldOf(UUID target, String column) {
        List<String> rows = jdbc.query("SELECT " + column + "::text FROM event_snapshot WHERE event_id = ?",
                (rs, n) -> rs.getString(1), target);
        return rows.isEmpty() ? null : rows.getFirst();
    }

    private String snapshotField(String column) {
        return fieldOf(eventId, column);
    }

    @Test
    void eventPublishedTuBrokerDayDuProjectionVaOrganizationId() {
        assertThat(snapshotField("title")).isNull();

        TestMessages.published(rabbit, TopologyConfig.EVENT_EXCHANGE, "event.published.v1",
                "EventPublished", eventId, payload("Lunch and Learn", true), "req-snap-1");
        Await.until("event_snapshot có hàng", () -> "Lunch and Learn".equals(snapshotField("title")));

        assertThat(snapshotField("organization_id")).isEqualTo(orgId.toString());
        assertThat(snapshotField("status")).isEqualTo("PUBLISHED");
        assertThat(snapshotField("slug")).isEqualTo("slug-" + eventId);
    }

    @Test
    void cungMessageIdLanHaiBiChanGhiDe() {
        String messageId = TestMessages.published(rabbit, TopologyConfig.EVENT_EXCHANGE, "event.published.v1",
                "EventPublished", eventId, payload("Tên gốc", true), "req-snap-2");
        Await.until("lần tiêu đầu tiên", () -> "Tên gốc".equals(snapshotField("title")));

        // Body hợp lệ, chỉ message_id lặp lại: chặn trùng phải do header, không do JSON hỏng.
        TestMessages.publishRaw(rabbit, TopologyConfig.EVENT_EXCHANGE, "event.published.v1",
                TestMessages.envelope(messageId, "EventPublished", eventId, payload("Tên đổi sau", true)),
                messageId, "req-snap-2b");
        Await.until("consumer báo đã tiêu trước đó", () -> countLogLines(messageId + " đã tiêu trước đó") == 1);

        assertThat(snapshotField("title")).as("message_id trùng => consumer bỏ qua").isEqualTo("Tên gốc");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM processed_messages WHERE message_id = ?",
                Integer.class, UUID.fromString(messageId))).isEqualTo(1);
    }

    @Test
    void eventUpdatedKhongToChucThiOrganizationIdGiGiaTriCu() {
        TestMessages.published(rabbit, TopologyConfig.EVENT_EXCHANGE, "event.published.v1",
                "EventPublished", eventId, payload("Tên gốc", true), "req-snap-3");
        Await.until("snapshot có tổ chức", () -> orgId.toString().equals(snapshotField("organization_id")));

        Map<String, Object> updated = payload("Tên mới", false);
        updated.put("slug", "slug-moi");
        TestMessages.published(rabbit, TopologyConfig.EVENT_EXCHANGE, "event.updated.v1",
                "EventUpdated", eventId, updated, "req-snap-4");
        Await.until("title đổi theo EventUpdated", () -> "Tên mới".equals(snapshotField("title")));

        assertThat(snapshotField("slug")).isEqualTo("slug-moi");
        assertThat(snapshotField("organization_id")).as("BR-ASY-05: payload không mang thì giữ cũ")
                .isEqualTo(orgId.toString());
    }

    @Test
    void payloadThieuTitleXuongDlqSauBaLanThuVaKhongDeLaiDauTieu() {
        Map<String, Object> broken = payload("Sẽ không ghi được", true);
        broken.remove("title");
        String messageId = TestMessages.published(rabbit, TopologyConfig.EVENT_EXCHANGE, "event.published.v1",
                "EventPublished", eventId, broken, "req-snap-5");

        Await.until("message hỏng nằm lại DLQ", () -> dlqDepth() >= 1);

        assertThat(countLogLines(messageId + " thất bại lần"))
                .as("messaging §8: retry trong tiến trình trước khi nack").isEqualTo(3);
        assertThat(countLogLines(messageId + " thất bại sau 4 lần thử, nack sang DLQ")).isEqualTo(1);
        assertThat(snapshotField("title")).isNull();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM processed_messages WHERE message_id = ?",
                Integer.class, UUID.fromString(messageId)))
                .as("ghi dấu đã tiêu rollback cùng handler").isZero();
    }

    @Test
    void envelopeThieuMessageIdXuongDlqNgayKhongThuLai() {
        rabbit.convertAndSend(TopologyConfig.EVENT_EXCHANGE, "event.published.v1",
                "{\"event_id\":\"" + UUID.randomUUID() + "\",\"event_type\":\"EventPublished\","
                        + "\"version\":1,\"occurred_at\":\"" + Instant.now() + "\",\"aggregate_type\":\"event\","
                        + "\"aggregate_id\":\"" + eventId + "\",\"producer\":\"event\",\"payload\":{}}");

        Await.until("poison message vào DLQ", () -> dlqDepth() >= 1);
        assertThat(countLogLines("thiếu header message_id), nack sang DLQ mà không thử lại"))
                .as("schema hỏng thì retry vô nghĩa — vào DLQ ngay").isEqualTo(1);
        assertThat(countLogLines("thử lại sau")).isZero();
        assertThat(snapshotField("title")).isNull();
    }
}
