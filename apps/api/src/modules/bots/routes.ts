import type { FastifyInstance } from "fastify";
import { z, ZodError } from "zod";
import { prisma } from "../../lib/prisma.js";
import { BotConfigService } from "./bot-config.service.js";

const createBotSchema = z.object({
  businessName: z.string().min(1),
  businessId: z.string().optional(),
  botName: z.string().min(1),
  slug: z.string().min(1),
  industry: z.string().optional(),
  tone: z.string().default("helpful and concise"),
  goals: z.array(z.string()).default([]),
  websiteUrl: z.string().url().optional(),
  enabledTools: z.array(z.string()).default(["search_knowledge", "collect_lead", "human_handoff"]),
  rules: z.array(z.string()).default([]),
  handoffTriggers: z.array(z.string()).default(["The visitor asks for a human"]),
  requiredFields: z.record(z.array(z.string())).default({ collect_lead: ["email"] })
});

export async function botRoutes(app: FastifyInstance): Promise<void> {
  const configs = new BotConfigService();

  app.get("/api/bots/:botId/config", async (request, reply) => {
    const params = z.object({ botId: z.string() }).parse(request.params);

    try {
      return await configs.getConfig(params.botId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Bot config not found";
      return reply.status(404).send({ error: "bot_not_found", message });
    }
  });

  app.post("/api/bots", async (request, reply) => {
    try {
      const input = createBotSchema.parse(request.body);
      const business = input.businessId
        ? await prisma.business.findUniqueOrThrow({ where: { id: input.businessId } })
        : await prisma.business.create({ data: { name: input.businessName } });

      const bot = await prisma.bot.create({
        data: {
          businessId: business.id,
          name: input.botName,
          slug: input.slug,
          config: {
            create: {
              businessName: input.businessName,
              industry: input.industry,
              tone: input.tone,
              goals: input.goals,
              websiteUrl: input.websiteUrl,
              enabledTools: input.enabledTools,
              rules: input.rules,
              handoffTriggers: input.handoffTriggers,
              requiredFields: input.requiredFields
            }
          }
        },
        include: { config: true }
      });

      return reply.status(201).send(bot);
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.status(400).send({ error: "invalid_request", details: error.flatten() });
      }

      const message = error instanceof Error ? error.message : "Could not create bot";
      request.log.error({ err: error }, message);
      return reply.status(500).send({ error: "bot_create_failed", message });
    }
  });
}
