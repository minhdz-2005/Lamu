package com.luma.registration.common.web;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.slf4j.MDC;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import static org.assertj.core.api.Assertions.assertThat;

class GlobalExceptionHandlerTest {

    private final GlobalExceptionHandler handler = new GlobalExceptionHandler();

    @AfterEach
    void donMdc() {
        MDC.remove(RequestIdFilter.MDC_KEY);
    }

    @Test
    void apiExceptionGiuDungStatusCodeVaRequestId() {
        MDC.put(RequestIdFilter.MDC_KEY, "rid-1");
        ResponseEntity<ErrorEnvelope> res =
                handler.handleApi(new ApiException(HttpStatus.CONFLICT, "SOLD_OUT", "Hết chỗ."));

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(res.getBody()).isNotNull();
        assertThat(res.getBody().error().code()).isEqualTo("SOLD_OUT");
        assertThat(res.getBody().error().message()).isEqualTo("Hết chỗ.");
        assertThat(res.getBody().error().request_id()).isEqualTo("rid-1");
    }

    @Test
    void loiKhongRoiVao500InternalError() {
        MDC.put(RequestIdFilter.MDC_KEY, "rid-2");
        ResponseEntity<ErrorEnvelope> res = handler.handleUnexpected(new RuntimeException("boom"));

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
        assertThat(res.getBody()).isNotNull();
        assertThat(res.getBody().error().code()).isEqualTo("INTERNAL_ERROR");
        assertThat(res.getBody().error().request_id()).isEqualTo("rid-2");
    }
}