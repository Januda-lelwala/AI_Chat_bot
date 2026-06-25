import type {
  ChatCompletionMessageParam,
  ChatCompletionTool
} from "openai/resources/chat/completions";
import { env } from "../../config/env.js";
import { openai } from "../../lib/openai.js";
import type { LlmMessage, LlmResponse } from "../../types/bot.js";

export interface LlmProvider {
  generate(messages: LlmMessage[], tools: ChatCompletionTool[]): Promise<LlmResponse>;
  embed(input: string): Promise<number[]>;
}

export class OpenAiLlmProvider implements LlmProvider {
  async generate(messages: LlmMessage[], tools: ChatCompletionTool[]): Promise<LlmResponse> {
    const response = await openai.chat.completions.create({
      model: env.OPENAI_CHAT_MODEL,
      messages: messages.map(toOpenAiMessage),
      tools,
      tool_choice: tools.length ? "auto" : undefined,
      temperature: 0.2
    });

    const message = response.choices[0]?.message;

    return {
      content: message?.content ?? null,
      toolCalls:
        message?.tool_calls?.map((toolCall) => ({
          id: toolCall.id,
          name: toolCall.function.name,
          arguments: toolCall.function.arguments
        })) ?? []
    };
  }

  async embed(input: string): Promise<number[]> {
    const response = await openai.embeddings.create({
      model: env.OPENAI_EMBEDDING_MODEL,
      input
    });

    return response.data[0]?.embedding ?? [];
  }
}

function toOpenAiMessage(message: LlmMessage): ChatCompletionMessageParam {
  if (message.role === "system") {
    return {
      role: "system",
      content: message.content
    };
  }

  if (message.role === "user") {
    return {
      role: "user",
      content: message.content
    };
  }

  if (message.role === "assistant" && message.toolCalls?.length) {
    return {
      role: "assistant",
      content: message.content,
      tool_calls: message.toolCalls.map((toolCall) => ({
        id: toolCall.id,
        type: "function",
        function: {
          name: toolCall.name,
          arguments: toolCall.arguments
        }
      }))
    };
  }

  if (message.role === "tool") {
    return {
      role: "tool",
      content: message.content,
      tool_call_id: message.toolCallId
    };
  }

  return {
    role: "assistant",
    content: message.content
  };
}
