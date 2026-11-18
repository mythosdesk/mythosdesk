import type { ChainKey } from "./chains";
import type { StrategyConfig, StrategyId } from "./strategies";

export type AgentKind = "PLATFORM" | "USER";
/** PAPER agents trade virtual credits on live quotes; LIVE agents trade their vault. */
export type AgentMode = "PAPER" | "LIVE";
export type AgentStatus = "ACTIVE" | "PAUSED";
export type DecisionAction = "BUY" | "SELL" | "HOLD";
export type PositionStatus = "OPEN" | "CLOSED";
export type TradeStatus = "FILLED" | "PENDING" | "FAILED";

export interface AgentSummary {
  id: string;
  kind: AgentKind;
  name: string;
  symbol: string;
  characterId: string;
  imageUri: string;
  strategyId: StrategyId;
  strategyName: string;
  strategyConfig: StrategyConfig;
  instructions: string | null;
  mode: AgentMode;
  status: AgentStatus;
  startingBalance: number;
  cashBalance: number;
  portfolioValue: number;
  pnl: number;
  pnlPercent: number;
  openPositions: number;
  trades: number;
  wins: number;
  losses: number;
  lastTickAt: string | null;
  lastDecisionAt: string | null;
  createdAt: string;
  /** Short owner label (masked wallet) for USER agents. */
  owner: string | null;
  launchId: string | null;
  tokenAddress: string | null;
}

export interface Decision {
  id: string;
  agentId: string;
  createdAt: string;
  action: DecisionAction;
  chain: ChainKey | null;
  tokenAddress: string | null;
  symbol: string | null;
  reason: string;
  outcome: string;
  /** "ai" when the model chose, "rules" for the deterministic engine. */
  source: "ai" | "rules" | "system";
  agentName: string;
  imageUri: string;
  strategyName: string;
  characterId: string;
}

export interface Position {
  id: string;
  agentId: string;
  chain: ChainKey;
  tokenAddress: string;
  pairAddress: string | null;
  symbol: string;
  name: string | null;
  quantity: number;
  /** Credits (paper) or native coin (live) spent including fees. */
  costValue: number;
  entryPriceUsd: number;
  lastPriceUsd: number;
  lastValue: number;
  peakValue: number;
  openedAt: string;
  closedAt: string | null;
  status: PositionStatus;
  exitReason: string | null;
  realizedPnl: number | null;
}

export interface Trade {
  id: string;
  agentId: string;
  positionId: string | null;
  createdAt: string;
  side: "BUY" | "SELL";
  chain: ChainKey;
  tokenAddress: string;
  symbol: string;
  quantity: number;
  value: number;
  priceUsd: number;
  mode: AgentMode;
  status: TradeStatus;
  txHash: string | null;
  reason: string;
  pnl: number | null;
}

export interface EquityPoint {
  t: string;
  v: number;
}

export interface ChainPerformance {
  chain: ChainKey;
  pnl: number;
  realized: number;
  unrealized: number;
  positionValue: number;
  trades: number;
  positions: number;
}

export interface AgentDetail {
  agent: AgentSummary;
  positions: Position[];
  closedPositions: Position[];
  decisions: Decision[];
  trades: Trade[];
  equity: EquityPoint[];
  chainPerformance: ChainPerformance[];
  launch: Launch | null;
}

export interface TxnCount {
  buys: number;
  sells: number;
}

export interface MarketToken {
  chain: ChainKey;
  address: string;
  pairAddress: string | null;
  symbol: string;
  name: string;
  imageUrl: string | null;
  quoteSymbol: string | null;
  priceUsd: number;
  liquidityUsd: number;
  volume24hUsd: number;
  volume1hUsd: number;
  volume5mUsd: number;
  marketCapUsd: number;
  fdvUsd: number;
  priceChange5m: number;
  priceChange1h: number;
  priceChange24h: number;
  txns5m: TxnCount;
  txns1h: TxnCount;
  txns24h: TxnCount;
  /** Unix ms. */
  pairCreatedAt: number | null;
  dexId: string | null;
  url: string | null;
  source: "dexscreener" | "geckoterminal";
  eligible?: boolean;
}

export type MarketFeed = "discover" | "trending" | "new" | "top" | "boosted";

