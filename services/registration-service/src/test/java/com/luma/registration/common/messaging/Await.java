package com.luma.registration.common.messaging;

import java.time.Duration;
import java.util.function.BooleanSupplier;

import static org.assertj.core.api.Assertions.fail;

/** Chờ tác vụ chạy sau của consumer container: poll mỗi 25ms, tối đa 15s rồi fail kèm mô tả. */
public final class Await {

    private Await() {
    }

    public static void until(String what, BooleanSupplier condition) {
        long deadline = System.nanoTime() + Duration.ofSeconds(15).toNanos();
        while (System.nanoTime() < deadline) {
            if (condition.getAsBoolean()) {
                return;
            }
            try {
                Thread.sleep(25);
            } catch (InterruptedException waited) {
                Thread.currentThread().interrupt();
                break;
            }
        }
        fail("hết 15s mà vẫn không có: " + what);
    }
}
