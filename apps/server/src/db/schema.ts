import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { MarketToken, StrategyConfig } from "@elyagents/shared";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const users = pgTable("users", {
  address: text("address").primaryKey(),
  displayName: text("display_name"),
  createdAt: ts("created_at").notNull().defaultNow(),
  lastSeenAt: ts("last_seen_at").notNull().defaultNow(),
});

export const authNonces = pgTable("auth_nonces", {
  nonce: text("nonce").primaryKey(),
  address: text("address").notNull(),
  purpose: text("purpose").notNull(),
  message: text("message").notNull(),
  /** JSON payload the signature must authorise (withdraw details, etc). */
  scope: jsonb("scope").$type<Record<string, unknown>>(),
  expiresAt: ts("expires_at").notNull(),
  usedAt: ts("used_at"),
});

export const agents = pgTable(
  "agents",
  {
    id: text("id").primaryKey(),
    kind: text("kind").$type<"PLATFORM" | "USER">().notNull(),
    ownerAddress: text("owner_address"),
    name: text("name").notNull(),
    symbol: text("symbol").notNull(),
    characterId: text("character_id").notNull(),
    imageUri: text("image_uri").notNull(),
    strategyId: text("strategy_id").notNull(),
    strategyName: text("strategy_name").notNull(),
    strategyConfig: jsonb("strategy_config").$type<StrategyConfig>().notNull(),
    instructions: text("instructions"),
    mode: text("mode").$type<"PAPER" | "LIVE">().notNull(),
    status: text("status").$type<"ACTIVE" | "PAUSED">().notNull(),
    startingBalance: doublePrecision("starting_balance").notNull(),
    cashBalance: doublePrecision("cash_balance").notNull(),
    wins: integer("wins").notNull().default(0),
    losses: integer("losses").notNull().default(0),
    tradesCount: integer("trades_count").notNull().default(0),
    lastTickAt: ts("last_tick_at"),
    lastDecisionAt: ts("last_decision_at"),
    lastEntryAt: ts("last_entry_at"),
    lastError: text("last_error"),
    launchId: text("launch_id"),
    tokenAddress: text("token_address"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("agents_owner_idx").on(t.ownerAddress), index("agents_status_idx").on(t.status)],
);

export const agentWallets = pgTable(
  "agent_wallets",
  {
    id: text("id").primaryKey(),
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    kind: text("kind").$type<"evm">().notNull(),
    address: text("address").notNull(),
    encryptedKey: text("encrypted_key").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("agent_wallets_agent_kind_idx").on(t.agentId, t.kind)],
);

export const positions = pgTable(
  "positions",
  {
    id: text("id").primaryKey(),
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    chain: text("chain").notNull(),
    tokenAddress: text("token_address").notNull(),
    pairAddress: text("pair_address"),
    symbol: text("symbol").notNull(),
    name: text("name"),
    quantity: doublePrecision("quantity").notNull(),
    costValue: doublePrecision("cost_value").notNull(),
    entryPriceUsd: doublePrecision("entry_price_usd").notNull(),
    lastPriceUsd: doublePrecision("last_price_usd").notNull(),
    lastValue: doublePrecision("last_value").notNull(),
    peakValue: doublePrecision("peak_value").notNull(),
    status: text("status").$type<"OPEN" | "CLOSED">().notNull(),
    exitReason: text("exit_reason"),
    realizedPnl: doublePrecision("realized_pnl"),
    mode: text("mode").$type<"PAPER" | "LIVE">().notNull(),
    /** Raw on-chain token amount for live positions (string to keep precision). */
    rawQuantity: text("raw_quantity"),
    openedAt: ts("opened_at").notNull().defaultNow(),
    closedAt: ts("closed_at"),
  },
  (t) => [index("positions_agent_status_idx").on(t.agentId, t.status)],
);

export const trades = pgTable(
  "trades",
  {
    id: text("id").primaryKey(),
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    positionId: text("position_id"),
    side: text("side").$type<"BUY" | "SELL">().notNull(),
    chain: text("chain").notNull(),
    tokenAddress: text("token_address").notNull(),
    symbol: text("symbol").notNull(),
    quantity: doublePrecision("quantity").notNull(),
    value: doublePrecision("value").notNull(),
    priceUsd: doublePrecision("price_usd").notNull(),
    mode: text("mode").$type<"PAPER" | "LIVE">().notNull(),
    status: text("status").$type<"FILLED" | "PENDING" | "FAILED">().notNull(),
    txHash: text("tx_hash"),
    reason: text("reason").notNull(),
    pnl: doublePrecision("pnl"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("trades_agent_idx").on(t.agentId, t.createdAt), index("trades_created_idx").on(t.createdAt)],
);

export const decisions = pgTable(
  "decisions",
  {
    id: text("id").primaryKey(),
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    action: text("action").$type<"BUY" | "SELL" | "HOLD">().notNull(),
    chain: text("chain"),
    tokenAddress: text("token_address"),
    symbol: text("symbol"),
    reason: text("reason").notNull(),
    outcome: text("outcome").notNull(),
    source: text("source").$type<"ai" | "rules" | "system">().notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("decisions_agent_idx").on(t.agentId, t.createdAt), index("decisions_created_idx").on(t.createdAt)],
);

export const equitySnapshots = pgTable(
  "equity_snapshots",
  {
    id: serial("id").primaryKey(),
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    value: doublePrecision("value").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("equity_agent_idx").on(t.agentId, t.createdAt)],
);

export const launches = pgTable(
  "launches",
  {
    id: text("id").primaryKey(),
    chain: text("chain").notNull(),
    tokenAddress: text("token_address").notNull(),
    curveAddress: text("curve_address"),
    name: text("name").notNull(),
    symbol: text("symbol").notNull(),
    description: text("description").notNull().default(""),
    imageUri: text("image_uri"),
    website: text("website"),
    twitter: text("twitter"),
    pairToken: text("pair_token").notNull(),
    pairSymbol: text("pair_symbol").notNull(),
    creatorWallet: text("creator_wallet").notNull(),
    withAgent: boolean("with_agent").notNull().default(false),
    agentId: text("agent_id"),
    txHash: text("tx_hash"),
    pinned: boolean("pinned").notNull().default(false),
    pinOrder: integer("pin_order").notNull().default(0),
    launchedAt: ts("launched_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("launches_token_idx").on(t.chain, t.tokenAddress)],
);

export const floorMessages = pgTable(
  "floor_messages",
  {
    id: text("id").primaryKey(),
    authorType: text("author_type").$type<"USER" | "AGENT" | "SYSTEM">().notNull(),
    authorName: text("author_name").notNull(),
    authorAddress: text("author_address"),
    characterId: text("character_id"),
    body: text("body").notNull(),
    replyToId: text("reply_to_id"),
    tokenChain: text("token_chain"),
    tokenAddress: text("token_address"),
    tokenSymbol: text("token_symbol"),
    tokenName: text("token_name"),
    tokenSnapshot: jsonb("token_snapshot").$type<MarketToken | null>(),
    mentions: jsonb("mentions").$type<string[]>().notNull().default([]),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("floor_created_idx").on(t.createdAt)],
);

export const withdrawals = pgTable("withdrawals", {
  id: text("id").primaryKey(),
  agentId: text("agent_id")
    .notNull()
    .references(() => agents.id, { onDelete: "cascade" }),
  chain: text("chain").notNull(),
  toAddress: text("to_address").notNull(),
  amount: text("amount").notNull(),
  txHash: text("tx_hash"),
  status: text("status").$type<"PENDING" | "SENT" | "FAILED">().notNull(),
  error: text("error"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const burns = pgTable("burns", {
  id: text("id").primaryKey(),
  usdSpent: doublePrecision("usd_spent").notNull(),
  amountBurned: doublePrecision("amount_burned").notNull(),
  txHash: text("tx_hash").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
});
