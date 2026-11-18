import { BRAND, CHAINS, PONS, PONS_FACTORY_ABI, PONS_PHASES, type ProofReport } from "@elyagents/shared";
import { and, count, desc, eq, gte, isNotNull } from "drizzle-orm";
import { Router } from "express";
import { parseAbi, type Hex } from "viem";
import { db, schema } from "../db/client";
import { env, liveExecutionEnabled } from "../env";
import { errorMessage, log } from "../log";
import { getStats } from "../stats";
import { publicClient } from "../wallets/evm";
import { handle } from "./helpers";
import { launchConfig } from "./launch";

const { agents, agentWallets, launches, trades } = schema;
const factoryAbi = parseAbi(PONS_FACTORY_ABI);
const CACHE_MS = 30_000;
let cache: { at: number; value: ProofReport } | null = null;

/** The official token's launch record as the pons factory stores it. Null before launch or for a non-pons coin. */
async function ponsRecord(address: string): Promise<ProofReport["token"]["pons"]> {
  try {
    const r = await publicClient("robinhood").readContract({
      address: env.PONS_FACTORY_ADDRESS as Hex,
      abi: factoryAbi,
      functionName: "getLaunchedToken",
      args: [address as Hex],
    });
    if (!r.exists) return null;
    return {
      curve: r.curve,
      deployer: r.deployer,
      creatorFeeRecipient: r.creatorFeeRecipient,
      pairToken: r.pairToken,
      phase: PONS_PHASES[r.phase] ?? `Phase ${r.phase}`,
      creatorTaxBps: r.creatorTaxBps,
      buybackEnabled: r.buybackEnabled,
    };
  } catch (err) {
    log.warn(`proof: pons record for ${address}: ${errorMessage(err).slice(0, 120)}`);
    return null;
  }
}

async function buildProof(): Promise<ProofReport> {
  const chain = CHAINS.robinhood;
  const dayAgo = new Date(Date.now() - 86_400_000);
  const [stats, config, residents, userLive, tradesByMode, fills, launched, token] = await Promise.all([
    getStats(),
    launchConfig(),
    // Only the platform's own agents show a vault: a user's vault stays theirs to share.
    db
      .select({ id: agents.id, name: agents.name, kind: agents.kind, mode: agents.mode, status: agents.status, vault: agentWallets.address })
      .from(agents)
      .leftJoin(agentWallets, eq(agentWallets.agentId, agents.id))
      .where(eq(agents.kind, "PLATFORM"))
      .orderBy(agents.createdAt),
    db.select({ n: count() }).from(agents).where(and(eq(agents.kind, "USER"), eq(agents.mode, "LIVE"))),
    db.select({ mode: trades.mode, n: count() }).from(trades).where(gte(trades.createdAt, dayAgo)).groupBy(trades.mode),
    db
      .select({ t: trades, agentName: agents.name })
      .from(trades)
      .innerJoin(agents, eq(agents.id, trades.agentId))
      .where(and(eq(trades.mode, "LIVE"), eq(trades.status, "FILLED"), isNotNull(trades.txHash)))
      .orderBy(desc(trades.createdAt))
      .limit(25),
    db.select({ n: count() }).from(launches),
    env.OFFICIAL_TOKEN_ADDRESS ? ponsRecord(env.OFFICIAL_TOKEN_ADDRESS) : Promise.resolve(null),
  ]);

  const liveExecution = liveExecutionEnabled("robinhood");
  const residentsLive = residents.filter((a) => a.mode === "LIVE").length;
  const simulated = [
    residentsLive === residents.length
      ? "Nothing in the resident showcase: every resident trades live from its own vault."
      : `${residents.length - residentsLive} of ${residents.length} resident agents trade on paper: fills use live quotes and the measured route cost, in ${BRAND.creditName} credits that cannot be bought or withdrawn.`,
    liveExecution
      ? env.liveOwners.length
        ? `Live execution is on for ${env.liveOwners.length} test wallet${env.liveOwners.length === 1 ? "" : "s"} only. ${userLive[0]?.n ?? 0} user agents trade live from their own vaults.`
        : `Live execution is on. ${userLive[0]?.n ?? 0} user agents trade live from their own vaults.`
      : "Live execution from vaults is off, so no agent sends real swaps right now.",
    env.aiEnabled ? `Entries are picked by ${env.AI_MODEL}, inside limits the worker enforces.` : "No AI key is set, so a deterministic rules engine picks entries instead of a model.",
  ];

  return {
    generatedAt: new Date().toISOString(),
    chain: { key: chain.key, name: chain.name, chainId: chain.chainId, nativeSymbol: chain.nativeSymbol, explorer: chain.explorer },
    engine: {
      lastTickAt: stats.lastTickAt,
      tickSeconds: stats.tickSeconds,
      tokensScanned: stats.tokensScanned,
      decisions24h: stats.decisions24h,
      aiModel: env.aiEnabled ? env.AI_MODEL : null,
      dataSources: ["GeckoTerminal", "DexScreener", "KyberSwap route simulation (eth_call)"],
    },
    trading: {
      liveExecution,
      paperTrades24h: tradesByMode.find((r) => r.mode === "PAPER")?.n ?? 0,
      liveTrades24h: tradesByMode.find((r) => r.mode === "LIVE")?.n ?? 0,
      agents: residents.map((a) => ({ ...a, vault: a.mode === "LIVE" ? a.vault : null })),
      liveFills: fills.map(({ t, agentName }) => ({
        agentName,
        side: t.side as "BUY" | "SELL",
        symbol: t.symbol,
        tokenAddress: t.tokenAddress,
        valueUsd: t.value,
        txHash: t.txHash as string,
        explorer: chain.explorerTx(t.txHash as string),
        at: t.createdAt.toISOString(),
      })),
    },
    launches: {
      venue: "pons v2",
      factory: config.factory,
      launchAndBuy: config.launchAndBuy,
      open: config.deployed,
      publicLaunchOpen: config.publicLaunchOpen,
      launchedHere: launched[0]?.n ?? 0,
    },
    token: { address: env.OFFICIAL_TOKEN_ADDRESS || null, pons: token },
    simulated,
    endpoints: [
      { path: "/api/proof", shows: "This report" },
      { path: "/api/health", shows: "Engine heartbeat, AI model and market feed health" },
      { path: "/api/stats", shows: "Tokens scanned, decisions in 24h, ETH price, live execution switch" },
      { path: "/api/agents/feed", shows: "Every decision with its reason, newest first" },
      { path: "/api/trades/recent", shows: "Latest fills, paper and live, with transactions for live ones" },
      { path: "/api/launches/config", shows: "pons terms read from the factory: fee, supply, graduation" },
      { path: "/api/launches", shows: "Coins launched through this site" },
    ],
    links: { site: BRAND.website, x: BRAND.social.x || null, source: BRAND.social.github || null, docs: PONS.docs },
  };
}

export const proofRouter = Router();

proofRouter.get(
  "/proof",
  handle(async (_req, res) => {
    if (!cache || Date.now() - cache.at > CACHE_MS) cache = { at: Date.now(), value: await buildProof() };
    res.json(cache.value);
  }),
);
