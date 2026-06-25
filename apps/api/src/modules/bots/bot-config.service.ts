import { prisma } from "../../lib/prisma.js";
import type { BotConfig } from "../../types/bot.js";

type JsonArray = unknown[] | null;

export class BotConfigService {
  async getConfig(botId: string): Promise<BotConfig> {
    const bot = await prisma.bot.findUnique({
      where: { id: botId },
      include: {
        business: true,
        config: true
      }
    });

    if (!bot || !bot.isActive || !bot.config) {
      throw new Error(`Bot ${botId} is not configured or inactive`);
    }

    return {
      botId: bot.id,
      businessId: bot.businessId,
      businessName: bot.config.businessName,
      industry: bot.config.industry,
      tone: bot.config.tone,
      goals: stringArray(bot.config.goals as JsonArray),
      websiteUrl: bot.config.websiteUrl,
      enabledTools: stringArray(bot.config.enabledTools as JsonArray),
      rules: stringArray(bot.config.rules as JsonArray),
      handoffTriggers: stringArray(bot.config.handoffTriggers as JsonArray),
      requiredFields: recordOfStringArrays(bot.config.requiredFields)
    };
  }
}

function stringArray(value: JsonArray): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function recordOfStringArrays(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, fields]) => [
      key,
      Array.isArray(fields) ? fields.filter((field): field is string => typeof field === "string") : []
    ])
  );
}
