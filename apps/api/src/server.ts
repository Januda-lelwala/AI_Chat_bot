import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import Fastify from "fastify";
import { botRoutes } from "./modules/bots/routes.js";
import { chatRoutes } from "./modules/chat/routes.js";
import { conversationRoutes } from "./modules/conversations/routes.js";
import { ingestionRoutes } from "./modules/ingestion/routes.js";
import { integrationRoutes } from "./modules/integrations/routes.js";
import { webhookRoutes } from "./modules/webhooks/routes.js";

export async function buildServer() {
  const app = Fastify({
    logger: true
  });

  await app.register(helmet);
  await app.register(cors, {
    origin: true
  });

  app.get("/health", async () => ({ ok: true }));

  await app.register(chatRoutes);
  await app.register(botRoutes);
  await app.register(conversationRoutes);
  await app.register(ingestionRoutes);
  await app.register(integrationRoutes);
  await app.register(webhookRoutes);

  return app;
}
