package com.luma.registration.common.messaging;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.luma.registration.common.web.RequestIdFilter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.amqp.core.Message;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import java.io.IOException;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

import com.rabbitmq.client.Channel;

/**
 * Khung tiêu chung cho hai queue: chống trùng bằng `processed_messages` theo header `message_id`
 * (BR-ASY-02), handler + ghi dấu trong MỘT transaction, ack sau commit, lỗi thì thử lại trong tiến
 * trình 1s → 5s → 25s rồi nack(requeue=false) sang DLQ (BR-ASY-03, messaging §8).
 */
@Component
public class IdempotentConsumer {

    public enum Result {
        PROCESSED,
        /** Message đúng schema nhưng trạng thái dữ liệu khiến không việc gì phải làm — ack, ghi log, không retry. */
        SKIPPED
    }

    public interface Handler {
        Result handle(Envelope envelope);
    }

    private static final Logger log = LoggerFactory.getLogger(IdempotentConsumer.class);

    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    private final ObjectMapper mapper;
    private final long[] retryDelaysMs;

    public IdempotentConsumer(JdbcTemplate jdbc, TransactionTemplate tx, ObjectMapper mapper,
                              @Value("${app.consumer.retry-delays-ms}") long[] retryDelaysMs) {
        this.jdbc = jdbc;
        this.tx = tx;
        this.mapper = mapper;
        this.retryDelaysMs = retryDelaysMs;
    }

    public void consume(Message message, Channel channel, Handler handler) throws IOException {
        long deliveryTag = message.getMessageProperties().getDeliveryTag();
        Envelope envelope;
        try {
            envelope = Envelope.parse(message, mapper);
        } catch (Envelope.InvalidEnvelope malformed) {
            // Retry không sửa được schema hỏng: vào DLQ ngay để ops đọc header mà định vị.
            log.error("envelope không hợp lệ ({}), nack sang DLQ mà không thử lại — message_id={}",
                    malformed.getMessage(), message.getMessageProperties().getMessageId());
            channel.basicNack(deliveryTag, false, false);
            return;
        }
        UUID messageId = envelope.eventId();
        String previousRequestId = MDC.get(RequestIdFilter.MDC_KEY);
        MDC.put(RequestIdFilter.MDC_KEY,
                envelope.correlationId() == null ? messageId.toString() : envelope.correlationId());
        try {
            for (int attempt = 0; ; attempt++) {
                try {
                    Boolean processed = tx.execute(status -> {
                        int marked = jdbc.update("INSERT INTO processed_messages (message_id) VALUES (?) "
                                + "ON CONFLICT DO NOTHING", messageId);
                        if (marked == 0) {
                            log.info("message_id {} đã tiêu trước đó — bỏ qua, không ghi lặp (BR-ASY-02)", messageId);
                            return false;
                        }
                        return handler.handle(envelope) == Result.PROCESSED;
                    });
                    channel.basicAck(deliveryTag, false);
                    if (Boolean.FALSE.equals(processed)) {
                        log.info("message_id {} không có việc phải làm với trạng thái hiện tại — ack và bỏ qua, "
                                + "request_id={}", messageId, MDC.get(RequestIdFilter.MDC_KEY));
                    }
                    return;
                } catch (RuntimeException failure) {
                    if (attempt >= retryDelaysMs.length) {
                        log.error("message_id {} thất bại sau {} lần thử, nack sang DLQ: {}",
                                messageId, attempt + 1, failure.toString());
                        channel.basicNack(deliveryTag, false, false);
                        return;
                    }
                    log.warn("message_id {} thất bại lần {}, thử lại sau {}ms: {}",
                            messageId, attempt + 1, retryDelaysMs[attempt], failure.toString());
                    try {
                        TimeUnit.MILLISECONDS.sleep(retryDelaysMs[attempt]);
                    } catch (InterruptedException interruptDuringRetry) {
                        Thread.currentThread().interrupt();
                        log.error("message_id {} bị cắt lúc nghỉ giữa hai lần thử, nack sang DLQ", messageId);
                        channel.basicNack(deliveryTag, false, false);
                        return;
                    }
                }
            }
        } finally {
            if (previousRequestId == null) {
                MDC.remove(RequestIdFilter.MDC_KEY);
            } else {
                MDC.put(RequestIdFilter.MDC_KEY, previousRequestId);
            }
        }
    }
}
