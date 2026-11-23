package com.luma.registration.common.messaging;

import org.springframework.amqp.core.Binding;
import org.springframework.amqp.core.DirectExchange;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.core.QueueBuilder;
import org.springframework.amqp.core.TopicExchange;
import org.springframework.amqp.rabbit.config.SimpleRabbitListenerContainerFactory;
import org.springframework.amqp.rabbit.connection.ConnectionFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Topology tiêu thụ của Registration theo docs/api/messaging.md §1-§3: hai queue bền, prefetch 1,
 * mỗi queue một DLQ riêng bind vào direct exchange `luma.dead` bằng đúng tên queue nguồn.
 * Queue khai báo ở đây chỉ cho phần TIÊU; exchange `luma.registration` của phần PHÁT nằm ở OutboxConfig.
 */
@Configuration
public class TopologyConfig {

    public static final String EVENT_EXCHANGE = "luma.event";
    public static final String PAYMENT_EXCHANGE = "luma.payment";
    public static final String DEAD_EXCHANGE = "luma.dead";

    public static final String SNAPSHOT_QUEUE = "registration.event-snapshot";
    public static final String SAGA_QUEUE = "registration.saga";

    @Bean
    public TopicExchange eventExchange() {
        return new TopicExchange(EVENT_EXCHANGE, true, false);
    }

    @Bean
    public TopicExchange paymentExchange() {
        return new TopicExchange(PAYMENT_EXCHANGE, true, false);
    }

    @Bean
    public DirectExchange deadExchange() {
        return new DirectExchange(DEAD_EXCHANGE, true, false);
    }

    @Bean
    public Queue eventSnapshotQueue() {
        return deadLettered(SNAPSHOT_QUEUE);
    }

    @Bean
    public Queue sagaQueue() {
        return deadLettered(SAGA_QUEUE);
    }

    private static Queue deadLettered(String name) {
        return QueueBuilder.durable(name)
                .deadLetterExchange(DEAD_EXCHANGE)
                .deadLetterRoutingKey(name)
                .build();
    }

    @Bean
    public Queue eventSnapshotDlq() {
        return new Queue(SNAPSHOT_QUEUE + ".dlq", true);
    }

    @Bean
    public Queue sagaDlq() {
        return new Queue(SAGA_QUEUE + ".dlq", true);
    }

    @Bean
    public Binding snapshotPublishedBinding() {
        return bindSnapshot("event.published.v1");
    }

    @Bean
    public Binding snapshotUpdatedBinding() {
        return bindSnapshot("event.updated.v1");
    }

    @Bean
    public Binding snapshotCancelledBinding() {
        return bindSnapshot("event.cancelled.v1");
    }

    private static Binding bindSnapshot(String routingKey) {
        return new Binding(SNAPSHOT_QUEUE, Binding.DestinationType.QUEUE, EVENT_EXCHANGE, routingKey, null);
    }

    @Bean
    public Binding sagaSucceededBinding() {
        return new Binding(SAGA_QUEUE, Binding.DestinationType.QUEUE, PAYMENT_EXCHANGE, "payment.succeeded.v1", null);
    }

    @Bean
    public Binding sagaFailedBinding() {
        return new Binding(SAGA_QUEUE, Binding.DestinationType.QUEUE, PAYMENT_EXCHANGE, "payment.failed.v1", null);
    }

    @Bean
    public Binding snapshotDlqBinding() {
        return new Binding(SNAPSHOT_QUEUE + ".dlq", Binding.DestinationType.QUEUE, DEAD_EXCHANGE, SNAPSHOT_QUEUE, null);
    }

    @Bean
    public Binding sagaDlqBinding() {
        return new Binding(SAGA_QUEUE + ".dlq", Binding.DestinationType.QUEUE, DEAD_EXCHANGE, SAGA_QUEUE, null);
    }

    /**
     * Ack do handler gọi (messaging §7.2: ack sau commit) nên chế độ là MANUAL, prefetch 1 và
     * một consumer mỗi queue để thứ tự từng bước của saga không bị hai tiến trình cắt ngang.
     */
    @Bean
    public SimpleRabbitListenerContainerFactory eventSnapshotContainerFactory(ConnectionFactory connectionFactory) {
        return manualFactory(connectionFactory);
    }

    @Bean
    public SimpleRabbitListenerContainerFactory sagaContainerFactory(ConnectionFactory connectionFactory) {
        return manualFactory(connectionFactory);
    }

    private static SimpleRabbitListenerContainerFactory manualFactory(ConnectionFactory connectionFactory) {
        SimpleRabbitListenerContainerFactory factory = new SimpleRabbitListenerContainerFactory();
        factory.setConnectionFactory(connectionFactory);
        factory.setAcknowledgeMode(org.springframework.amqp.core.AcknowledgeMode.MANUAL);
        factory.setConcurrentConsumers(1);
        factory.setPrefetchCount(1);
        return factory;
    }
}
