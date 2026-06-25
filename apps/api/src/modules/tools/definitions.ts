import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { z } from "zod";
import { zodToOpenAiSchema } from "../../lib/json-schema.js";
import { prisma } from "../../lib/prisma.js";
import type { BotContext, BotTool, ToolResult } from "../../types/bot.js";

export function createTool<TInput>(
  name: string,
  description: string,
  schema: z.ZodType<TInput>,
  execute: (input: TInput, context: BotContext) => Promise<ToolResult>,
  options: { requiresConfirmation?: boolean } = {}
): BotTool<TInput> {
  return {
    name,
    description,
    schema,
    requiresConfirmation: options.requiresConfirmation,
    execute,
    toOpenAITool: (): ChatCompletionTool => ({
      type: "function",
      function: {
        name,
        description,
        parameters: zodToOpenAiSchema(schema)
      }
    })
  };
}

export const searchKnowledgeTool = createTool(
  "search_knowledge",
  "Search the already retrieved business knowledge snippets for relevant information.",
  z.object({
    query: z.string().min(1)
  }),
  async (input, context) => {
    const matches = context.knowledge.filter((item) =>
      item.content.toLowerCase().includes(input.query.toLowerCase().slice(0, 80))
    );
    const selected = matches.length ? matches : context.knowledge.slice(0, 5);

    return {
      content: selected.length
        ? selected.map((item) => item.content).join("\n\n")
        : "No matching business knowledge is available for this request.",
      data: { count: selected.length }
    };
  }
);

export const collectLeadTool = createTool(
  "collect_lead",
  "Collect lead contact details when a visitor wants follow-up from the business.",
  z.object({
    name: z.string().optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    message: z.string().optional()
  }),
  async (input, context) => {
    const required = context.bot.requiredFields.collect_lead ?? ["email"];
    const missing = required.filter((field) => !input[field as keyof typeof input]);

    if (missing.length) {
      return {
        content: `Missing required lead field(s): ${missing.join(", ")}. Ask the visitor for these details before collecting the lead.`,
        data: { missing }
      };
    }

    const lead = await prisma.lead.create({
      data: {
        businessId: context.bot.businessId,
        conversationId: context.conversation.id,
        name: input.name,
        email: input.email,
        phone: input.phone,
        message: input.message
      }
    });

    return {
      content: "Lead details were saved for business follow-up.",
      data: { leadId: lead.id }
    };
  }
);

export const humanHandoffTool = createTool(
  "human_handoff",
  "Request a human handoff when the visitor needs a person or the bot reaches a configured handoff trigger.",
  z.object({
    reason: z.string().min(1)
  }),
  async (input, context) => {
    const handoff = await prisma.handoffRequest.create({
      data: {
        businessId: context.bot.businessId,
        conversationId: context.conversation.id,
        reason: input.reason
      }
    });

    await prisma.conversation.update({
      where: { id: context.conversation.id },
      data: { status: "HANDED_OFF" }
    });

    return {
      content: "A human handoff request has been created.",
      data: { handoffRequestId: handoff.id }
    };
  }
);

export const openUrlTool = createTool(
  "open_url",
  "Navigate the visitor to a safe URL on the configured business website.",
  z.object({
    url: z.string().url(),
    target: z.enum(["_self", "_blank"]).default("_self")
  }),
  async (input, context) => {
    if (context.bot.websiteUrl && !isSameOriginOrPath(input.url, context.bot.websiteUrl)) {
      return {
        content: "Blocked navigation because the URL is outside the configured website scope.",
        data: { blocked: true }
      };
    }

    return {
      content: `Prepared frontend navigation to ${input.url}.`,
      actions: [{ type: "open_url", url: input.url, target: input.target }]
    };
  }
);

export const scrollToSectionTool = createTool(
  "scroll_to_section",
  "Scroll the visitor to a known section selector on the current page.",
  z.object({
    selector: z.string().min(1)
  }),
  async (input) => ({
    content: `Prepared frontend scroll action for ${input.selector}.`,
    actions: [{ type: "scroll_to", selector: input.selector }]
  })
);

export const createTicketTool = createTool(
  "create_ticket",
  "Create a support ticket after collecting required fields and receiving visitor confirmation.",
  z.object({
    subject: z.string().min(1),
    description: z.string().min(1),
    email: z.string().email().optional(),
    priority: z.enum(["low", "normal", "high"]).default("normal")
  }),
  async (input) => ({
    content: "Ticket creation was accepted by the backend. Configure a Zendesk, HubSpot, or custom adapter to send it externally.",
    data: {
      ticket: {
        subject: input.subject,
        priority: input.priority,
        externalStatus: "adapter_not_configured"
      }
    }
  }),
  { requiresConfirmation: true }
);

function isSameOriginOrPath(url: string, websiteUrl: string): boolean {
  const target = new URL(url);
  const website = new URL(websiteUrl);
  return target.origin === website.origin;
}
