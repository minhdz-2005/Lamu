package com.luma.registration.outbox;

import org.springframework.amqp.core.TopicExchange;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

@Configuration
@EnableScheduling
public class OutboxConfig {

    @Bean
    TopicExchange registrationExchange() {
        return new TopicExchange("luma.registration", true, false);
    }
}
