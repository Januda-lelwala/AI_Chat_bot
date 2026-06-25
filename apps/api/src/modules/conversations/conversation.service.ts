import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import type { ConversationSnapshot } from "../../types/bot.js";

export class ConversationService {
  async loadOrCreate(botId: string, conversationId?: string, pageUrl?: string): Promise<ConversationSnapshot> {
    const conversation = conversationId
      ? await prisma.conversation.findFirst({
          where: { id: conversationId, botId },
          include: { messages: { orderBy: { createdAt: "asc" }, take: 20 } }
        })
      : await prisma.conversation.create({
          data: {
            botId,
            pageUrl,
            state: {}
          },
          include: { messages: true }
        });

    if (!conversation) {
      throw new Error(`Conversation ${conversationId} was not found for bot ${botId}`);
    }

    if (pageUrl && conversation.pageUrl !== pageUrl) {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { pageUrl }
      });
    }

    return {
      id: conversation.id,
      state:
        conversation.state && typeof conversation.state === "object" && !Array.isArray(conversation.state)
          ? (conversation.state as Record<string, unknown>)
          : {},
      messages: conversation.messages
        .filter((message) => message.role === "user" || message.role === "assistant")
        .map((message) => ({
          role: message.role as "user" | "assistant",
          content: message.content
        }))
    };
  }

  async saveUserMessage(conversationId: string, content: string): Promise<void> {
    await prisma.message.create({
      data: {
        conversationId,
        role: "user",
        content
      }
    });
  }

  async saveAssistantMessage(
    conversationId: string,
    content: string,
    metadata: Record<string, unknown> = {}
  ): Promise<void> {
    await prisma.message.create({
      data: {
        conversationId,
        role: "assistant",
        content,
        metadata: metadata as Prisma.InputJsonValue
      }
    });
  }

  async saveToolMessage(conversationId: string, content: string, metadata: Record<string, unknown>): Promise<void> {
    await prisma.message.create({
      data: {
        conversationId,
        role: "tool",
        content,
        metadata: metadata as Prisma.InputJsonValue
      }
    });
  }
}
