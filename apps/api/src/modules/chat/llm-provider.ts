import type {
  ChatCompletionMessageParam,
  ChatCompletionTool
} from "openai/resources/chat/completions";
import { env } from "../../config/env.js";
import { createOpenAiClient } from "../../lib/openai.js";
import type { LlmMessage, LlmResponse, LlmToolDefinition } from "../../types/bot.js";

export interface ChatModelProvider {
  generate(messages: LlmMessage[], tools: LlmToolDefinition[]): Promise<LlmResponse>;
}

export interface EmbeddingProvider {
  embed(input: string): Promise<number[]>;
}

export interface LlmProvider extends ChatModelProvider, EmbeddingProvider {}

class CompositeLlmProvider implements LlmProvider {
  constructor(
    private readonly chat: ChatModelProvider,
    private readonly embeddings: EmbeddingProvider
  ) {}

  generate(messages: LlmMessage[], tools: LlmToolDefinition[]): Promise<LlmResponse> {
    return this.chat.generate(messages, tools);
  }

  embed(input: string): Promise<number[]> {
    return this.embeddings.embed(input);
  }
}

class OpenAiCompatibleChatProvider implements ChatModelProvider {
  constructor(
    private readonly client: ReturnType<typeof createOpenAiClient>,
    private readonly model: string
  ) {}

  async generate(messages: LlmMessage[], tools: LlmToolDefinition[]): Promise<LlmResponse> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: messages.map(toOpenAiMessage),
      temperature: 0.2,
      ...(tools.length
        ? {
            tools: tools.map(toOpenAiTool),
            tool_choice: "auto" as const
          }
        : {})
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
}

class AnthropicChatProvider implements ChatModelProvider {
  constructor(
    private readonly apiKey: string,
    private readonly model: string
  ) {}

  async generate(messages: LlmMessage[], tools: LlmToolDefinition[]): Promise<LlmResponse> {
    const payload = toAnthropicPayload(messages, tools);
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: env.LLM_MAX_TOKENS,
        system: payload.system || undefined,
        messages: payload.messages,
        tools: payload.tools.length ? payload.tools : undefined
      })
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Anthropic request failed with ${response.status}: ${body}`);
    }

    const data = (await response.json()) as AnthropicResponse;
    const text = data.content
      .filter((block): block is AnthropicTextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    return {
      content: text || null,
      toolCalls: data.content
        .filter((block): block is AnthropicToolUseBlock => block.type === "tool_use")
        .map((block) => ({
          id: block.id,
          name: block.name,
          arguments: JSON.stringify(block.input ?? {})
        }))
    };
  }
}

class OpenAiEmbeddingProvider implements EmbeddingProvider {
  constructor(private readonly client: ReturnType<typeof createOpenAiClient>) {}

  async embed(input: string): Promise<number[]> {
    const response = await this.client.embeddings.create({
      model: env.OPENAI_EMBEDDING_MODEL,
      input
    });

    return response.data[0]?.embedding ?? [];
  }
}

class NoopEmbeddingProvider implements EmbeddingProvider {
  async embed(): Promise<number[]> {
    return [];
  }
}

export function createLlmProvider(): LlmProvider {
  return new CompositeLlmProvider(createChatProvider(), createEmbeddingProvider());
}

function createChatProvider(): ChatModelProvider {
  if (env.LLM_PROVIDER === "anthropic") {
    return new AnthropicChatProvider(required(env.ANTHROPIC_API_KEY, "ANTHROPIC_API_KEY"), env.ANTHROPIC_MODEL);
  }

  if (env.LLM_PROVIDER === "openrouter") {
    const headers: Record<string, string> = {
      "X-Title": env.OPENROUTER_APP_NAME
    };
    if (env.OPENROUTER_SITE_URL) {
      headers["HTTP-Referer"] = env.OPENROUTER_SITE_URL;
    }

    return new OpenAiCompatibleChatProvider(
      createOpenAiClient({
        apiKey: required(env.OPENROUTER_API_KEY, "OPENROUTER_API_KEY"),
        baseURL: env.OPENROUTER_BASE_URL,
        defaultHeaders: headers
      }),
      env.OPENROUTER_CHAT_MODEL
    );
  }

  return new OpenAiCompatibleChatProvider(
    createOpenAiClient({
      apiKey: required(env.OPENAI_API_KEY, "OPENAI_API_KEY")
    }),
    env.OPENAI_CHAT_MODEL
  );
}

function createEmbeddingProvider(): EmbeddingProvider {
  if (env.EMBEDDING_PROVIDER === "none") {
    return new NoopEmbeddingProvider();
  }

  return new OpenAiEmbeddingProvider(
    createOpenAiClient({
      apiKey: required(env.OPENAI_API_KEY, "OPENAI_API_KEY")
    })
  );
}

function toOpenAiTool(tool: LlmToolDefinition): ChatCompletionTool {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters
    }
  };
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

type AnthropicTextBlock = {
  type: "text";
  text: string;
};

type AnthropicToolUseBlock = {
  type: "tool_use";
  id: string;
  name: string;
  input?: unknown;
};

type AnthropicToolResultBlock = {
  type: "tool_result";
  tool_use_id: string;
  content: string;
};

type AnthropicContentBlock = AnthropicTextBlock | AnthropicToolUseBlock | AnthropicToolResultBlock;

type AnthropicMessage = {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
};

type AnthropicTool = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

type AnthropicResponse = {
  content: Array<AnthropicTextBlock | AnthropicToolUseBlock>;
};

function toAnthropicPayload(
  messages: LlmMessage[],
  tools: LlmToolDefinition[]
): { system: string; messages: AnthropicMessage[]; tools: AnthropicTool[] } {
  const system: string[] = [];
  const anthropicMessages: AnthropicMessage[] = [];

  for (const message of messages) {
    if (message.role === "system") {
      system.push(message.content);
      continue;
    }

    if (message.role === "user") {
      anthropicMessages.push({
        role: "user",
        content: message.content
      });
      continue;
    }

    if (message.role === "assistant") {
      const content: AnthropicContentBlock[] = [];
      if (message.content) {
        content.push({ type: "text", text: message.content });
      }
      for (const toolCall of message.toolCalls ?? []) {
        content.push({
          type: "tool_use",
          id: toolCall.id,
          name: toolCall.name,
          input: parseJsonObject(toolCall.arguments)
        });
      }

      anthropicMessages.push({
        role: "assistant",
        content: content.length ? content : message.content ?? ""
      });
      continue;
    }

    anthropicMessages.push({
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: message.toolCallId,
          content: message.content
        }
      ]
    });
  }

  return {
    system: system.join("\n\n"),
    messages: anthropicMessages,
    tools: tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters
    }))
  };
}

function parseJsonObject(value: string): unknown {
  try {
    return JSON.parse(value || "{}");
  } catch {
    return {};
  }
}

function required(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}
