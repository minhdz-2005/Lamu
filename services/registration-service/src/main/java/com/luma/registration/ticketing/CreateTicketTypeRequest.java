package com.luma.registration.ticketing;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.OffsetDateTime;

public record CreateTicketTypeRequest(
        @NotBlank @Size(max = 60) String name,
        @NotBlank @Pattern(regexp = "^\\d{1,10}(\\.\\d{1,2})?$") String price,
        @NotBlank @Pattern(regexp = "^VND$") String currency,
        @NotNull @Min(1) @Max(100000) Integer capacity,
        @NotNull OffsetDateTime salesStart,
        @NotNull OffsetDateTime salesEnd) {
}
