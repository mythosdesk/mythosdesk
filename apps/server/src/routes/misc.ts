import { BRAND, CHAINS, isChainKey } from "@elyagents/shared";
import { desc } from "drizzle-orm";
import { Router } from "express";
import { db, schema } from "../db/client";
import { env } from "../env";
import { engine } from "../engine/worker";
import { market } from "../market/service";
import { onlineCount } from "../realtime";
import { getStats } from "../stats";
import { launchConfig } from "./launch";
import { handle } from "./helpers";

export const miscRouter = Router();

miscRouter.get(
  "/health",
  handle(async (_req, res) => {
    res.json({
      ok: true,
      engine: { enabled: env.ENGINE_ENABLED, lastTickAt: engine.lastTickAt, lastTickMs: engine.lastTickMs },
      ai: env.aiEnabled ? env.AI_MODEL : null,
      markets: market.chainHealth(),
      online: onlineCount(),
    });
  }),
);

miscRouter.get(
  "/stats",
  handle(async (_req, res) => {
    res.json(await getStats());
  }),
);

miscRouter.get(
  "/config",
  handle(async (_req, res) => {
    res.json({
      brand: BRAND,
      aiEnabled: env.aiEnabled,
      engineTickSeconds: env.ENGINE_TICK_SECONDS,
      launch: await launchConfig(),
    });
  }),
);

miscRouter.get(
  "/ca",
  handle(async (_req, res) => {
    const chain = isChainKey(env.OFFICIAL_TOKEN_CHAIN) ? env.OFFICIAL_TOKEN_CHAIN : "robinhood";
    res.json({ ca: env.OFFICIAL_TOKEN_ADDRESS || null, chain, chainName: CHAINS[chain].name });
  }),
);

miscRouter.get(
  "/burns",
  handle(async (_req, res) => {
    const chain = isChainKey(env.OFFICIAL_TOKEN_CHAIN) ? env.OFFICIAL_TOKEN_CHAIN : "robinhood";
    const token = env.OFFICIAL_TOKEN_ADDRESS ? await market.token(chain, env.OFFICIAL_TOKEN_ADDRESS).catch(() => null) : null;
    const rows = await db.select().from(schema.burns).orderBy(desc(schema.burns.createdAt)).limit(100);
    res.json({
      ca: env.OFFICIAL_TOKEN_ADDRESS || null,
      chain,
      token,
      burns: rows.map((b) => ({ ...b, createdAt: b.createdAt.toISOString(), explorer: CHAINS[chain].explorerTx(b.txHash) })),
      status: rows.length ? "active" : "not-started",
    });
  }),
);
