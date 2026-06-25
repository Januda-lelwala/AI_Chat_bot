import "dotenv/config";
import { env } from "./config/env.js";
import { prisma } from "./lib/prisma.js";
import { closeQueues } from "./lib/redis.js";
import { buildServer } from "./server.js";

const app = await buildServer();

const shutdown = async () => {
  await app.close();
  await prisma.$disconnect();
  await closeQueues();
};

process.on("SIGINT", () => {
  void shutdown().then(() => process.exit(0));
});

process.on("SIGTERM", () => {
  void shutdown().then(() => process.exit(0));
});

await app.listen({
  port: env.PORT,
  host: "0.0.0.0"
});
