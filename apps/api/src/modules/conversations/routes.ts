import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";

export async function conversationRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/conversations/:conversationId", async (request, reply) => {
    const params = z.object({ conversationId: z.string() }).parse(request.params);
    const conversation = await prisma.conversation.findUnique({
      where: { id: params.conversationId },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
        toolExecutions: { orderBy: { createdAt: "asc" } },
        handoffRequests: true
      }
    });

    if (!conversation) {
      return reply.status(404).send({ error: "conversation_not_found" });
    }

    return conversation;
  });
}
