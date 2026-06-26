import "dotenv/config";
import { Worker } from "bullmq";
import { redisConnection } from "../../lib/redis.js";
import { prisma } from "../../lib/prisma.js";
import { KnowledgeService } from "../knowledge/knowledge.service.js";
import { createLlmProvider } from "../chat/llm-provider.js";
import { chunkText } from "./chunker.js";
import { crawlWebsite, type WebsiteCrawlOptions } from "./website-crawler.js";

type IngestionJob = {
  businessId: string;
  botId?: string;
  type: "website" | "document" | "faq" | "text";
  uri: string;
  title?: string;
  content?: string;
  crawl?: WebsiteCrawlOptions;
};

const knowledge = new KnowledgeService(createLlmProvider());

const worker = new Worker<IngestionJob>(
  "knowledge-ingestion",
  async (job) => {
    const input = job.data;

    if (!input.content && input.type === "website") {
      try {
        const pages = await crawlWebsite(input.uri, input.crawl);
        const sourceIds: string[] = [];

        for (const page of pages) {
          const sourceId = await knowledge.createTextSource({
            businessId: input.businessId,
            botId: input.botId,
            type: "website",
            uri: page.url,
            title: page.title ?? input.title,
            metadata: page.metadata,
            chunks: chunkText(page.content)
          });
          sourceIds.push(sourceId);
        }

        return { sourceIds, status: "READY", pages: pages.length };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Website ingestion failed";
        const source = await prisma.knowledgeSource.create({
          data: {
            businessId: input.businessId,
            botId: input.botId,
            type: input.type,
            uri: input.uri,
            title: input.title,
            status: "FAILED",
            metadata: {
              reason: message,
              ingestedBy: "website-crawler"
            }
          }
        });

        return { sourceId: source.id, status: "FAILED" };
      }
    }

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
      type: input.type,
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
