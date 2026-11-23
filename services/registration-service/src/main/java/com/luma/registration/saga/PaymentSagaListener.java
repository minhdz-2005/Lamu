package com.luma.registration.saga;

import com.luma.registration.common.messaging.IdempotentConsumer;
import com.luma.registration.common.messaging.TopologyConfig;
import com.rabbitmq.client.Channel;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;

import java.io.IOException;

/** Queue `registration.saga`: hai routing key của Payment (messaging §3). */
@Component
public class PaymentSagaListener {

    private final IdempotentConsumer consumer;
    private final PaymentSagaService service;

    public PaymentSagaListener(IdempotentConsumer consumer, PaymentSagaService service) {
        this.consumer = consumer;
        this.service = service;
    }

    @RabbitListener(queues = TopologyConfig.SAGA_QUEUE, containerFactory = "sagaContainerFactory")
    public void onPayment(Message message, Channel channel) throws IOException {
        consumer.consume(message, channel, service::apply);
    }
}
