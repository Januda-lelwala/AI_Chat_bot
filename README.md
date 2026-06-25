# AI Chatbot Backend

Reusable multi-tenant chatbot backend for websites and businesses. It is designed to be configured per business with bot settings, knowledge sources, and plugin-style tools instead of hardcoded business logic.

## Stack

- Node.js, TypeScript, Fastify
- LangGraph.js agent workflow
- Modular chat providers: OpenAI, Anthropic, and OpenRouter
- OpenAI embeddings for pgvector knowledge search, or disabled embeddings for chat-only deployments
- PostgreSQL, Prisma, pgvector
- Redis and BullMQ
- S3-compatible storage target such as Cloudflare R2, AWS S3, or MinIO
- Docker Compose for local infrastructure

## Project Structure

```text
apps/api
  prisma/schema.prisma
  src/config              environment parsing
  src/lib                 Prisma, Redis, provider clients
  src/modules/bots        bot config loading and prompt builder
  src/modules/chat        /api/chat, LLM abstraction, LangGraph workflow
  src/modules/tools       plugin registry, permission checks, generic tools
  src/modules/knowledge   pgvector search and source creation
  src/modules/ingestion   BullMQ queue route and text ingestion worker
  src/modules/conversations
  src/modules/integrations
  src/modules/webhooks
```

## Setup

1. Copy the example environment:

```bash
cp apps/api/.env.example apps/api/.env
```

2. Choose a chat provider in `LLM_PROVIDER` and fill in the matching API key.

### Option A: Run everything in Docker

Use this for server-style setup:

```bash
docker compose up -d --build
```

This starts the API, PostgreSQL, Redis, and MinIO. The API container listens on `http://localhost:3000` and applies the Prisma schema on startup.

### Option B: Run only dependencies in Docker

Use this for local TypeScript development with hot reload:

```bash
docker compose up -d postgres redis minio
```

Then install dependencies and initialize Prisma:

```bash
npm install
npm run prisma:generate
npm run prisma:migrate
```

Then start the API with hot reload:

```bash
npm run dev
```

When running the API inside Docker, Compose overrides service URLs so the API connects to `postgres`, `redis`, and `minio` internally. Keep `apps/api/.env` for provider settings and secrets such as `OPENROUTER_API_KEY`.

## Core Chat Flow

`POST /api/chat` accepts:

```json
{
  "botId": "bot-id",
  "conversationId": "optional-conversation-id",
  "message": "What services do you offer?",
  "pageUrl": "https://example.com/services",
  "confirmed": false
}
```

The backend:

1. Loads the bot configuration.
2. Loads or creates the conversation.
3. Retrieves relevant knowledge from pgvector.
4. Builds the system prompt.
5. Runs the LangGraph agent.
6. Allows only enabled tools.
7. Validates tool input.
8. Checks confirmation requirements.
9. Executes approved tools.
10. Logs every tool execution.
11. Saves user and assistant messages.
12. Returns the assistant response and optional safe frontend actions.

Frontend actions are restricted to `open_url`, `scroll_to`, `prefill_form`, and `highlight_element`. The backend never asks the frontend to execute arbitrary JavaScript.

## Model Providers

The chat layer is provider-agnostic. The Fastify routes, LangGraph workflow, tools, and knowledge modules depend on the internal `LlmProvider` interface, not on a vendor SDK.

Provider selection lives in `apps/api/.env`:

```bash
LLM_PROVIDER=openai
EMBEDDING_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_CHAT_MODEL=gpt-4o-mini
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
```

Anthropic chat:

```bash
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-3-5-haiku-latest

# Required if you want pgvector knowledge search.
EMBEDDING_PROVIDER=openai
OPENAI_API_KEY=sk-...
```

OpenRouter chat:

```bash
LLM_PROVIDER=openrouter
OPENROUTER_API_KEY=sk-or-...
OPENROUTER_CHAT_MODEL=openai/gpt-4o-mini
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_SITE_URL=https://your-site.example
OPENROUTER_APP_NAME=AI Chatbot Backend

# Required if you want pgvector knowledge search.
EMBEDDING_PROVIDER=openai
OPENAI_API_KEY=sk-...
```

For chat-only deployments without vector search:

```bash
EMBEDDING_PROVIDER=none
```

Provider adapters are implemented in [llm-provider.ts](apps/api/src/modules/chat/llm-provider.ts). OpenAI and OpenRouter use the OpenAI-compatible chat-completions format. Anthropic uses the Messages API format and maps internal tool calls to `tool_use` and `tool_result` blocks.

## Creating a Business Bot

Use `POST /api/bots` with the shape in [apps/api/examples/example-bot-config.json](apps/api/examples/example-bot-config.json). The response includes the generated `bot.id`, which is the `botId` for chat requests.

Important configuration fields:

- `businessName`, `industry`, `tone`, `websiteUrl`
- `goals`, `rules`, `handoffTriggers`
- `enabledTools`
- `requiredFields`, keyed by tool name

## Knowledge Ingestion

Queue a text ingestion job:

```bash
curl -X POST http://localhost:3000/api/ingestion/jobs \
  -H 'content-type: application/json' \
  -d '{
    "businessId": "business-id",
    "botId": "optional-bot-id",
    "type": "text",
    "uri": "manual://faq",
    "title": "FAQ",
    "content": "Paste approved business knowledge here."
  }'
```

Run the worker in a second terminal:

```bash
npm run worker:ingestion --workspace @chatbot/api
```

Website crawling, document parsing, and object storage upload are intentionally left as adapter points. The current worker implements direct text ingestion and vectorization.

## Adding a New Tool

1. Create a `BotTool` in [apps/api/src/modules/tools/definitions.ts](apps/api/src/modules/tools/definitions.ts).
2. Define a Zod schema for input validation.
3. Scope all reads and writes by `botId` or `businessId`.
4. Set `requiresConfirmation: true` for actions that create orders, bookings, payments, tickets, or external messages.
5. Register the tool in [apps/api/src/modules/tools/default-registry.ts](apps/api/src/modules/tools/default-registry.ts).
6. Add the tool name to a bot's `enabledTools`.

The existing generic tools are:

- `search_knowledge`
- `collect_lead`
- `human_handoff`
- `open_url`
- `scroll_to_section`
- `create_ticket`

## Integrations

The `/api/integrations` endpoint lists planned adapter slots for Shopify, WooCommerce, Stripe, Calendly, HubSpot, and Zendesk. Add adapter clients under `src/modules/integrations` and call them from tools rather than embedding vendor logic in the chat workflow.

## Safety Rules

- No business-specific logic is hardcoded.
- The prompt tells the model not to invent policies, prices, availability, or order details.
- Tools are enabled per bot.
- Tool input is schema validated.
- Confirmation is required before ticket creation and should be enabled for any external side-effecting tool.
- All tool execution attempts are stored in `ToolExecution`.
