import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().default("redis://localhost:6379"),
  LLM_PROVIDER: z.enum(["openai", "anthropic", "openrouter"]).default("openai"),
  EMBEDDING_PROVIDER: z.enum(["openai", "none"]).default("openai"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_CHAT_MODEL: z.string().default("gpt-4o-mini"),
  OPENAI_EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default("claude-3-5-haiku-latest"),
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_CHAT_MODEL: z.string().default("openai/gpt-4o-mini"),
  OPENROUTER_BASE_URL: z.string().url().default("https://openrouter.ai/api/v1"),
  OPENROUTER_SITE_URL: z.string().url().optional(),
  OPENROUTER_APP_NAME: z.string().default("AI Chatbot Backend"),
  LLM_MAX_TOKENS: z.coerce.number().int().positive().default(1024),
  S3_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional()
}).superRefine((value, context) => {
  if (value.LLM_PROVIDER === "openai" && !value.OPENAI_API_KEY) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["OPENAI_API_KEY"],
      message: "OPENAI_API_KEY is required when LLM_PROVIDER=openai"
    });
  }

  if (value.LLM_PROVIDER === "anthropic" && !value.ANTHROPIC_API_KEY) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["ANTHROPIC_API_KEY"],
      message: "ANTHROPIC_API_KEY is required when LLM_PROVIDER=anthropic"
    });
  }

  if (value.LLM_PROVIDER === "openrouter" && !value.OPENROUTER_API_KEY) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["OPENROUTER_API_KEY"],
      message: "OPENROUTER_API_KEY is required when LLM_PROVIDER=openrouter"
    });
  }

  if (value.EMBEDDING_PROVIDER === "openai" && !value.OPENAI_API_KEY) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["OPENAI_API_KEY"],
      message: "OPENAI_API_KEY is required when EMBEDDING_PROVIDER=openai"
    });
  }
});

export type AppEnv = z.infer<typeof envSchema>;

export const env = envSchema.parse(process.env);
