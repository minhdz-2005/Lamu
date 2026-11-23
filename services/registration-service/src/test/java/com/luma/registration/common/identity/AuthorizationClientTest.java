package com.luma.registration.common.identity;

import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import com.github.tomakehurst.wiremock.junit5.WireMockExtension;
import com.luma.registration.common.web.ApiException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.RegisterExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

import java.time.Duration;

import static com.github.tomakehurst.wiremock.client.WireMock.equalTo;
import static com.github.tomakehurst.wiremock.client.WireMock.matchingJsonPath;
import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.post;
import static com.github.tomakehurst.wiremock.client.WireMock.postRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class AuthorizationClientTest {

    private static final String USER_ID = "11111111-1111-1111-1111-111111111111";
    private static final String ORG_ID = "22222222-2222-2222-2222-222222222222";
    private static final String EVENT_ID = "33333333-3333-3333-3333-333333333333";

    @RegisterExtension
    static WireMockExtension identity = WireMockExtension.newInstance()
            .options(WireMockConfiguration.wireMockConfig().dynamicPort())
            .build();

    private static AuthorizationClient client(String baseUrl, long timeoutMs) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofMillis(timeoutMs));
        factory.setReadTimeout(Duration.ofMillis(timeoutMs));
        return new AuthorizationClient(RestClient.builder()
                .baseUrl(baseUrl)
                .requestFactory(factory)
                .build());
    }

    private void stubCheck(String jsonBody, int status) {
        identity.stubFor(post(urlEqualTo("/internal/authorization/check"))
                .willReturn(aResponse()
                        .withStatus(status)
                        .withHeader("Content-Type", "application/json")
                        .withBody(jsonBody)));
    }

    @Test
    void allowedTrueThiDiTiepVaGuiDungBodySnakeCase() {
        stubCheck("{\"allowed\":true,\"reason\":null}", 200);
        AuthorizationClient client = client(identity.baseUrl(), 1000);

        assertDoesNotThrow(() ->
                client.requireEventPermission(USER_ID, ORG_ID, EVENT_ID, "event.update"));

        identity.verify(postRequestedFor(urlEqualTo("/internal/authorization/check"))
                .withRequestBody(matchingJsonPath("$.user_id", equalTo(USER_ID)))
                .withRequestBody(matchingJsonPath("$.organization_id", equalTo(ORG_ID)))
                .withRequestBody(matchingJsonPath("$.resource_type", equalTo("EVENT")))
                .withRequestBody(matchingJsonPath("$.resource_id", equalTo(EVENT_ID)))
                .withRequestBody(matchingJsonPath("$.permission", equalTo("event.update"))));
    }

    @Test
    void allowedFalseThi403Forbidden() {
        stubCheck("{\"allowed\":false,\"reason\":\"NOT_A_MEMBER\"}", 200);
        AuthorizationClient client = client(identity.baseUrl(), 1000);

        ApiException error = assertThrows(ApiException.class, () ->
                client.requireEventPermission(USER_ID, ORG_ID, EVENT_ID, "event.update"));
        assertEquals(HttpStatus.FORBIDDEN, error.getStatus());
        assertEquals("FORBIDDEN", error.getCode());
    }

    @Test
    void identityTra500Thi502FailClosed() {
        stubCheck("boom", 500);
        AuthorizationClient client = client(identity.baseUrl(), 1000);

        ApiException error = assertThrows(ApiException.class, () ->
                client.requireEventPermission(USER_ID, ORG_ID, EVENT_ID, "event.update"));
        assertEquals(HttpStatus.BAD_GATEWAY, error.getStatus());
        assertEquals("UPSTREAM_UNAVAILABLE", error.getCode());
    }

    @Test
    void bodyThieuFieldAllowedThi502Khong500() {
        stubCheck("{}", 200);
        AuthorizationClient client = client(identity.baseUrl(), 1000);

        ApiException error = assertThrows(ApiException.class, () ->
                client.requireEventPermission(USER_ID, ORG_ID, EVENT_ID, "event.update"));
        assertEquals(HttpStatus.BAD_GATEWAY, error.getStatus());
        assertEquals("UPSTREAM_UNAVAILABLE", error.getCode());
    }

    @Test
    void identityKhongPhanHoiThi502() {
        // WireMock da stop van cong port dong → ResourceAccessException (connect refused)
        AuthorizationClient client = client("http://localhost:1/", 500);

        ApiException error = assertThrows(ApiException.class, () ->
                client.requireEventPermission(USER_ID, ORG_ID, EVENT_ID, "event.update"));
        assertEquals(HttpStatus.BAD_GATEWAY, error.getStatus());
        assertEquals("UPSTREAM_UNAVAILABLE", error.getCode());
    }

    @Test
    void identityQuaHanTimeoutThi502() {
        identity.stubFor(post(urlEqualTo("/internal/authorization/check"))
                .willReturn(aResponse()
                        .withStatus(200)
                        .withFixedDelay(1500)
                        .withHeader("Content-Type", "application/json")
                        .withBody("{\"allowed\":true}")));
        AuthorizationClient client = client(identity.baseUrl(), 200);

        ApiException error = assertThrows(ApiException.class, () ->
                client.requireEventPermission(USER_ID, ORG_ID, EVENT_ID, "event.update"));
        assertEquals(HttpStatus.BAD_GATEWAY, error.getStatus());
        assertEquals("UPSTREAM_UNAVAILABLE", error.getCode());
    }
}
