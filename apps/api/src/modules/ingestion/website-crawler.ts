import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";

export type WebsiteCrawlOptions = {
  maxPages?: number;
  maxDepth?: number;
  timeoutMs?: number;
  userAgent?: string;
  includePaths?: string[];
  excludePaths?: string[];
};

export type CrawledWebsitePage = {
  url: string;
  title?: string;
  content: string;
  metadata: Record<string, unknown>;
};

type NormalizedCrawlOptions = Required<Pick<WebsiteCrawlOptions, "maxPages" | "maxDepth" | "timeoutMs" | "userAgent">> &
  Pick<WebsiteCrawlOptions, "includePaths" | "excludePaths">;

type QueuedUrl = {
  url: string;
  depth: number;
};

const DEFAULT_USER_AGENT = "AIChatBotWebsiteIngestion/0.1";
const SKIPPED_EXTENSIONS = new Set([
  ".7z",
  ".avi",
  ".css",
  ".csv",
  ".doc",
  ".docx",
  ".gif",
  ".gz",
  ".ico",
  ".jpeg",
  ".jpg",
  ".js",
  ".json",
  ".mp3",
  ".mp4",
  ".mpeg",
  ".pdf",
  ".png",
  ".ppt",
  ".pptx",
  ".rar",
  ".svg",
  ".tar",
  ".webm",
  ".webp",
  ".xls",
  ".xlsx",
  ".xml",
  ".zip"
]);

export async function crawlWebsite(startUrl: string, options: WebsiteCrawlOptions = {}): Promise<CrawledWebsitePage[]> {
  const crawlOptions = normalizeOptions(options);
  const origin = new URL(startUrl).origin;
  const start = normalizeUrl(startUrl, origin, crawlOptions);
  if (!start) {
    throw new Error(`Website ingestion URL is not crawlable: ${startUrl}`);
  }

  const queue: QueuedUrl[] = [{ url: start, depth: 0 }];
  const queued = new Set<string>([start]);
  const visited = new Set<string>();
  const pages: CrawledWebsitePage[] = [];

  while (queue.length && pages.length < crawlOptions.maxPages) {
    const next = queue.shift();
    if (!next || visited.has(next.url)) {
      continue;
    }

    visited.add(next.url);

    const page = await fetchAndExtractPage(next.url, origin, crawlOptions);
    if (!page) {
      continue;
    }

    pages.push({
      url: page.url,
      title: page.title,
      content: page.content,
      metadata: {
        ...page.metadata,
        crawlDepth: next.depth,
        ingestedBy: "website-crawler"
      }
    });

    if (next.depth >= crawlOptions.maxDepth) {
      continue;
    }

    for (const link of page.links) {
      if (queued.has(link) || visited.has(link) || queue.length + pages.length >= crawlOptions.maxPages) {
        continue;
      }
      queued.add(link);
      queue.push({ url: link, depth: next.depth + 1 });
    }
  }

  if (!pages.length) {
    throw new Error(`No public HTML pages could be extracted from ${start}`);
  }

  return pages;
}

async function fetchAndExtractPage(
  url: string,
  origin: string,
  options: NormalizedCrawlOptions
): Promise<(CrawledWebsitePage & { links: string[] }) | null> {
  const response = await fetch(url, {
    headers: {
      accept: "text/html,application/xhtml+xml",
      "user-agent": options.userAgent
    },
    redirect: "follow",
    signal: AbortSignal.timeout(options.timeoutMs)
  });

  if (!response.ok) {
    return null;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("text/html")) {
    return null;
  }

  const finalUrl = normalizeUrl(response.url || url, origin, options);
  if (!finalUrl) {
    return null;
  }

  const html = await response.text();
  return extractPage(finalUrl, html, origin, options);
}

