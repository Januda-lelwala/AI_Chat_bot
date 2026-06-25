import type { ConnectionOptions } from "bullmq";
import { Queue } from "bullmq";
import { env } from "../config/env.js";

const redisUrl = new URL(env.REDIS_URL);

export const redisConnection: ConnectionOptions = {
  host: redisUrl.hostname,
  port: Number(redisUrl.port || 6379),
  password: redisUrl.password || undefined,
  username: redisUrl.username || undefined,
  maxRetriesPerRequest: null
};

export const ingestionQueue = new Queue("knowledge-ingestion", {
  connection: redisConnection
});

export async function closeQueues(): Promise<void> {
  await ingestionQueue.close();
}
