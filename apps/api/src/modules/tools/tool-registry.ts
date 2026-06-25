import type { ChatCompletionTool } from "openai/resources/chat/completions";
import type { BotContext, BotTool } from "../../types/bot.js";

export class ToolRegistry {
  private readonly tools = new Map<string, BotTool<any>>();

  register<TInput>(tool: BotTool<TInput>): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): BotTool<any> | undefined {
    return this.tools.get(name);
  }

  enabledTools(context: BotContext): BotTool<any>[] {
    return context.bot.enabledTools.map((name) => this.tools.get(name)).filter((tool): tool is BotTool => Boolean(tool));
  }

  toOpenAiTools(context: BotContext): ChatCompletionTool[] {
    return this.enabledTools(context).map((tool) => tool.toOpenAITool());
  }
}