export interface Launch {
  id: string;
  chain: ChainKey;
  tokenAddress: string;
  curveAddress: string | null;
  name: string;
  symbol: string;
  description: string;
  imageUri: string | null;
  website: string | null;
  twitter: string | null;
  pairToken: string;
  pairSymbol: string;
  creatorWallet: string;
  withAgent: boolean;
  agentId: string | null;
  agentName: string | null;
  characterId: string | null;
  strategyName: string | null;
  txHash: string | null;
  launchedAt: string;
  pinned: boolean;
  marketCapUsd: number | null;
  volume24hUsd: number | null;
  change24h: number | null;
  priceUsd: number | null;
  liquidityUsd: number | null;
}

export type FloorTab = "conversation" | "token" | "agent";

export interface FloorTokenRef {
  chain: ChainKey;
  address: string;
  symbol: string | null;
  name: string | null;
  snapshot: MarketToken | null;
}

export interface FloorMessage {
  id: string;
  createdAt: string;
  authorType: "USER" | "AGENT" | "SYSTEM";
  authorName: string;
  authorAddress: string | null;
  characterId: string | null;
  body: string;
  replyToId: string | null;
  replyToPreview: { authorName: string; body: string } | null;
  token: FloorTokenRef | null;
  mentions: string[];
  /** Pending agent replies render a typing indicator. */
  pending?: boolean;
}

export interface PlatformStats {
  platformAgents: number;
  userAgents: number;
  activeAgents: number;
  agentMoves: number;
  decisions24h: number;
  openPositions: number;
  tokensScanned: number;
  lastTickAt: string | null;
  /** Seconds between engine ticks. */
  tickSeconds: number;
  /** USD price of the gas coin; null when no feed answered. */
  ethUsd: number | null;
  aiEnabled: boolean;
  liveExecution: Record<ChainKey, boolean>;
}

/** Public evidence for every claim the site makes, at /api/proof and /proof. */
export interface ProofReport {
  generatedAt: string;
  chain: { key: ChainKey; name: string; chainId: number; nativeSymbol: string; explorer: string };
  engine: {
    lastTickAt: string | null;
    tickSeconds: number;
    tokensScanned: number;
    decisions24h: number;
    /** Model id when the AI brain is on; null means the deterministic rules engine decides. */
    aiModel: string | null;
    dataSources: string[];
  };
  trading: {
    /** Whether vaults may send real swaps at all. */
    liveExecution: boolean;
    paperTrades24h: number;
    liveTrades24h: number;
    agents: { id: string; name: string; kind: "PLATFORM" | "USER"; mode: "PAPER" | "LIVE"; status: "ACTIVE" | "PAUSED"; vault: string | null }[];
    /** Latest filled live trades, each with its transaction. */
    liveFills: { agentName: string; side: "BUY" | "SELL"; symbol: string; tokenAddress: string; valueUsd: number; txHash: string; explorer: string; at: string }[];
  };
  launches: { venue: string; factory: string; launchAndBuy: string; open: boolean; publicLaunchOpen: boolean; launchedHere: number };
  token: {
    address: string | null;
    /** The pons launch record, read from the factory; null before launch or for a coin pons did not launch. */
    pons: { curve: string; deployer: string; creatorFeeRecipient: string; pairToken: string; phase: string; creatorTaxBps: number; buybackEnabled: boolean } | null;
  };
  /** Everything here that is simulated, said plainly. */
  simulated: string[];
  /** Public JSON endpoints that back each claim. */
  endpoints: { path: string; shows: string }[];
  links: { site: string; x: string | null; source: string | null; docs: string };
}

export interface LeaderboardRow {
  rank: number;
  agent: AgentSummary;
  sparkline: number[];
}

export interface VaultWallet {
  chain: ChainKey;
  address: string;
  nativeSymbol: string;
  balance: number | null;
  balanceError: string | null;
  liveEnabled: boolean;
}

export interface MyAgent extends AgentSummary {
  evmAddress: string;
  wallets: VaultWallet[];
}

export interface SessionUser {
  address: string;
  displayName: string | null;
  createdAt: string;
}


export interface ApiError {
  error: string;
  details?: unknown;
}

/** Socket.IO event payloads emitted by the server. */
export interface ServerEvents {
  "feed:decision": Decision;
  "agent:update": AgentSummary;
  "trade:new": Trade & { agentName: string; imageUri: string };
  "stats:update": PlatformStats;
  "floor:message": FloorMessage;
  "floor:update": FloorMessage;
}
