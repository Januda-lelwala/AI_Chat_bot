import type { BotConfig, KnowledgeResult, PageContext } from "../../types/bot.js";

export function buildSystemPrompt(bot: BotConfig, knowledge: KnowledgeResult[], pageContext?: PageContext, pageUrl?: string): string {
  const knowledgeBlock = knowledge.length
    ? knowledge
        .map((item, index) => {
          const source = item.sourceTitle || item.sourceUri || "unknown source";
          return `[${index + 1}] ${source}\n${item.content}`;
        })
        .join("\n\n")
    : "No matching knowledge was found.";

  const pageContextBlock = buildPageContextBlock(pageContext, pageUrl);

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
      "Use live page context only for the current conversation. Do not treat logged-in page data as shared business knowledge.",
      "When live page context includes selectors, use highlight_element, scroll_to_section, or prefill_form to guide the visitor instead of describing CSS selectors.",
      ...bot.rules
    ]),
    "",
    "Human handoff triggers:",
    bulletList(bot.handoffTriggers),
    "",
    "Current live page context:",
    pageContextBlock,
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

function buildPageContextBlock(pageContext?: PageContext, pageUrl?: string): string {
  if (!pageContext) {
    return "No live page context was provided by the browser.";
  }

  const sections = [
    pageUrl ? `Page URL: ${pageUrl}` : undefined,
    pageContext.title ? `Page title: ${pageContext.title}` : undefined,
    pageContext.headings?.length ? `Visible headings:\n${bulletList(pageContext.headings.slice(0, 30))}` : undefined,
    pageContext.buttons?.length
      ? `Visible buttons and calls to action:\n${pageContext.buttons
          .slice(0, 40)
          .map((button) => formatElement(button))
          .join("\n")}`
      : undefined,
    pageContext.links?.length
      ? `Visible links:\n${pageContext.links.slice(0, 40).map((link) => formatElement(link, link.url)).join("\n")}`
      : undefined,
    pageContext.forms?.length
      ? `Visible forms:\n${pageContext.forms
          .slice(0, 20)
          .map((form) => {
            const fields = form.fields?.length ? `; fields: ${form.fields.slice(0, 20).join(", ")}` : "";
            return formatElement(form, fields);
          })
          .join("\n")}`
      : undefined,
    pageContext.visibleText ? `Visible page text:\n${truncate(pageContext.visibleText, 6000)}` : undefined
  ];

  return sections.filter((section): section is string => Boolean(section)).join("\n\n") || "No usable live page context was provided.";
}

function formatElement(element: { label?: string; selector?: string }, suffix?: string): string {
  const label = element.label || "Unlabeled element";
  const selector = element.selector ? ` selector: ${element.selector}` : "";
  const details = suffix ? ` ${suffix}` : "";
  return `- ${label}${selector}${details}`;
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}
