package com.luma.registration.common.messaging;

/**
 * Tên header truy vết dùng chung giữa producer và consumer (messaging §5). Đặt một chỗ vì
 * RabbitMQ so sánh header theo đúng chuỗi — lệch một ký tự là hai phía không nhìn thấy nhau.
 */
public final class TraceHeaders {

    /** Giá trị là `event_id` của message đang được xử lý, cũng là khóa MDC để OutboxWriter đọc lại. */
    public static final String CAUSATION_ID = "causation_id";

    private TraceHeaders() {
    }
}
