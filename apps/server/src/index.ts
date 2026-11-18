import { createServer } from "node:http";
import path from "node:path";
import cors from "cors";
import express from "express";
import { rateLimit } from "express-rate-limit";
import { closeDb, runMigrations } from "./db/client";
import { seed } from "./db/seed";
import { engine } from "./engine/worker";
import { env } from "./env";
import { log } from "./log";
import { market } from "./market/service";
import { initRealtime } from "./realtime";
import { agentsRouter } from "./routes/agents";
import { authRouter } from "./routes/auth";
import { floorRouter } from "./routes/floor";
import { errorMiddleware } from "./routes/helpers";
import { launchRouter } from "./routes/launch";
import { marketRouter } from "./routes/market";
import { meRouter } from "./routes/me";
import { miscRouter } from "./routes/misc";
import { proofRouter } from "./routes/proof";

async function main() {
  await runMigrations();
  await seed();

  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", env.TRUST_PROXY);
  app.use(cors({ origin: env.webOrigins, credentials: true }));
  app.use(express.json({ limit: "256kb" }));
  app.use(
    "/api",
    rateLimit({ windowMs: 60_000, limit: 600, standardHeaders: "draft-8", legacyHeaders: false }),
  );
  app.use("/uploads", express.static(path.join(env.dataDir, "uploads"), { maxAge: "7d", fallthrough: false }));

  app.use("/api", miscRouter, proofRouter, agentsRouter, marketRouter, floorRouter, authRouter, meRouter, launchRouter);
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not found" });
  });
  app.use(errorMiddleware);

  const server = createServer(app);
  initRealtime(server);
  server.listen(env.PORT, env.HOST, () => {
    log.info(`server listening on http://${env.HOST}:${env.PORT}`);
  });

  void market.refreshUniverse(true);
  engine.start();

  const shutdown = async (signal: string) => {
    log.info(`${signal} received, shutting down`);
    engine.stop();
    server.close();
    await closeDb();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  log.error(err);
  process.exit(1);
});
