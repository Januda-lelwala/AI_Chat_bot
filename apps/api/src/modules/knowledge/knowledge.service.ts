import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import type { KnowledgeResult } from "../../types/bot.js";
import type { LlmProvider } from "../chat/llm-provider.js";

type KnowledgeRow = {
  id: string;
  content: string;
  sourceTitle: string | null;
  sourceUri: string | null;
  score: number;
};

export class KnowledgeService {
  constructor(private readonly llm: LlmProvider) {}

  async search(botId: string, businessId: string, query: string, limit = 5): Promise<KnowledgeResult[]> {
    const embedding = await this.llm.embed(query);
    if (!embedding.length) {
      return [];
    }

    const vector = `[${embedding.join(",")}]`;
    const rows = await prisma.$queryRaw<KnowledgeRow[]>`
      SELECT
        kc.id,
        kc.content,
        ks.title AS "sourceTitle",
        ks.uri AS "sourceUri",
        1 - (kc.embedding <=> ${vector}::vector) AS score
      FROM "KnowledgeChunk" kc
      JOIN "KnowledgeSource" ks ON ks.id = kc."sourceId"
      WHERE
        ks."businessId" = ${businessId}
        AND (ks."botId" IS NULL OR ks."botId" = ${botId})
        AND kc.embedding IS NOT NULL
      ORDER BY kc.embedding <=> ${vector}::vector
      LIMIT ${limit};
    `;

    return rows.map((row) => ({
      id: row.id,
      content: row.content,
      sourceTitle: row.sourceTitle,
      sourceUri: row.sourceUri,
      score: Number(row.score)
    }));
  }

  async createTextSource(input: {
    businessId: string;
    botId?: string;
    type?: "website" | "document" | "faq" | "text";
    title?: string;
    uri: string;
    metadata?: Record<string, unknown>;
    chunks: string[];
  }): Promise<string> {
    const source = await prisma.knowledgeSource.create({
      data: {
        businessId: input.businessId,
        botId: input.botId,
        type: input.type ?? "text",
        title: input.title,
        uri: input.uri,
        status: "PROCESSING",
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue
      }
    });

    for (const chunk of input.chunks) {
      const embedding = await this.llm.embed(chunk);
      const chunkId = `chunk_${randomUUID().replaceAll("-", "")}`;
      if (embedding.length) {
        await prisma.$executeRaw`
          INSERT INTO "KnowledgeChunk" ("id", "sourceId", "content", "metadata", "embedding", "createdAt")
          VALUES (
            ${chunkId},
            ${source.id},
            ${chunk},
            '{}'::jsonb,
            ${`[${embedding.join(",")}]`}::vector,
            NOW()
          );
        `;
      } else {
        await prisma.$executeRaw`
          INSERT INTO "KnowledgeChunk" ("id", "sourceId", "content", "metadata", "embedding", "createdAt")
          VALUES (
            ${chunkId},
            ${source.id},
            ${chunk},
            '{}'::jsonb,
            NULL,
            NOW()
          );
        `;
      }
    }

    await prisma.knowledgeSource.update({
      where: { id: source.id },
      data: { status: "READY" }
    });

    return source.id;
  }
}
