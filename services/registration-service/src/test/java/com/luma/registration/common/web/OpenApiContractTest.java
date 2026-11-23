package com.luma.registration.common.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

/**
 * A3 (kiến trúc §1.7 Discoverability) — `openapi.json` là bản hợp đồng máy đọc được mà cả nhóm dùng
 * cho contract freeze. Nó chỉ có giá trị nếu còn khớp app thật, nên test này so nguyên cây `paths`
 * và `components.schemas`; thêm/bớt endpoint, đổi tên field, đổi mã lỗi là fail.
 *
 * Regenerate sau khi sửa API (app chạy trên host, DB + Rabbit trong compose):
 * `mvn -o spring-boot:run` rồi
 * `curl -s http://localhost:8080/v3/api-docs | python -m json.tool --sort-keys --indent 2 > openapi.json`
 */
@SpringBootTest
@AutoConfigureMockMvc
class OpenApiContractTest {

    private static final ObjectMapper JSON = new ObjectMapper();

    @Autowired
    private MockMvc mvc;

    @Test
    void snapshotKhopCauTrucSinhRaTuApp() throws Exception {
        JsonNode live = JSON.readTree(mvc.perform(get("/v3/api-docs"))
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8));
        assertThat(Files.exists(Path.of("openapi.json")))
                .as("thiếu openapi.json — regenerate theo lệnh trong javadoc class này").isTrue();
        JsonNode committed = JSON.readTree(Files.readString(Path.of("openapi.json"), StandardCharsets.UTF_8));

        assertThat(live.path("paths")).as("endpoint trong spec đã đổi so với bản commit")
                .isEqualTo(committed.path("paths"));
        assertThat(live.path("components").path("schemas")).as("schema field đã đổi so với bản commit")
                .isEqualTo(committed.path("components").path("schemas"));
    }

    @Test
    void specTuDanhDungKhongPhaMacDinhCuaSpringdoc() throws Exception {
        JsonNode live = JSON.readTree(mvc.perform(get("/v3/api-docs"))
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8));

        // `springdoc.info.*` không phải property thật; ai đó xóa OpenApiConfig là spec mất danh tính
        // mà không có gì báo, nên chặn ở đây.
        assertThat(live.path("info").path("title").asText()).isEqualTo("Luma Registration & Ticketing Service");
        assertThat(live.path("info").path("version").asText()).isEqualTo("0.0.1");
        assertThat(live.path("paths").size()).as("10 endpoint đã ghi trong catalog §3").isEqualTo(10);
    }
}
