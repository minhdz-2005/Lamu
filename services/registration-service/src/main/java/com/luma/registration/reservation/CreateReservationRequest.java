package com.luma.registration.reservation;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

import java.util.List;

public record CreateReservationRequest(@NotEmpty List<@Valid Item> items) {

    public record Item(@NotBlank String ticketTypeId, @NotNull @Min(1) @Max(10) Integer quantity) {
    }
}
