import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { buildSystemPrompt } from "../bots/prompt-builder.js";
import type { LlmProvider } from "./llm-provider.js";
import type { BotContext, FrontendAction, LlmMessage, LlmToolCall } from "../../types/bot.js";
import type { ToolRegistry } from "../tools/tool-registry.js";
import { ToolRunner } from "../tools/tool-runner.js";

const GraphState = Annotation.Root({
  messages: Annotation<LlmMessage[]>({
    reducer: (left, right) => left.concat(right),
    default: () => []
  }),
  pendingToolCalls: Annotation<LlmToolCall[]>({
    reducer: (_left, right) => right,
    default: () => []
  }),
  actions: Annotation<FrontendAction[]>({
    reducer: (left, right) => left.concat(right),
    default: () => []
  }),
  finalResponse: Annotation<string>({
    reducer: (_left, right) => right,
    default: () => ""
  })
});

export class LangGraphChatAgent {
  private readonly toolRunner: ToolRunner;

  constructor(
    private readonly llm: LlmProvider,
    private readonly registry: ToolRegistry
  ) {
    this.toolRunner = new ToolRunner(registry);
  }

  async run(context: BotContext, userMessage: string): Promise<{ response: string; actions: FrontendAction[] }> {
    const systemPrompt = buildSystemPrompt(context.bot, context.knowledge);
    const initialMessages: LlmMessage[] = [
      { role: "system", content: systemPrompt },
      ...context.conversation.messages,
      { role: "user", content: userMessage }
    ];

    const graph = new StateGraph(GraphState)
      .addNode("agent", async (state) => {
        const llmResponse = await this.llm.generate(state.messages, this.registry.toOpenAiTools(context));
        const assistantMessage: LlmMessage = {
          role: "assistant",
          content: llmResponse.content,
          toolCalls: llmResponse.toolCalls
        };

        return {
          messages: [assistantMessage],
          pendingToolCalls: llmResponse.toolCalls,
          finalResponse: llmResponse.toolCalls.length ? "" : llmResponse.content ?? ""
        };
      })
      .addNode("tools", async (state) => {
        const results = await Promise.all(
          state.pendingToolCalls.map((toolCall) => this.toolRunner.execute(toolCall, context))
        );

        return {
          messages: results.map((result): LlmMessage => ({
            role: "tool",
            toolCallId: result.toolCallId,
            content: result.content
          })),
          actions: results.flatMap((result) => result.actions),
          pendingToolCalls: []
        };
      })
      .addEdge(START, "agent")
      .addConditionalEdges("agent", (state) => (state.pendingToolCalls.length ? "tools" : END))
      .addEdge("tools", "agent")
      .compile();

    const result = await graph.invoke(
      { messages: initialMessages },
      { recursionLimit: 8 }
    );

    return {
      response: result.finalResponse || "I could not generate a response.",
      actions: result.actions
    };
  }
}
