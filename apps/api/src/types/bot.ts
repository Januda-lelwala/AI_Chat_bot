import type { z } from "zod";

export type FrontendAction =
  | {
      type: "open_url";
      url: string;
      target?: "_self" | "_blank";
    }
  | {
      type: "scroll_to";
      selector: string;
    }
  | {
      type: "prefill_form";
      selector: string;
      values: Record<string, string>;
    }
  | {
      type: "highlight_element";
      selector: string;
    };

export type BotConfig = {
  botId: string;
  businessId: string;
  businessName: string;
  industry?: string | null;
  tone: string;
  goals: string[];
  websiteUrl?: string | null;
  enabledTools: string[];
  rules: string[];
  handoffTriggers: string[];
  requiredFields: Record<string, string[]>;
};

export type ConversationSnapshot = {
  id: string;
  state: Record<string, unknown>;
  messages: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
};

export type KnowledgeResult = {
  id: string;
  content: string;
  sourceTitle?: string | null;
  sourceUri?: string | null;
  score?: number;
};

export type PageElementContext = {
  label?: string;
  selector?: string;
};

export type PageLinkContext = PageElementContext & {
  url?: string;
};

export type PageFormContext = PageElementContext & {
  fields?: string[];
};

export type PageContext = {
  title?: string;
  visibleText?: string;
  headings?: string[];
  buttons?: PageElementContext[];
  links?: PageLinkContext[];
  forms?: PageFormContext[];
};

export type BotContext = {
  bot: BotConfig;
  conversation: ConversationSnapshot;
  pageUrl?: string;
  pageContext?: PageContext;
  knowledge: KnowledgeResult[];
  requestedConfirmation?: boolean;
};

export type ToolResult = {
  content: string;
  actions?: FrontendAction[];
  data?: Record<string, unknown>;
};

export type LlmToolDefinition = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type BotTool<TInput = unknown> = {
  name: string;
  description: string;
  schema: z.ZodType<TInput>;
  requiresConfirmation?: boolean;
  toLlmTool: () => LlmToolDefinition;
  execute: (input: TInput, context: BotContext) => Promise<ToolResult>;
};

export type LlmToolCall = {
  id: string;
  name: string;
  arguments: string;
};

export type LlmMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; toolCalls?: LlmToolCall[] }
  | { role: "tool"; content: string; toolCallId: string };

export type LlmResponse = {
  content: string | null;
  toolCalls: LlmToolCall[];
};
