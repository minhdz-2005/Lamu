package com.luma.registration.ticketing;

import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/**
 * Ba đường vé của Phần 4. `X-User-Id` để `required = false` vì thiếu header phải là
 * 401 UNAUTHENTICATED theo catalog §0, còn Spring mặc định trả 400 cho header thiếu;
 * việc kiểm tra header nằm trong service cùng chỗ với quyền.
 */
@RestController
public class TicketController {

    private final TicketService service;

    public TicketController(TicketService service) {
        this.service = service;
    }

    @GetMapping("/users/me/tickets")
    public List<TicketService.MyTicketView> myTickets(
            @RequestHeader(value = "X-User-Id", required = false) String userId) {
        return service.myTickets(userId);
    }

    @GetMapping("/events/{eventId}/tickets")
    public TicketService.BoardPage eventTickets(@PathVariable UUID eventId,
                                                @RequestHeader(value = "X-User-Id", required = false) String userId,
                                                @RequestParam(required = false) String status,
                                                @RequestParam(required = false) Integer limit,
                                                @RequestParam(required = false) Integer offset) {
        return service.eventTickets(eventId, status, limit, offset, userId);
    }

    @PostMapping("/tickets/check-in")
    public TicketService.CheckInView checkIn(@RequestHeader(value = "X-User-Id", required = false) String userId,
                                             @Valid @RequestBody CheckInRequest request) {
        return service.checkIn(request.code(), userId);
    }
}
