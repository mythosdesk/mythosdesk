import { CHAIN_KEYS, CHARACTERS, characterFor, type ChainPerformance, type LeaderboardRow } from "@elyagents/shared";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { Router } from "express";
import { db, schema } from "../db/client";
import { HttpProblem } from "../lib/auth";
import { toAgent, toDecision, toLaunch, toPosition, toTrade, type AgentRow, type PositionRow } from "../serializers";
import { handle, str } from "./helpers";

const { agents, positions, trades, decisions, equitySnapshots, launches } = schema;

export async function openPositionsFor(ids: string[]): Promise<Map<string, PositionRow[]>> {
  const map = new Map<string, PositionRow[]>();
  if (ids.length === 0) return map;
  const rows = await db
    .select()
    .from(positions)
    .where(and(eq(positions.status, "OPEN"), inArray(positions.agentId, ids)));
  for (const row of rows) map.set(row.agentId, [...(map.get(row.agentId) ?? []), row]);
  return map;
}

export async function summarize(rows: AgentRow[]) {
  const open = await openPositionsFor(rows.map((r) => r.id));
  return rows.map((r) => toAgent(r, open.get(r.id) ?? []));
}

/** Downsample an equity series to at most `max` points. */
function downsample<T>(points: T[], max: number): T[] {
  if (points.length <= max) return points;
  const step = points.length / max;
  return Array.from({ length: max }, (_, i) => points[Math.floor(i * step)]).concat(points.at(-1)!);
}

export const agentsRouter = Router();

agentsRouter.get(
  "/agents",
  handle(async (req, res) => {
    const kind = str(req.query.kind);
    const strategy = str(req.query.strategy);
    const q = str(req.query.q)?.toLowerCase().trim();
    const filters = [];
    if (kind === "PLATFORM" || kind === "USER") filters.push(eq(agents.kind, kind));
    if (strategy) filters.push(eq(agents.strategyId, strategy));
    const rows = await db
      .select()
      .from(agents)
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(sql`case when ${agents.kind} = 'PLATFORM' then 0 else 1 end`, desc(agents.updatedAt))
      .limit(300);
    const list = (await summarize(rows)).filter(
      (a) => !q || a.name.toLowerCase().includes(q) || a.strategyName.toLowerCase().includes(q) || a.symbol.toLowerCase().includes(q),
    );
    res.json({ agents: list });
  }),
);

agentsRouter.get(
  "/agents/feed",
  handle(async (req, res) => {
    const action = str(req.query.action)?.toUpperCase();
    const agentId = str(req.query.agentId);
    const limit = Math.min(Number(req.query.limit) || 40, 200);
    const filters = [];
    if (action === "BUY" || action === "SELL" || action === "HOLD") filters.push(eq(decisions.action, action));
    if (agentId) filters.push(eq(decisions.agentId, agentId));
    const rows = await db
      .select({ d: decisions, a: { name: agents.name, imageUri: agents.imageUri, strategyName: agents.strategyName, characterId: agents.characterId } })
      .from(decisions)
      .innerJoin(agents, eq(agents.id, decisions.agentId))
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(decisions.createdAt))
      .limit(limit);
    const since = new Date(Date.now() - 86_400_000);
    const counts = await db
      .select({ action: decisions.action, n: sql<number>`count(*)::int` })
      .from(decisions)
      .where(gte(decisions.createdAt, since))
      .groupBy(decisions.action);
    res.json({
      decisions: rows.map((r) => toDecision(r.d, r.a)),
      counts: Object.fromEntries(counts.map((c) => [c.action, Number(c.n)])),
    });
  }),
);

agentsRouter.get(
  "/trades/recent",
  handle(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 12, 50);
    const rows = await db
      .select({ t: trades, name: agents.name, imageUri: agents.imageUri, characterId: agents.characterId })
      .from(trades)
      .innerJoin(agents, eq(agents.id, trades.agentId))
      .orderBy(desc(trades.createdAt))
      .limit(limit);
    res.json({
      trades: rows.map((r) => ({ ...toTrade(r.t), agentName: r.name, imageUri: r.imageUri, characterId: r.characterId })),
    });
  }),
);

