package com.luma.registration.reservation;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class ReservationExpiryWorker {

    private static final Logger log = LoggerFactory.getLogger(ReservationExpiryWorker.class);

    private final ReservationService service;
    private final int batchSize;

    public ReservationExpiryWorker(ReservationService service,
                                   @Value("${app.reservation.expiry-batch-size}") int batchSize) {
        this.service = service;
        this.batchSize = batchSize;
    }

    /** BR-RSV-03 + BR-RSV-04: nhả chỗ quá `expires_at`, mỗi chỗ đúng một lần kể cả nhiều tiến trình quét. */
    @Scheduled(fixedDelayString = "${app.reservation.expiry-poll-ms}",
            initialDelayString = "${app.reservation.expiry-poll-ms}")
    public void releaseOverdue() {
        var released = service.expireOverdue(batchSize);
        if (!released.isEmpty()) {
            log.info("worker hết hạn nhả {} reservation", released.size());
        }
    }
}