function extractPage(
  url: string,
  html: string,
  origin: string,
  options: NormalizedCrawlOptions
): CrawledWebsitePage & { links: string[] } {
  const $ = cheerio.load(html);

  $("script, style, noscript, svg, canvas, iframe, template").remove();

  const title = cleanText($("title").first().text()) || undefined;
  const description = cleanText($('meta[name="description"]').attr("content") ?? "") || undefined;
  const headings = unique(
    $("h1, h2, h3")
      .map((_, element) => cleanText($(element).text()))
      .get()
      .filter(Boolean)
  ).slice(0, 80);

  const links = unique(
    $("a[href]")
      .map((_, element) => normalizeUrl($(element).attr("href") ?? "", origin, options, url))
      .get()
      .filter((link): link is string => Boolean(link))
  );

  const linkSummaries = unique(
    $("a[href]")
      .map((_, element) => {
        const label = cleanText($(element).text() || $(element).attr("aria-label") || "");
        const href = normalizeUrl($(element).attr("href") ?? "", origin, options, url);
        if (!label || !href) {
          return "";
        }
        return `${label} -> ${href}`;
      })
      .get()
      .filter(Boolean)
  ).slice(0, 100);

  const buttons = unique(
    $("button, input[type='button'], input[type='submit'], a[role='button']")
      .map((_, element) => {
        const label = cleanText(
          $(element).text() ||
            $(element).attr("value") ||
            $(element).attr("aria-label") ||
            $(element).attr("title") ||
            ""
        );
        return label;
      })
      .get()
      .filter(Boolean)
  ).slice(0, 80);

  const forms = $("form")
    .map((index, element) => {
      const form = $(element);
      const action = normalizeUrl(form.attr("action") ?? url, origin, options, url) ?? url;
      const method = (form.attr("method") ?? "GET").toUpperCase();
      const fields = unique(
        form
          .find("input, textarea, select")
          .map((_, field) => {
            const input = $(field);
            const label = findFieldLabel($, field);
            const name = input.attr("name") || input.attr("id") || "";
            const type = input.attr("type") || input.prop("tagName")?.toString().toLowerCase() || "field";
            return cleanText([label, name, type].filter(Boolean).join(" "));
          })
          .get()
          .filter(Boolean)
      ).slice(0, 40);

      return {
        index,
        action,
        method,
        fields
      };
    })
    .get()
    .slice(0, 20);

  const visibleText = cleanText($("body").text()).slice(0, 120_000);
  const content = buildKnowledgeContent({
    url,
    title,
    description,
    headings,
    links: linkSummaries,
    buttons,
    forms,
    visibleText
  });

  return {
    url,
    title,
    content,
    links,
    metadata: {
      description,
      headings,
      links: linkSummaries,
      buttons,
      forms,
      extractedTextLength: visibleText.length
    }
  };
}

function buildKnowledgeContent(input: {
  url: string;
  title?: string;
  description?: string;
  headings: string[];
  links: string[];
  buttons: string[];
  forms: Array<{ index: number; action: string; method: string; fields: string[] }>;
  visibleText: string;
}): string {
  const sections = [
    `Website page: ${input.title ?? input.url}`,
    `URL: ${input.url}`,
    input.description ? `Description: ${input.description}` : undefined,
    input.headings.length ? `Headings:\n${input.headings.map((heading) => `- ${heading}`).join("\n")}` : undefined,
    input.links.length ? `Links:\n${input.links.map((link) => `- ${link}`).join("\n")}` : undefined,
    input.buttons.length ? `Buttons and calls to action:\n${input.buttons.map((button) => `- ${button}`).join("\n")}` : undefined,
    input.forms.length
      ? `Forms:\n${input.forms
          .map(
            (form) =>
              `- Form ${form.index + 1}: ${form.method} ${form.action}${
                form.fields.length ? `; fields: ${form.fields.join(", ")}` : ""
              }`
          )
          .join("\n")}`
      : undefined,
    input.visibleText ? `Visible page text:\n${input.visibleText}` : undefined
  ];

  return sections.filter((section): section is string => Boolean(section)).join("\n\n");
}

function findFieldLabel($: cheerio.CheerioAPI, field: AnyNode): string {
  const input = $(field);
  const id = input.attr("id");
  if (id) {
    const explicitLabel = cleanText($(`label[for='${cssAttributeEscape(id)}']`).first().text());
    if (explicitLabel) {
      return explicitLabel;
    }
  }

  const wrappingLabel = cleanText(input.closest("label").text());
  if (wrappingLabel) {
    return wrappingLabel;
  }

  return cleanText(input.attr("aria-label") || input.attr("placeholder") || "");
}

function normalizeOptions(options: WebsiteCrawlOptions): NormalizedCrawlOptions {
  return {
    maxPages: clampInteger(options.maxPages ?? 1, 1, 50),
    maxDepth: clampInteger(options.maxDepth ?? 0, 0, 5),
    timeoutMs: clampInteger(options.timeoutMs ?? 10_000, 1_000, 30_000),
    userAgent: options.userAgent?.trim() || DEFAULT_USER_AGENT,
    includePaths: options.includePaths?.filter(Boolean),
    excludePaths: options.excludePaths?.filter(Boolean)
  };
}

function normalizeUrl(
  value: string,
  origin: string,
  options: Pick<WebsiteCrawlOptions, "includePaths" | "excludePaths">,
  baseUrl?: string
): string | null {
  try {
    const url = new URL(value, baseUrl ?? origin);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    if (url.origin !== origin) {
      return null;
    }

    url.hash = "";

    if (isSkippedPath(url.pathname)) {
      return null;
    }
    if (!isPathAllowed(url.pathname, options)) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

function isSkippedPath(pathname: string): boolean {
  const lowerPath = pathname.toLowerCase();
  for (const extension of SKIPPED_EXTENSIONS) {
    if (lowerPath.endsWith(extension)) {
      return true;
    }
  }
  return false;
}

function isPathAllowed(pathname: string, options: Pick<WebsiteCrawlOptions, "includePaths" | "excludePaths">): boolean {
  if (options.excludePaths?.some((path) => pathname.startsWith(path))) {
    return false;
  }

  if (options.includePaths?.length) {
    return options.includePaths.some((path) => pathname.startsWith(path));
  }

  return true;
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(Math.max(Math.trunc(value), min), max);
}

function cssAttributeEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
