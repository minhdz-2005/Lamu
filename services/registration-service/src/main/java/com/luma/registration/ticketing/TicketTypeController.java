package com.luma.registration.ticketing;

import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
public class TicketTypeController {

    private final TicketTypeService service;

    public TicketTypeController(TicketTypeService service) {
        this.service = service;
    }

    public record CreateTicketTypeResponse(String ticketTypeId) {
    }

    @PostMapping("/events/{eventId}/ticket-types")
    public CreateTicketTypeResponse create(@PathVariable UUID eventId,
                                           @RequestHeader("X-User-Id") String userId,
                                           @Valid @RequestBody CreateTicketTypeRequest request) {
        return new CreateTicketTypeResponse(service.create(eventId, request, userId).toString());
    }

    @GetMapping("/events/{eventId}/ticket-types")
    public List<TicketTypeService.TicketTypeView> list(@PathVariable UUID eventId) {
        return service.listPublished(eventId);
    }

    @GetMapping("/events/{eventId}/availability")
    public List<TicketTypeService.AvailabilityView> availability(@PathVariable UUID eventId) {
        return service.availability(eventId);
    }
}
