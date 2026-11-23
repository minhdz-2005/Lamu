package com.luma.registration.saga;

import com.fasterxml.jackson.databind.JsonNode;
import com.luma.registration.common.messaging.Envelope;
import com.luma.registration.common.messaging.IdempotentConsumer;
import com.luma.registration.reservation.ReservationService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.UUID;

/**
 * Đường confirm duy nhất của vé có phí (BR-RSV-01): `PaymentSucceeded` → confirm, `PaymentFailed` →
 * nhả chỗ. Reservation không còn `HELD` thì ack và bỏ qua, không xuất vé, không đổi quota, log kèm
 * `request_id` (BR-RSV-02, messaging §9) — chống trùng theo message_id không chặn được ca hai message
 * khác `event_id` cùng trỏ một reservation, phải chặn bằng trạng thái.
 */
@Service
public class PaymentSagaService {

    private static final Logger log = LoggerFactory.getLogger(PaymentSagaService.class);

    private final ReservationService reservations;

    public PaymentSagaService(ReservationService reservations) {
        this.reservations = reservations;
    }

    public IdempotentConsumer.Result apply(Envelope envelope) {
        JsonNode payload = envelope.payload();
        UUID reservationId = uuid(payload.path("reservation_id").asText(null), "reservation_id");
        return switch (envelope.eventType()) {
            case "PaymentSucceeded" -> succeeded(envelope, payload, reservationId);
            case "PaymentFailed" -> failed(envelope, payload, reservationId);
            default -> {
                log.warn("event_type '{}' không thuộc bảng routing của queue saga — ack, bỏ qua",
                        envelope.eventType());
                yield IdempotentConsumer.Result.SKIPPED;
            }
        };
    }

    private IdempotentConsumer.Result succeeded(Envelope envelope, JsonNode payload, UUID reservationId) {
        ReservationService.ConfirmResult result = reservations.confirm(reservationId, null);
        if ("CONFIRMED".equals(result.outcome())) {
            log.info("PaymentSucceeded payment={} confirm reservation={} issued={}",
                    payload.path("payment_id").asText(null), reservationId, result.issued().tickets().size());
            return IdempotentConsumer.Result.PROCESSED;
        }
        log.info("PaymentSucceeded payment={} bị bỏ qua với reservation={} ({}), request_id={}",
                payload.path("payment_id").asText(null), reservationId, result.outcome(), envelope.correlationId());
        return IdempotentConsumer.Result.SKIPPED;
    }

    private IdempotentConsumer.Result failed(Envelope envelope, JsonNode payload, UUID reservationId) {
        String outcome = reservations.failPayment(reservationId);
        if ("RELEASED".equals(outcome)) {
            log.info("PaymentFailed payment={} nhả reservation={} lý do={}",
                    payload.path("payment_id").asText(null), reservationId,
                    payload.path("failure_reason").asText(null));
            return IdempotentConsumer.Result.PROCESSED;
        }
        log.info("PaymentFailed payment={} bị bỏ qua với reservation={} ({})",
                payload.path("payment_id").asText(null), reservationId, outcome);
        return IdempotentConsumer.Result.SKIPPED;
    }

    private static UUID uuid(String raw, String field) {
        try {
            return UUID.fromString(raw);
        } catch (IllegalArgumentException | NullPointerException e) {
            throw new IllegalArgumentException("payload thiếu " + field + " hợp lệ: " + raw);
        }
    }
}
