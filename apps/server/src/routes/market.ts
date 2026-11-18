import { isChainKey, looksLikeAddress, type ChainKey, type MarketFeed } from "@elyagents/shared";
import { and, desc, eq } from "drizzle-orm";
import { Router } from "express";
import { db, schema } from "../db/client";
import { HttpProblem } from "../lib/auth";
import { ELIGIBILITY, market } from "../market/service";
import type { OhlcvTimeframe } from "../market/geckoterminal";
import { toLaunch } from "../serializers";
import { handle, str } from "./helpers";

const { launches, agents, positions } = schema;
const FEEDS: MarketFeed[] = ["discover", "trending", "new", "top", "boosted"];
const TIMEFRAMES: OhlcvTimeframe[] = ["5m", "1h", "6h", "1d", "all"];

function chainParam(value: unknown): ChainKey {
  if (!isChainKey(value)) throw new HttpProblem(400, "Unsupported chain");
  return value;
}

export const marketRouter = Router();

marketRouter.get(
  "/markets",
  handle(async (req, res) => {
    const chain = chainParam(str(req.query.chain) ?? "robinhood");
    const feed = (FEEDS.includes(str(req.query.feed) as MarketFeed) ? str(req.query.feed) : "discover") as MarketFeed;
    const tokens = await market.board(chain, feed, str(req.query.q));
    res.json({ chain, feed, tokens, eligibility: ELIGIBILITY, health: market.chainHealth()[chain] });
  }),
);

marketRouter.get(
  "/tokens/:chain/:address",
  handle(async (req, res) => {
    const chain = chainParam(req.params.chain);
    const address = String(req.params.address);
    if (!looksLikeAddress(address)) throw new HttpProblem(400, "Invalid token address");
    const [token, pools] = await Promise.all([market.token(chain, address), market.tokenPools(chain, address)]);
    const [launch] = await db
      .select()
      .from(launches)
      .where(and(eq(launches.chain, chain), eq(launches.tokenAddress, address)));
    const holders = await db
      .select({ id: agents.id, name: agents.name, imageUri: agents.imageUri, characterId: agents.characterId, lastValue: positions.lastValue, costValue: positions.costValue })
      .from(positions)
      .innerJoin(agents, eq(agents.id, positions.agentId))
      .where(and(eq(positions.chain, chain), eq(positions.tokenAddress, address), eq(positions.status, "OPEN")))
      .orderBy(desc(positions.lastValue))
      .limit(20);
    res.json({
      token,
      pools: pools.slice(0, 10),
      launch: launch ? toLaunch(launch) : null,
      agentHolders: holders,
    });
  }),
);

marketRouter.get(
  "/tokens/:chain/:address/ohlcv",
  handle(async (req, res) => {
    const chain = chainParam(req.params.chain);
    const tf = (TIMEFRAMES.includes(str(req.query.tf) as OhlcvTimeframe) ? str(req.query.tf) : "1d") as OhlcvTimeframe;
    let pool = str(req.query.pool);
    if (!pool) {
      const token = await market.token(chain, String(req.params.address));
      pool = token?.pairAddress ?? undefined;
    }
    if (!pool) {
      res.json({ candles: [], pool: null });
      return;
    }
    const candles = await market.ohlcv(chain, pool, tf).catch(() => []);
    res.json({ candles, pool, timeframe: tf });
  }),
);
