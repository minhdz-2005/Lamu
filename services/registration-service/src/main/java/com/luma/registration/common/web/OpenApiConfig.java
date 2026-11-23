package com.luma.registration.common.web;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Danh tính của bản /v3/api-docs (kiến trúc §1.7 Discoverability). Tên title/version đặt ở đây chứ
 * không trong application.yml vì springdoc 2.8 không nhận `springdoc.info.*` — cấu hình chết sẽ
 * im lặng trả về "OpenAPI definition / v0".
 */
@Configuration
public class OpenApiConfig {

    @Bean
    public OpenAPI registrationOpenApi() {
        return new OpenAPI().info(new Info()
                .title("Luma Registration & Ticketing Service")
                .version("0.0.1")
                .description("Bản máy đọc được cho contract freeze. Nguồn sự thật vẫn là docs/api/catalog.md; "
                        + "openapi.json trong thư mục service là output sinh tự động, lệch là test fail."));
    }
}
