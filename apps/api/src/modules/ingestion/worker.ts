import "dotenv/config";
import { Worker } from "bullmq";
import { redisConnection } from "../../lib/redis.js";
import { prisma } from "../../lib/prisma.js";
import { KnowledgeService } from "../knowledge/knowledge.service.js";
import { OpenAiLlmProvider } from "../chat/llm-provider.js";
import { chunkText } from "./chunker.js";

type IngestionJob = {
  businessId: string;
  botId?: string;
  type: "website" | "document" | "faq" | "text";
  uri: string;
  title?: string;
  content?: string;
};

const knowledge = new KnowledgeService(new OpenAiLlmProvider());

const worker = new Worker<IngestionJob>(
  "knowledge-ingestion",
  async (job) => {
    const input = job.data;

    if (!input.content) {
      const source = await prisma.knowledgeSource.create({
        data: {
          businessId: input.businessId,
          botId: input.botId,
          type: input.type,
          uri: input.uri,
          title: input.title,
          status: "FAILED",
          metadata: {
            reason: "Only direct text ingestion is implemented in this scaffold"
          }
        }
      });

      return { sourceId: source.id, status: "FAILED" };
    }

    const sourceId = await knowledge.createTextSource({
      businessId: input.businessId,
      botId: input.botId,
      uri: input.uri,
      title: input.title,
      chunks: chunkText(input.content)
    });

    return { sourceId, status: "READY" };
  },
  {
    connection: redisConnection
  }
);

worker.on("failed", (job, error) => {
  console.error({ jobId: job?.id, error }, "Ingestion job failed");
});
