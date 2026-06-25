import type { FastifyInstance } from "fastify";
import { z, ZodError } from "zod";
import { ingestionQueue } from "../../lib/redis.js";

const ingestionRequestSchema = z.object({
  businessId: z.string().min(1),
  botId: z.string().optional(),
  type: z.enum(["website", "document", "faq", "text"]),
  uri: z.string().min(1),
  title: z.string().optional(),
  content: z.string().optional()
});

export async function ingestionRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/ingestion/jobs", async (request, reply) => {
    try {
      const input = ingestionRequestSchema.parse(request.body);
      const job = await ingestionQueue.add("ingest-source", input, {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 5000
        }
      });

      return reply.status(202).send({
        jobId: job.id,
        status: "queued"
      });
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.status(400).send({ error: "invalid_request", details: error.flatten() });
      }

      const message = error instanceof Error ? error.message : "Could not queue ingestion job";
      request.log.error({ err: error }, message);
      return reply.status(500).send({ error: "ingestion_queue_failed", message });
    }
  });
}
