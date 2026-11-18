package com.luma.registration.common.web;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.test.web.servlet.MockMvc;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(controllers = HealthController.class)
class HealthControllerTest {

    @Autowired
    private MockMvc mvc;

    @Test
    void healthzTra200VaGiuNguyenRequestId() throws Exception {
        mvc.perform(get("/healthz").header(RequestIdFilter.HEADER, "req-test-1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ok"))
                .andExpect(header().string(RequestIdFilter.HEADER, "req-test-1"));
    }

    @Test
    void routeLaTra404DungEnvelope() throws Exception {
        mvc.perform(get("/khong-ton-tai").header(RequestIdFilter.HEADER, "req-test-2"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("NOT_FOUND"))
                .andExpect(jsonPath("$.error.message").isNotEmpty())
                .andExpect(jsonPath("$.error.request_id").value("req-test-2"));
    }

    @Test
    void thieuHeaderThiSinhRequestIdUuid() throws Exception {
        String requestId = mvc.perform(get("/healthz"))
                .andReturn().getResponse().getHeader(RequestIdFilter.HEADER);
        assertThat(requestId).isNotBlank();
        assertThat(UUID.fromString(requestId)).isNotNull();
    }
}