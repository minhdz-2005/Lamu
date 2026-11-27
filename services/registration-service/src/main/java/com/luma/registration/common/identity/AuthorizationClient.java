package com.luma.registration.common.identity;

import com.luma.registration.common.web.ApiException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Client cho POST /internal/authorization/check (catalog §1) — điểm chốt quyền duy nhất.
 * Fail-closed: chỉ allowed=true mới cho đi tiếp; mọi lỗi khác → 403/502, không bao giờ 500.
 * Phải gọi TRƯỚC khi mở transaction (BR-INV-03: không gọi mạng trong transaction giữ lock).
 */
public class AuthorizationClient {

    private static final Logger log = LoggerFactory.getLogger(AuthorizationClient.class);

    private final RestClient restClient;

    public AuthorizationClient(RestClient restClient) {
        this.restClient = restClient;
    }

    public void requireEventPermission(String userId, String organizationId, String eventId, String permission) {
        CheckResponse response = check(userId, organizationId, "EVENT", eventId, permission);
        if (response == null || response.allowed() == null) {
            throw upstreamUnavailable("identity tra ve body thieu field 'allowed'");
        }
        if (!response.allowed()) {
            log.warn("authorization denied: user={} event={} permission={} reason={}",
                    userId, eventId, permission, response.reason());
            throw new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN",
                    "Tài khoản không được phép thực hiện yêu cầu này.");
        }
    }

    private CheckResponse check(String userId, String organizationId,
                                String resourceType, String resourceId, String permission) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("user_id", userId);
        if (organizationId != null) {
            body.put("organization_id", organizationId);
        }
        if (resourceType != null) {
            body.put("resource_type", resourceType);
        }
        if (resourceId != null) {
            body.put("resource_id", resourceId);
        }
        body.put("permission", permission);
        try {
            log.debug("authorization check: user={} resource={}:{} permission={}",
                    userId, resourceType, resourceId, permission);
            return restClient.post()
                    .uri("/internal/authorization/check")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .body(CheckResponse.class);
        } catch (RestClientResponseException e) {
            throw upstreamUnavailable("identity authorization/check tra " + e.getStatusCode());
        } catch (ResourceAccessException e) {
            throw upstreamUnavailable("identity authorization/check khong phan hoi: " + e.getMessage());
        } catch (RestClientException e) {
            throw upstreamUnavailable("identity authorization/check loi khong duong dinh: " + e.getMessage());
        }
    }

    private ApiException upstreamUnavailable(String detail) {
        log.warn("authorization check fail-closed: {}", detail);
        return new ApiException(HttpStatus.BAD_GATEWAY, "UPSTREAM_UNAVAILABLE",
                "Một phần dịch vụ đang tạm lỗi, thử lại sau ít phút.");
    }

    public record CheckResponse(Boolean allowed, String reason) {
    }
}
