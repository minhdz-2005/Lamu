package com.luma.registration.reservation;

import com.luma.registration.common.web.ApiException;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
public class ReservationController {

    private final ReservationService service;

    public ReservationController(ReservationService service) {
        this.service = service;
    }

    @PostMapping("/events/{eventId}/reservations")
    public Object create(@PathVariable UUID eventId,
                         @RequestHeader("X-User-Id") String userId,
                         @RequestHeader(value = "X-User-Email", required = false) String recipientEmail,
                         @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey,
                         @Valid @RequestBody CreateReservationRequest request) {
        if (idempotencyKey == null || idempotencyKey.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "IDEMPOTENCY_KEY_REQUIRED",
                    "Yêu cầu giữ chỗ phải kèm header Idempotency-Key.");
        }
        if (recipientEmail == null || recipientEmail.isBlank()) {
            // BR-RSV-06: không đoán email, không gọi sang Identity.
            throw new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_FAILED",
                    "Thiếu header X-User-Email cho yêu cầu giữ chỗ.");
        }
        List<ReservationService.ItemInput> items = request.items().stream()
                .map(item -> new ReservationService.ItemInput(item.ticketTypeId(), item.quantity()))
                .toList();
        return service.reserve(new ReservationService.Command(
                userId, recipientEmail, eventId, items, idempotencyKey));
    }

    @GetMapping("/reservations/{reservationId}")
    public ReservationService.ReservationView get(@PathVariable UUID reservationId,
                                                  @RequestHeader("X-User-Id") String userId) {
        return service.get(reservationId, userId);
    }

    @DeleteMapping("/reservations/{reservationId}")
    public Map<String, String> delete(@PathVariable UUID reservationId,
                                      @RequestHeader("X-User-Id") String userId) {
        return service.release(reservationId, userId);
    }
}
