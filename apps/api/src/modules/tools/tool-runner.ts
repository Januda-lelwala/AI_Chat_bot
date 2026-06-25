import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import type { BotContext, FrontendAction, LlmToolCall } from "../../types/bot.js";
import type { ToolRegistry } from "./tool-registry.js";

export type ExecutedToolCall = {
  toolCallId: string;
  toolName: string;
  content: string;
  actions: FrontendAction[];
};

export class ToolRunner {
  constructor(private readonly registry: ToolRegistry) {}

  async execute(toolCall: LlmToolCall, context: BotContext): Promise<ExecutedToolCall> {
    const tool = this.registry.get(toolCall.name);
    if (!tool || !context.bot.enabledTools.includes(toolCall.name)) {
      return this.blocked(toolCall, context, `Tool ${toolCall.name} is not enabled for this bot.`);
    }

    let parsedArgs: unknown;
    try {
      parsedArgs = JSON.parse(toolCall.arguments || "{}");
    } catch {
      return this.blocked(toolCall, context, `Tool ${toolCall.name} received invalid JSON input.`);
    }

    const validation = tool.schema.safeParse(parsedArgs);
    if (!validation.success) {
      return this.blocked(toolCall, context, `Tool ${toolCall.name} input failed validation: ${validation.error.message}`);
    }

    const log = await prisma.toolExecution.create({
      data: {
        botId: context.bot.botId,
        conversationId: context.conversation.id,
        toolName: tool.name,
        input: validation.data as Prisma.InputJsonValue,
        requiresConfirmation: Boolean(tool.requiresConfirmation),
        status: "PENDING"
      }
    });

    if (tool.requiresConfirmation && !context.requestedConfirmation) {
      const content = `Before I can run ${tool.name}, please confirm you want me to proceed.`;
      await prisma.toolExecution.update({
        where: { id: log.id },
        data: {
          status: "BLOCKED",
          output: { confirmationRequired: true },
          error: "confirmation_required"
        }
      });

      return {
        toolCallId: toolCall.id,
        toolName: tool.name,
        content,
        actions: []
      };
    }

    try {
      const result = await tool.execute(validation.data, context);
      await prisma.toolExecution.update({
        where: { id: log.id },
        data: {
          status: "SUCCEEDED",
          output: {
            content: result.content,
            actions: result.actions ?? [],
            data: result.data ?? {}
          } as Prisma.InputJsonValue
        }
      });

      return {
        toolCallId: toolCall.id,
        toolName: tool.name,
        content: result.content,
        actions: result.actions ?? []
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown tool execution error";
      await prisma.toolExecution.update({
        where: { id: log.id },
        data: {
          status: "FAILED",
          error: message
        }
      });

      return {
        toolCallId: toolCall.id,
        toolName: tool.name,
        content: `Tool ${tool.name} failed: ${message}`,
        actions: []
      };
    }
  }

  private async blocked(toolCall: LlmToolCall, context: BotContext, content: string): Promise<ExecutedToolCall> {
    await prisma.toolExecution.create({
      data: {
        botId: context.bot.botId,
        conversationId: context.conversation.id,
        toolName: toolCall.name,
        input: {},
        status: "BLOCKED",
        error: content
      }
    });

    return {
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      content,
      actions: []
    };
  }
}
