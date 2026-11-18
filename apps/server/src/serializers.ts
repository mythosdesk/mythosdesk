import {
  characterFor,
  isChainKey,
  type AgentSummary,
  type ChainKey,
  type Decision,
  type FloorMessage,
  type Launch,
  type Position,
  type Trade,
} from "@elyagents/shared";
import type { InferSelectModel } from "drizzle-orm";
import type { agents, decisions, floorMessages, launches, positions, trades } from "./db/schema";
import { maskAddress } from "./lib/util";

export type AgentRow = InferSelectModel<typeof agents>;
export type PositionRow = InferSelectModel<typeof positions>;
export type TradeRow = InferSelectModel<typeof trades>;
export type DecisionRow = InferSelectModel<typeof decisions>;
export type LaunchRow = InferSelectModel<typeof launches>;
export type FloorRow = InferSelectModel<typeof floorMessages>;

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const chainOf = (c: string | null): ChainKey | null => (isChainKey(c) ? c : null);

export function toAgent(row: AgentRow, open: PositionRow[] = []): AgentSummary {
  const positionValue = open.reduce((sum, p) => sum + p.lastValue, 0);
  const portfolioValue = row.cashBalance + positionValue;
  const pnl = portfolioValue - row.startingBalance;
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    symbol: row.symbol,
    characterId: row.characterId,
    imageUri: row.imageUri,
    strategyId: row.strategyId as AgentSummary["strategyId"],
    strategyName: row.strategyName,
    strategyConfig: row.strategyConfig,
    instructions: row.instructions,
    mode: row.mode,
    status: row.status,
    startingBalance: row.startingBalance,
    cashBalance: row.cashBalance,
    portfolioValue,
    pnl,
    pnlPercent: row.startingBalance > 0 ? (pnl / row.startingBalance) * 100 : 0,
    openPositions: open.length,
    trades: row.tradesCount,
    wins: row.wins,
    losses: row.losses,
    lastTickAt: iso(row.lastTickAt),
    lastDecisionAt: iso(row.lastDecisionAt),
    createdAt: row.createdAt.toISOString(),
    owner: maskAddress(row.ownerAddress),
    launchId: row.launchId,
    tokenAddress: row.tokenAddress,
  };
}

export function toPosition(row: PositionRow): Position {
  return {
    id: row.id,
    agentId: row.agentId,
    chain: row.chain as ChainKey,
    tokenAddress: row.tokenAddress,
    pairAddress: row.pairAddress,
    symbol: row.symbol,
    name: row.name,
    quantity: row.quantity,
    costValue: row.costValue,
    entryPriceUsd: row.entryPriceUsd,
    lastPriceUsd: row.lastPriceUsd,
    lastValue: row.lastValue,
    peakValue: row.peakValue,
    openedAt: row.openedAt.toISOString(),
    closedAt: iso(row.closedAt),
    status: row.status,
    exitReason: row.exitReason,
    realizedPnl: row.realizedPnl,
  };
}

export function toTrade(row: TradeRow): Trade {
  return {
    id: row.id,
    agentId: row.agentId,
    positionId: row.positionId,
    createdAt: row.createdAt.toISOString(),
    side: row.side,
    chain: row.chain as ChainKey,
    tokenAddress: row.tokenAddress,
    symbol: row.symbol,
    quantity: row.quantity,
    value: row.value,
    priceUsd: row.priceUsd,
    mode: row.mode,
    status: row.status,
    txHash: row.txHash,
    reason: row.reason,
    pnl: row.pnl,
  };
}

export function toDecision(
  row: DecisionRow,
  agent: Pick<AgentRow, "name" | "imageUri" | "strategyName" | "characterId">,
): Decision {
  return {
    id: row.id,
    agentId: row.agentId,
    createdAt: row.createdAt.toISOString(),
    action: row.action,
    chain: chainOf(row.chain),
    tokenAddress: row.tokenAddress,
    symbol: row.symbol,
    reason: row.reason,
    outcome: row.outcome,
    source: row.source,
    agentName: agent.name,
    imageUri: agent.imageUri,
    strategyName: agent.strategyName,
    characterId: agent.characterId,
  };
}

export function toLaunch(row: LaunchRow, extra: Partial<Launch> = {}): Launch {
  return {
    id: row.id,
    chain: row.chain as ChainKey,
    tokenAddress: row.tokenAddress,
    curveAddress: row.curveAddress,
    name: row.name,
    symbol: row.symbol,
    description: row.description,
    imageUri: row.imageUri,
    website: row.website,
    twitter: row.twitter,
    pairToken: row.pairToken,
    pairSymbol: row.pairSymbol,
    creatorWallet: row.creatorWallet,
    withAgent: row.withAgent,
    agentId: row.agentId,
    agentName: null,
    characterId: null,
    strategyName: null,
    txHash: row.txHash,
    launchedAt: row.launchedAt.toISOString(),
    pinned: row.pinned,
    marketCapUsd: null,
    volume24hUsd: null,
    change24h: null,
    priceUsd: null,
    liquidityUsd: null,
    ...extra,
  };
}

export function toFloorMessage(row: FloorRow, replyTo?: FloorRow | null): FloorMessage {
  const chain = chainOf(row.tokenChain);
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    authorType: row.authorType,
    authorName: row.authorName,
    authorAddress: maskAddress(row.authorAddress),
    characterId: row.characterId,
    body: row.body,
    replyToId: row.replyToId,
    replyToPreview: replyTo ? { authorName: replyTo.authorName, body: replyTo.body.slice(0, 140) } : null,
    token:
      chain && row.tokenAddress
        ? {
            chain,
            address: row.tokenAddress,
            symbol: row.tokenSymbol,
            name: row.tokenName,
            snapshot: row.tokenSnapshot ?? null,
          }
        : null,
    mentions: row.mentions ?? [],
  };
}

export function agentAvatar(characterId: string): string {
  return characterFor(characterId).image;
}
