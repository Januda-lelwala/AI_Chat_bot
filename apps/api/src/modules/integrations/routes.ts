import type { FastifyInstance } from "fastify";

export async function integrationRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/integrations", async () => ({
    adapters: [
      { name: "shopify", status: "planned" },
      { name: "woocommerce", status: "planned" },
      { name: "stripe", status: "planned" },
      { name: "calendly", status: "planned" },
      { name: "hubspot", status: "planned" },
      { name: "zendesk", status: "planned" }
    ]
  }));
}
