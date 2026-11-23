package com.luma.registration.common.identity;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

import java.time.Duration;

@Configuration
public class IdentityConfig {

    @Bean
    AuthorizationClient authorizationClient(
            @Value("${app.identity.base-url}") String baseUrl,
            @Value("${app.identity.timeout-ms}") long timeoutMs) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofMillis(timeoutMs));
        factory.setReadTimeout(Duration.ofMillis(timeoutMs));
        return new AuthorizationClient(RestClient.builder()
                .baseUrl(baseUrl)
                .requestFactory(factory)
                .build());
    }
}