agentsRouter.get(
  "/agents/:id",
  handle(async (req, res) => {
    const id = String(req.params.id);
    const [row] = await db.select().from(agents).where(eq(agents.id, id));
    if (!row) throw new HttpProblem(404, "Agent not found");
    const [allPositions, tradeRows, decisionRows, equityRows] = await Promise.all([
      db.select().from(positions).where(eq(positions.agentId, id)).orderBy(desc(positions.openedAt)).limit(200),
      db.select().from(trades).where(eq(trades.agentId, id)).orderBy(desc(trades.createdAt)).limit(200),
      db.select().from(decisions).where(eq(decisions.agentId, id)).orderBy(desc(decisions.createdAt)).limit(80),
      db
        .select({ v: equitySnapshots.value, t: equitySnapshots.createdAt })
        .from(equitySnapshots)
        .where(and(eq(equitySnapshots.agentId, id), gte(equitySnapshots.createdAt, new Date(Date.now() - 7 * 86_400_000))))
        .orderBy(equitySnapshots.createdAt),
    ]);
    const open = allPositions.filter((p) => p.status === "OPEN");
    const closed = allPositions.filter((p) => p.status === "CLOSED");

    const chainPerformance: ChainPerformance[] = CHAIN_KEYS.map((chain) => {
      const ps = allPositions.filter((p) => p.chain === chain);
      const realized = ps.reduce((s, p) => s + (p.status === "CLOSED" ? (p.realizedPnl ?? 0) : 0), 0);
      const unrealized = ps.reduce((s, p) => s + (p.status === "OPEN" ? p.lastValue - p.costValue : 0), 0);
      return {
        chain,
        realized,
        unrealized,
        pnl: realized + unrealized,
        positionValue: ps.filter((p) => p.status === "OPEN").reduce((s, p) => s + p.lastValue, 0),
        trades: tradeRows.filter((t) => t.chain === chain).length,
        positions: ps.length,
      };
    });

    let launch = null;
    if (row.launchId) {
      const [l] = await db.select().from(launches).where(eq(launches.id, row.launchId));
      if (l) launch = toLaunch(l, { agentName: row.name, characterId: row.characterId, strategyName: row.strategyName });
    }

    const equity = downsample(
      [{ t: row.createdAt, v: row.startingBalance }, ...equityRows].map((e) => ({ t: e.t.toISOString(), v: e.v })),
      160,
    );

    res.json({
      agent: toAgent(row, open),
      positions: open.map(toPosition),
      closedPositions: closed.slice(0, 60).map(toPosition),
      decisions: decisionRows.map((d) => toDecision(d, row)),
      trades: tradeRows.map(toTrade),
      equity,
      chainPerformance,
      launch,
    });
  }),
);

agentsRouter.get(
  "/leaderboard",
  handle(async (req, res) => {
    const family = str(req.query.family);
    const rows = await db.select().from(agents).limit(500);
    const list = (await summarize(rows))
      .filter((a) => a.kind === "PLATFORM" || a.trades > 0)
      .filter((a) => !family || characterFor(a.characterId).family === family);
    list.sort((a, b) => b.pnlPercent - a.pnlPercent || b.trades - a.trades);
    const top = list.slice(0, 100);
    const ids = top.map((a) => a.id);
    const spark = new Map<string, number[]>();
    if (ids.length) {
      const points = await db
        .select({ agentId: equitySnapshots.agentId, v: equitySnapshots.value })
        .from(equitySnapshots)
        .where(and(inArray(equitySnapshots.agentId, ids), gte(equitySnapshots.createdAt, new Date(Date.now() - 86_400_000))))
        .orderBy(equitySnapshots.createdAt);
      for (const p of points) spark.set(p.agentId, [...(spark.get(p.agentId) ?? []), p.v]);
    }
    const rowsOut: LeaderboardRow[] = top.map((agent, i) => ({
      rank: i + 1,
      agent,
      sparkline: downsample(spark.get(agent.id) ?? [], 32),
    }));
    res.json({ rows: rowsOut, families: [...new Set(CHARACTERS.map((c) => c.family))] });
  }),
);
