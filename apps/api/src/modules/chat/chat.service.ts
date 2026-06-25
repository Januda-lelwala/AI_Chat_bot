import { z } from "zod";
import type { FrontendAction } from "../../types/bot.js";
import { BotConfigService } from "../bots/bot-config.service.js";
import { ConversationService } from "../conversations/conversation.service.js";
import { KnowledgeService } from "../knowledge/knowledge.service.js";
import { createDefaultToolRegistry } from "../tools/default-registry.js";
import { LangGraphChatAgent } from "./langgraph-agent.js";
import type { LlmProvider } from "./llm-provider.js";

export const chatRequestSchema = z.object({
  botId: z.string().min(1),
  conversationId: z.string().optional(),
  message: z.string().min(1),
  pageUrl: z.string().url().optional(),
  confirmed: z.boolean().default(false)
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

export type ChatResponse = {
  conversationId: string;
  message: string;
  actions: FrontendAction[];
};

export class ChatService {
  private readonly bots = new BotConfigService();
  private readonly conversations = new ConversationService();
  private readonly tools = createDefaultToolRegistry();
  private readonly knowledge: KnowledgeService;
  private readonly agent: LangGraphChatAgent;

  constructor(llm: LlmProvider) {
    this.knowledge = new KnowledgeService(llm);
    this.agent = new LangGraphChatAgent(llm, this.tools);
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const bot = await this.bots.getConfig(request.botId);
    const conversation = await this.conversations.loadOrCreate(bot.botId, request.conversationId, request.pageUrl);
    await this.conversations.saveUserMessage(conversation.id, request.message);

    const knowledge = await this.knowledge.search(bot.botId, bot.businessId, request.message);
    const result = await this.agent.run(
      {
        bot,
        conversation,
        pageUrl: request.pageUrl,
        knowledge,
        requestedConfirmation: request.confirmed
      },
      request.message
    );

    await this.conversations.saveAssistantMessage(conversation.id, result.response, {
      actions: result.actions
    });

    return {
      conversationId: conversation.id,
      message: result.response,
      actions: result.actions
    };
  }
}
