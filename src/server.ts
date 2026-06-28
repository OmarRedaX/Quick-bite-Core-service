import "reflect-metadata";
import http from "http";
import { createApp } from "./app";
import { env } from "./common/config/env";
import { db } from "./common/knex/knex";
import { logger } from "./common/logger/logger";

const app = createApp();
const server = http.createServer(app);

server.listen(env.port, () => {
  logger.info(`Server is running on port ${env.port}`);
});

async function shutdown() {
  server.close(async () => {
    console.log("Shutting down server...");
    await db.destroy();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
