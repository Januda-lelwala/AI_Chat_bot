import type { FastifyInstance } from "fastify";

export async function webhookRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/webhooks/:provider", async (request) => ({
    accepted: true,
    provider: (request.params as { provider: string }).provider
  }));
}
