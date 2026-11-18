package com.luma.registration.common.web;

public record ErrorEnvelope(ErrorBody error) {

    public record ErrorBody(String code, String message, String request_id) {
    }
}