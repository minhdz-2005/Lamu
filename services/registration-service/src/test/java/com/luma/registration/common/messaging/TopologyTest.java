package com.luma.registration.common.messaging;

import org.junit.jupiter.api.Test;
import org.springframework.amqp.core.QueueInformation;
import org.springframework.amqp.rabbit.core.RabbitAdmin;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 3.1 — bằng chứng topology thật trên broker dev (messaging §3). Container listener tự khai báo
 * Declarables khi kết nối, nên chỉ cần đọc lại trạng thái broker, không dựng gì thêm trong test.
 */
@SpringBootTest
class TopologyTest {

    @Autowired
    private RabbitAdmin admin;

    @Test
    void bonQueueTonTaiVaConsumerDaGamVao() {
        assertThat(admin.getQueueProperties(TopologyConfig.SNAPSHOT_QUEUE)).isNotNull();
        assertThat(admin.getQueueProperties(TopologyConfig.SAGA_QUEUE)).isNotNull();
        assertThat(admin.getQueueProperties(TopologyConfig.SNAPSHOT_QUEUE + ".dlq")).isNotNull();
        assertThat(admin.getQueueProperties(TopologyConfig.SAGA_QUEUE + ".dlq")).isNotNull();

        assertThat(admin.getQueueInfo(TopologyConfig.SNAPSHOT_QUEUE).getConsumerCount())
                .as("prefetch 1, một consumer mỗi queue").isEqualTo(1);
    }

    @Test
    void dlqKhongCoConsumerVaKhongAiTieuHo() {
        assertThat(admin.getQueueInfo(TopologyConfig.SNAPSHOT_QUEUE + ".dlq").getConsumerCount()).isZero();
        assertThat(admin.getQueueInfo(TopologyConfig.SAGA_QUEUE + ".dlq").getConsumerCount()).isZero();
    }
}
