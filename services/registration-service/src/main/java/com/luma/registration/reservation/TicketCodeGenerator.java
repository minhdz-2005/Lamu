package com.luma.registration.reservation;

import org.springframework.stereotype.Component;

import java.security.SecureRandom;

/** Mã vé theo BR-TCK-01: `LUMA-` + 4 hex hoa + `-` + 4 hex hoa (17 ký tự). */
@Component
public class TicketCodeGenerator {

    private static final SecureRandom RANDOM = new SecureRandom();

    public String generate() {
        return "LUMA-%04X-%04X".formatted(RANDOM.nextInt(0x10000), RANDOM.nextInt(0x10000));
    }
}
