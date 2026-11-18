import {
  Module,
  type DynamicModule,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { Pool } from "pg";
import { OutboxRepository } from "./outbox.repository";
import { ConfirmPublisher } from "./confirm.publisher";
import { OutboxWorker } from "./outbox.worker";

class PoolShutdown implements OnApplicationShutdown {
  constructor(private readonly pool: Pool) {}
  async onApplicationShutdown() {
    await this.pool.end();
  }
}
@Module({})
export class MessagingModule {
  static register(config: {
    databaseUrl: string;
    rabbitUrl: string;
  }): DynamicModule {
    const pool = new Pool({
      connectionString: config.databaseUrl,
      connectionTimeoutMillis: 2000,
      query_timeout: 3000,
      max: 12,
    });
    pool.on("error", () => {
      process.stderr.write(
        '{"event":"outbox_pool_error","code":"DATABASE_UNAVAILABLE"}\n',
      );
    });
    return {
      module: MessagingModule,
      providers: [
        {
          provide: OutboxRepository,
          useFactory: () => new OutboxRepository(pool),
        },
        {
          provide: ConfirmPublisher,
          useFactory: () => new ConfirmPublisher(config.rabbitUrl),
        },
        {
          provide: OutboxWorker,
          inject: [OutboxRepository, ConfirmPublisher],
          useFactory: (repo: OutboxRepository, publisher: ConfirmPublisher) =>
            new OutboxWorker(repo, publisher, (entry) =>
              process.stdout.write(JSON.stringify(entry) + "\n"),
            ),
        },
        // Pool closes after worker drain; main controls this ordering explicitly.
        { provide: PoolShutdown, useFactory: () => new PoolShutdown(pool) },
      ],
      exports: [OutboxWorker, OutboxRepository],
    };
  }
}
