package com.luma.registration.ticketing;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Pattern;

import java.time.OffsetDateTime;

/**
 * PATCH một phần: field null = giữ nguyên giá trị cũ. `capacity` không có nghĩa "đặt lại"
 * mà chỉ được tăng (BR-INV-06), nên mọi giá trị nhỏ hơn hiện tại đều 409.
 */
public record PatchTicketTypeRequest(
        @Pattern(regexp = "^\\d{1,10}(\\.\\d{1,2})?$") String price,
        @Pattern(regexp = "^(ACTIVE|CLOSED)$") String status,
        OffsetDateTime salesStart,
        OffsetDateTime salesEnd,
        @Min(1) @Max(100000) Integer capacity) {
}
