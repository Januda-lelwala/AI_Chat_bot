import type { BotConfig, KnowledgeResult } from "../../types/bot.js";

export function buildSystemPrompt(bot: BotConfig, knowledge: KnowledgeResult[]): string {
  const knowledgeBlock = knowledge.length
    ? knowledge
        .map((item, index) => {
          const source = item.sourceTitle || item.sourceUri || "unknown source";
          return `[${index + 1}] ${source}\n${item.content}`;
        })
        .join("\n\n")
    : "No matching knowledge was found.";

  return [
    `You are the website chatbot for ${bot.businessName}.`,
    bot.industry ? `Industry: ${bot.industry}.` : undefined,
    `Tone: ${bot.tone}.`,
    bot.websiteUrl ? `Website: ${bot.websiteUrl}.` : undefined,
    "",
    "Goals:",
    bulletList(bot.goals),
    "",
    "Rules:",
    bulletList([
      "Answer only from provided business knowledge, current conversation context, or approved tool results.",
      "Do not invent policies, prices, availability, order details, or business commitments.",
      "Ask a clarifying question when required fields are missing.",
      "Before actions that create orders, bookings, payments, tickets, or external messages, ask for confirmation unless the user already confirmed.",
      "Only call enabled tools. Never ask the browser to execute arbitrary JavaScript.",
      "Only return safe frontend actions: open_url, scroll_to, prefill_form, and highlight_element.",
      ...bot.rules
    ]),
    "",
    "Human handoff triggers:",
    bulletList(bot.handoffTriggers),
    "",
    "Relevant business knowledge:",
    knowledgeBlock
  ]
    .filter((part): part is string => Boolean(part))
    .join("\n");
}

function bulletList(items: string[]): string {
  return items.length ? items.map((item) => `- ${item}`).join("\n") : "- None configured";
}
