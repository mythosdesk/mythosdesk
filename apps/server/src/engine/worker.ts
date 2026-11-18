import { BRAND, type ChainKey, type MarketToken } from "@elyagents/shared";
import { and, eq, inArray, lt } from "drizzle-orm";
import { resetTickBudget } from "../ai/model";
import { db, schema } from "../db/client";
import { env } from "../env";
import { fmtPct, fmtQty, mapLimit, minutesSince, newId } from "../lib/util";
import { errorMessage, log } from "../log";
import { market } from "../market/service";
import { emit } from "../realtime";
import { toAgent, toDecision, toTrade, type AgentRow, type PositionRow } from "../serializers";
import { getStats } from "../stats";
import { decide } from "./brain";
import { DRAINED_LIQUIDITY_USD, liveBuy, liveSell, liveReadiness } from "./live";
import { paperBuy, paperSell } from "./paper";
import { routeCheck } from "./route";

const { agents, positions, trades, decisions, equitySnapshots } = schema;

/** Smallest entry worth sending, in credits (paper) or USD (live). */
const MIN_SPEND = 0.5;

type Quotes = Map<string, MarketToken>;
const keyOf = (chain: string, address: string) => `${chain}:${address.toLowerCase()}`;

interface PendingDecision {
  action: "BUY" | "SELL" | "HOLD";
  chain: ChainKey | null;
  tokenAddress: string | null;
  symbol: string | null;
  reason: string;
  outcome: string;
  source: "ai" | "rules" | "system";
}

class Engine {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private ticks = 0;
  lastTickAt: Date | null = null;
  lastTickMs = 0;

  start() {
    if (!env.ENGINE_ENABLED) {
      log.warn("engine disabled (ENGINE_ENABLED=false)");
      return;
    }
    log.info(`engine started: tick every ${env.ENGINE_TICK_SECONDS}s, ai ${env.aiEnabled ? env.AI_MODEL : "off (rules engine)"}`);
    setTimeout(() => void this.tick(), 2_000);
    this.timer = setInterval(() => void this.tick(), env.ENGINE_TICK_SECONDS * 1000);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    const started = Date.now();
    resetTickBudget();
    try {
      // Block only on the very first scan; later refreshes run in the background.
      if (market.candidates().length === 0) await market.refreshUniverse();
      else void market.refreshUniverse();
      const universe = market.candidates();
      const active = await db.select().from(agents).where(eq(agents.status, "ACTIVE"));
      if (active.length === 0) return;
      const ids = active.map((a) => a.id);
      const open = await db
        .select()
        .from(positions)
        .where(and(eq(positions.status, "OPEN"), inArray(positions.agentId, ids)));
      const quotes = await market.quotes(open.map((p) => ({ chain: p.chain as ChainKey, tokenAddress: p.tokenAddress })));
      const openByAgent = new Map<string, PositionRow[]>();
      for (const p of open) openByAgent.set(p.agentId, [...(openByAgent.get(p.agentId) ?? []), p]);

      await mapLimit(active, 3, (agent) =>
        this.runAgent(agent, openByAgent.get(agent.id) ?? [], quotes, universe).catch(async (err) => {
          log.error(`agent ${agent.name} tick failed: ${errorMessage(err)}`);
          await db.update(agents).set({ lastError: errorMessage(err).slice(0, 300) }).where(eq(agents.id, agent.id));
        }),
      );

      this.ticks += 1;
      if (this.ticks % 60 === 0) await this.prune();
      emit("stats:update", await getStats(true));
    } catch (err) {
      log.error(`engine tick failed: ${errorMessage(err)}`);
    } finally {
      this.lastTickAt = new Date();
      this.lastTickMs = Date.now() - started;
      this.running = false;
    }
  }

