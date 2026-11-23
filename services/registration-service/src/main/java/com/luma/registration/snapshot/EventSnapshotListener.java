package com.luma.registration.snapshot;

import com.luma.registration.common.messaging.IdempotentConsumer;
import com.luma.registration.common.messaging.TopologyConfig;
import com.rabbitmq.client.Channel;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;

import java.io.IOException;

/** Queue `registration.event-snapshot`: ba routing key của Event (messaging §3). */
@Component
public class EventSnapshotListener {

    private final IdempotentConsumer consumer;
    private final EventSnapshotService service;

    public EventSnapshotListener(IdempotentConsumer consumer, EventSnapshotService service) {
        this.consumer = consumer;
        this.service = service;
    }

    @RabbitListener(queues = TopologyConfig.SNAPSHOT_QUEUE, containerFactory = "eventSnapshotContainerFactory")
    public void onEvent(Message message, Channel channel) throws IOException {
        consumer.consume(message, channel, service::apply);
    }
}
