import { CHAIN_KEYS, type ChainKey, type PlatformStats } from "@elyagents/shared";
import { count, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "./db/client";
import { nativePrices } from "./engine/live";
import { env, liveExecutionEnabled } from "./env";
import { market } from "./market/service";

const { agents, decisions, positions, trades } = schema;

let cached: { at: number; value: PlatformStats } | null = null;

export async function getStats(fresh = false): Promise<PlatformStats> {
  if (!fresh && cached && Date.now() - cached.at < 10_000) return cached.value;
  const dayAgo = new Date(Date.now() - 86_400_000);
  const [kinds, active, moves, recent, open, last, prices] = await Promise.all([
    db.select({ kind: agents.kind, n: count() }).from(agents).groupBy(agents.kind),
    db.select({ n: count() }).from(agents).where(eq(agents.status, "ACTIVE")),
    db.select({ n: count() }).from(trades),
    db.select({ n: count() }).from(decisions).where(gte(decisions.createdAt, dayAgo)),
    db.select({ n: count() }).from(positions).where(eq(positions.status, "OPEN")),
    db.select({ at: sql<Date | null>`max(${agents.lastTickAt})` }).from(agents),
    nativePrices().catch(() => ({}) as Record<string, number>),
  ]);
  const lastTick = last[0]?.at ? new Date(last[0].at) : null;
  const value: PlatformStats = {
    platformAgents: kinds.find((k) => k.kind === "PLATFORM")?.n ?? 0,
    userAgents: kinds.find((k) => k.kind === "USER")?.n ?? 0,
    activeAgents: active[0]?.n ?? 0,
    agentMoves: moves[0]?.n ?? 0,
    decisions24h: recent[0]?.n ?? 0,
    openPositions: open[0]?.n ?? 0,
    tokensScanned: market.tokensScanned(),
    lastTickAt: lastTick ? lastTick.toISOString() : null,
    tickSeconds: env.ENGINE_TICK_SECONDS,
    ethUsd: prices.ETH ?? null,
    aiEnabled: env.aiEnabled,
    liveExecution: Object.fromEntries(CHAIN_KEYS.map((c) => [c, liveExecutionEnabled(c)])) as Record<ChainKey, boolean>,
  };
  cached = { at: Date.now(), value };
  return value;
}
