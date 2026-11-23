package com.luma.registration.ticketing;

import jakarta.validation.constraints.NotBlank;

/** Mã vé in trên tem — hoa/thường và khoảng trắng thừa được chuẩn hóa trong service (BR-FMT-16). */
public record CheckInRequest(@NotBlank String code) {
}
