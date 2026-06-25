import OpenAI from "openai";

export function createOpenAiClient(input: {
  apiKey: string;
  baseURL?: string;
  defaultHeaders?: Record<string, string>;
}): OpenAI {
  return new OpenAI({
    apiKey: input.apiKey,
    baseURL: input.baseURL,
    defaultHeaders: input.defaultHeaders
  });
}
