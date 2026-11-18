package com.luma.registration.common.web;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingRequestHeaderException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.NoHandlerFoundException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.util.stream.Collectors;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<ErrorEnvelope> handleApi(ApiException ex) {
        return envelope(ex.getStatus(), ex.getCode(), ex.getMessage());
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorEnvelope> handleValidation(MethodArgumentNotValidException ex) {
        String detail = ex.getBindingResult().getFieldErrors().stream()
                .map(err -> err.getField() + ": " + err.getDefaultMessage())
                .collect(Collectors.joining("; "));
        return envelope(HttpStatus.BAD_REQUEST, "VALIDATION_FAILED",
                detail.isEmpty() ? "Dữ liệu gửi lên không hợp lệ." : detail);
    }

    @ExceptionHandler({HttpMessageNotReadableException.class, MissingRequestHeaderException.class,
            MissingServletRequestParameterException.class, MethodArgumentTypeMismatchException.class})
    public ResponseEntity<ErrorEnvelope> handleBadRequest(Exception ex) {
        return envelope(HttpStatus.BAD_REQUEST, "VALIDATION_FAILED", "Dữ liệu gửi lên không hợp lệ.");
    }

    @ExceptionHandler({NoResourceFoundException.class, NoHandlerFoundException.class})
    public ResponseEntity<ErrorEnvelope> handleNotFound(Exception ex) {
        return envelope(HttpStatus.NOT_FOUND, "NOT_FOUND", "Không tìm thấy tài nguyên.");
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorEnvelope> handleUnexpected(Exception ex) {
        log.error("Lỗi không mong muốn", ex);
        return envelope(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "Lỗi hệ thống, thử lại sau.");
    }

    private ResponseEntity<ErrorEnvelope> envelope(HttpStatus status, String code, String message) {
        String requestId = MDC.get(RequestIdFilter.MDC_KEY);
        return ResponseEntity.status(status)
                .body(new ErrorEnvelope(new ErrorEnvelope.ErrorBody(code, message, requestId)));
    }
}