  /** One agent, one tick: mark to market, apply exits, then consider one entry. */
  private async runAgent(agent: AgentRow, open: PositionRow[], quotes: Quotes, universe: MarketToken[]) {
    const now = new Date();
    const cfg = agent.strategyConfig;
    const unit = agent.mode === "PAPER" ? BRAND.creditSymbol : "USD";
    let cash = agent.cashBalance;
    let { wins, losses, tradesCount } = agent;
    let lastEntryAt = agent.lastEntryAt;
    const pending: PendingDecision[] = [];
    const newTrades: (typeof trades.$inferInsert)[] = [];
    const positionUpdates: { id: string; set: Partial<typeof positions.$inferInsert> }[] = [];
    const newPositions: (typeof positions.$inferInsert)[] = [];
    const stillOpen: PositionRow[] = [];

    // 1. Mark to market and exits.
    for (const p of open) {
      const quote = quotes.get(keyOf(p.chain, p.tokenAddress));
      if (!quote || quote.priceUsd <= 0) {
        stillOpen.push(p); // missing price: keep last recorded value
        continue;
      }
      const value = p.quantity * quote.priceUsd;
      const peak = Math.max(p.peakValue, value);
      const pnlPct = p.costValue > 0 ? ((value - p.costValue) / p.costValue) * 100 : 0;
      let exit: string | null = null;
      if (pnlPct >= cfg.takeProfitPercent) exit = `Take profit ${fmtPct(pnlPct)}`;
      else if (pnlPct <= -cfg.stopLossPercent) exit = `Stop loss ${fmtPct(pnlPct)}`;
      else if (cfg.trailingStopPercent && peak > p.costValue && value <= peak * (1 - cfg.trailingStopPercent / 100))
        exit = `Trailing stop ${cfg.trailingStopPercent}% from peak (${fmtPct(pnlPct)})`;
      else if (cfg.maxHoldMinutes && minutesSince(p.openedAt, now.getTime()) >= cfg.maxHoldMinutes)
        exit = `Max hold ${cfg.maxHoldMinutes}m reached (${fmtPct(pnlPct)})`;
      // A drained pool stops trading, so its last price never reaches a target or a stop.
      else if (p.mode === "LIVE" && quote.liquidityUsd < DRAINED_LIQUIDITY_USD) exit = "Pool liquidity was pulled";

      if (!exit) {
        positionUpdates.push({ id: p.id, set: { lastPriceUsd: quote.priceUsd, lastValue: value, peakValue: peak } });
        stillOpen.push({ ...p, lastPriceUsd: quote.priceUsd, lastValue: value, peakValue: peak });
        continue;
      }

      let proceeds: number;
      let txHash: string | null = null;
      let writtenOff = false;
      if (p.mode === "LIVE") {
        const sold = await liveSell(agent, p, quote);
        if (!sold.ok && sold.unsellable) {
          // Nothing left to sell into: book the loss and free the slot instead of retrying forever.
          writtenOff = true;
          proceeds = 0;
          exit = `${exit} · written off: ${sold.error}`;
        } else if (!sold.ok) {
          pending.push({
            action: "HOLD",
            chain: p.chain as ChainKey,
            tokenAddress: p.tokenAddress,
            symbol: p.symbol,
            reason: `${exit} — exit pending`,
            outcome: sold.error,
            source: "system",
          });
          stillOpen.push(p);
          continue;
        } else {
          proceeds = sold.proceedsUsd;
          txHash = sold.txHash;
        }
      } else {
        const check = await routeCheck(quote);
        proceeds = paperSell(p.quantity, quote.priceUsd, quote.liquidityUsd, check?.ok ? check.sellCostPct : null).proceeds;
      }
      const realized = proceeds - p.costValue;
      cash += p.mode === "PAPER" ? proceeds : 0;
      if (realized >= 0) wins += 1;
      else losses += 1;
      tradesCount += 1;
      positionUpdates.push({
        id: p.id,
        set: {
          status: "CLOSED",
          closedAt: now,
          exitReason: exit,
          realizedPnl: realized,
          lastPriceUsd: quote.priceUsd,
          lastValue: proceeds,
          peakValue: peak,
        },
      });
      newTrades.push({
        id: newId(),
        agentId: agent.id,
        positionId: p.id,
        side: "SELL",
        chain: p.chain,
        tokenAddress: p.tokenAddress,
        symbol: p.symbol,
        quantity: p.quantity,
        value: proceeds,
        priceUsd: writtenOff ? 0 : quote.priceUsd,
        mode: p.mode,
        status: writtenOff ? "FAILED" : "FILLED",
        txHash,
        reason: exit,
        pnl: realized,
        createdAt: now,
      });
      pending.push({
        action: "SELL",
        chain: p.chain as ChainKey,
        tokenAddress: p.tokenAddress,
        symbol: p.symbol,
        reason: exit,
        outcome: writtenOff
          ? `Wrote off ${fmtQty(p.quantity)} ${p.symbol} (loss ${p.costValue.toFixed(4)} ${unit}); the tokens stay in the vault`
          : `Sold ${fmtQty(p.quantity)} ${p.symbol} for ${proceeds.toFixed(4)} ${unit}`,
        source: "system",
      });
    }

    // 2. One entry decision.
    if (stillOpen.length >= cfg.maxPositions) {
      pending.push(hold("Maximum open positions reached", "No order sent"));
    } else if (cfg.cooldownMinutes > 0 && minutesSince(lastEntryAt, now.getTime()) < cfg.cooldownMinutes) {
      pending.push(hold("Strategy cooldown", "No order sent"));
    } else {
      const readiness = agent.mode === "LIVE" ? await liveReadiness(agent) : null;
      const freeBalance = readiness ? readiness.totalUsd : cash;
      const spend = (freeBalance * cfg.sizePercent) / 100;
      if (spend < MIN_SPEND) {
        pending.push(
          hold(
            agent.mode !== "LIVE"
              ? `Insufficient ${BRAND.creditName} above reserve`
              : readiness?.missingPrice && readiness.totalUsd === 0
                ? "ETH price unavailable, so the vault cannot be sized"
                : "Vault balance too small to trade",
            "No order sent",
          ),
        );
      } else {
        const choice = await decide({
          agent: {
            name: agent.name,
            characterId: agent.characterId,
            strategyId: agent.strategyId,
            strategyName: agent.strategyName,
            config: cfg,
            instructions: agent.instructions,
          },
          freeBalance,
          heldKeys: new Set(stillOpen.map((p) => keyOf(p.chain, p.tokenAddress))),
          openSummary: stillOpen.map((p) => ({
            symbol: p.symbol,
            chain: p.chain,
            pnlPct: p.costValue ? Math.round(((p.lastValue - p.costValue) / p.costValue) * 1000) / 10 : 0,
          })),
          record: { wins, losses },
          universe: readiness ? universe.filter((t) => readiness.chains.includes(t.chain)) : universe,
        });

        if (choice.action === "HOLD") {
          pending.push({ ...hold(choice.reason, choice.outcome), source: choice.source });
        } else {
          const t = choice.token;
          let quantity: number;
          let entryPrice: number;
          let cost = spend;
          let txHash: string | null = null;
          let rawQuantity: string | null = null;
          let filled = true;
          if (agent.mode === "LIVE") {
            const bought = await liveBuy(agent, t, spend);
            if (!bought.ok) {
              filled = false;
              pending.push({
                action: "HOLD",
                chain: t.chain,
                tokenAddress: t.address,
                symbol: t.symbol,
                reason: choice.reason,
                outcome: bought.error,
                source: choice.source,
              });
            }
            quantity = bought.ok ? bought.quantity : 0;
            entryPrice = bought.ok && bought.quantity > 0 ? bought.costUsd / bought.quantity : t.priceUsd;
            cost = bought.ok ? bought.costUsd : spend;
            txHash = bought.ok ? bought.txHash : null;
            rawQuantity = bought.ok ? bought.rawQuantity : null;
          } else {
            const check = await routeCheck(t);
            const fill = paperBuy(spend, t.priceUsd, t.liquidityUsd, check?.ok ? check.buyCostPct : null);
            quantity = fill.quantity;
            entryPrice = fill.effectivePrice;
            cash -= spend;
          }
          if (filled) {
            const positionId = newId();
            const lastValue = quantity * t.priceUsd;
            newPositions.push({
              id: positionId,
              agentId: agent.id,
              chain: t.chain,
              tokenAddress: t.address,
              pairAddress: t.pairAddress,
              symbol: t.symbol,
              name: t.name,
              quantity,
              costValue: cost,
              entryPriceUsd: entryPrice,
              lastPriceUsd: t.priceUsd,
              lastValue,
              peakValue: lastValue,
              status: "OPEN",
              mode: agent.mode,
              rawQuantity,
              openedAt: now,
            });
            newTrades.push({
              id: newId(),
              agentId: agent.id,
              positionId,
              side: "BUY",
              chain: t.chain,
              tokenAddress: t.address,
              symbol: t.symbol,
              quantity,
              value: cost,
              priceUsd: t.priceUsd,
              mode: agent.mode,
              status: "FILLED",
              txHash,
              reason: choice.reason,
              pnl: null,
              createdAt: now,
            });
            pending.push({
              action: "BUY",
              chain: t.chain,
              tokenAddress: t.address,
              symbol: t.symbol,
              reason: choice.reason,
              outcome: `Bought ${fmtQty(quantity)} ${t.symbol} for ${cost.toFixed(4)} ${unit}`,
              source: choice.source,
            });
            tradesCount += 1;
            lastEntryAt = now;
            stillOpen.push({ ...(newPositions.at(-1) as PositionRow) });
          }
        }
      }
    }

    // 3. Persist atomically.
    const decisionRows = pending.map((d, i) => ({
      id: newId(),
      agentId: agent.id,
      ...d,
      createdAt: new Date(now.getTime() + i),
    }));
    const positionValue = stillOpen.reduce((sum, p) => sum + p.lastValue, 0);
    await db.transaction(async (tx) => {
      for (const u of positionUpdates) await tx.update(positions).set(u.set).where(eq(positions.id, u.id));
      if (newPositions.length) await tx.insert(positions).values(newPositions);
      if (newTrades.length) await tx.insert(trades).values(newTrades);
      if (decisionRows.length) await tx.insert(decisions).values(decisionRows);
      await tx.insert(equitySnapshots).values({ agentId: agent.id, value: cash + positionValue, createdAt: now });
      await tx
        .update(agents)
        .set({
          cashBalance: cash,
          wins,
          losses,
          tradesCount,
          lastEntryAt,
          lastTickAt: now,
          lastDecisionAt: decisionRows.length ? now : agent.lastDecisionAt,
          lastError: null,
          updatedAt: now,
        })
        .where(eq(agents.id, agent.id));
    });

    // 4. Broadcast.
    const updated: AgentRow = { ...agent, cashBalance: cash, wins, losses, tradesCount, lastEntryAt, lastTickAt: now };
    emit("agent:update", toAgent(updated, stillOpen));
    for (const row of decisionRows) {
      const decision = toDecision(row, agent);
      emit("feed:decision", decision);
      emit("feed:decision", decision, `agent:${agent.id}`);
    }
    for (const row of newTrades) {
      emit("trade:new", {
        ...toTrade({ ...row, positionId: row.positionId ?? null, txHash: row.txHash ?? null, pnl: row.pnl ?? null, createdAt: now } as never),
        agentName: agent.name,
        imageUri: agent.imageUri,
      });
    }
  }

  private async prune() {
    const weekAgo = new Date(Date.now() - 7 * 86_400_000);
    const twoWeeksAgo = new Date(Date.now() - 14 * 86_400_000);
    await db.delete(decisions).where(and(eq(decisions.action, "HOLD"), lt(decisions.createdAt, weekAgo)));
    await db.delete(equitySnapshots).where(lt(equitySnapshots.createdAt, twoWeeksAgo));
  }
}

function hold(reason: string, outcome: string): PendingDecision {
  return { action: "HOLD", chain: null, tokenAddress: null, symbol: null, reason, outcome, source: "system" };
}

export const engine = new Engine();
