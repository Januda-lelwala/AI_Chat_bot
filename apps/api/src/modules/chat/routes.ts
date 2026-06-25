import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { chatRequestSchema, ChatService } from "./chat.service.js";
import { OpenAiLlmProvider } from "./llm-provider.js";

export async function chatRoutes(app: FastifyInstance): Promise<void> {
  const chat = new ChatService(new OpenAiLlmProvider());

  app.post("/api/chat", async (request, reply) => {
    try {
      const input = chatRequestSchema.parse(request.body);
      return await chat.chat(input);
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.status(400).send({
          error: "invalid_request",
          details: error.flatten()
        });
      }

      const message = error instanceof Error ? error.message : "Chat request failed";
      request.log.error({ err: error }, message);
      return reply.status(500).send({
        error: "chat_failed",
        message
      });
    }
  });
}
