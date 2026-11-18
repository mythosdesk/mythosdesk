import {
  BRAND,
  CHAINS,
  characterFor,
  isChainKey,
  STRATEGIES,
  STRATEGY_LIMITS,
  type MyAgent,
  type PresetStrategyId,
  type StrategyConfig,
} from "@elyagents/shared";
import { and, desc, eq } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import { db, schema } from "../db/client";
import { liveExecutionEnabled } from "../env";
import { consumeChallenge, HttpProblem, issueChallenge, requireAuth, type AuthedRequest } from "../lib/auth";
import { newId } from "../lib/util";
import { emit } from "../realtime";
import { toAgent } from "../serializers";
import { createAgentWallets, pendingWithdrawal, vaultBalances, walletAddresses, walletSecret, withdrawNative } from "../wallets/vault";
import { openPositionsFor } from "./agents";
import { handle, parse } from "./helpers";

const { agents } = schema;
const L = STRATEGY_LIMITS;

const ConfigSchema = z.object({
  sizePercent: z.number().min(L.sizePercent[0]).max(L.sizePercent[1]),
  takeProfitPercent: z.number().min(L.takeProfitPercent[0]).max(L.takeProfitPercent[1]),
  stopLossPercent: z.number().min(L.stopLossPercent[0]).max(L.stopLossPercent[1]),
  trailingStopPercent: z.number().min(L.trailingStopPercent[0]).max(L.trailingStopPercent[1]).nullable(),
  maxHoldMinutes: z.number().int().min(L.maxHoldMinutes[0]).max(L.maxHoldMinutes[1]).nullable(),
  maxPositions: z.number().int().min(L.maxPositions[0]).max(L.maxPositions[1]),
  cooldownMinutes: z.number().int().min(L.cooldownMinutes[0]).max(L.cooldownMinutes[1]),
});

export const StrategyInput = z.discriminatedUnion("type", [
  z.object({ type: z.literal("preset"), presetId: z.enum(Object.keys(STRATEGIES) as [PresetStrategyId, ...PresetStrategyId[]]) }),
  z.object({
    type: z.literal("custom"),
    name: z.string().trim().min(1).max(32),
    config: ConfigSchema,
    instructions: z.string().max(L.instructionsMaxChars).optional().default(""),
  }),
]);

export function resolveStrategy(input: z.infer<typeof StrategyInput>): {
  strategyId: string;
  strategyName: string;
  strategyConfig: StrategyConfig;
  instructions: string | null;
} {
  if (input.type === "preset") {
    const preset = STRATEGIES[input.presetId];
    return { strategyId: preset.id, strategyName: preset.name, strategyConfig: preset.config, instructions: null };
  }
  return {
    strategyId: "custom",
    strategyName: input.name,
    strategyConfig: input.config,
    instructions: input.instructions?.trim() || null,
  };
}

const CreateSchema = z.object({
  name: z.string().trim().min(1).max(32),
  characterId: z.string(),
  strategy: StrategyInput,
});

async function ownedAgent(wallet: string, id: string) {
  const [row] = await db
    .select()
    .from(agents)
    .where(and(eq(agents.id, id), eq(agents.ownerAddress, wallet)));
  if (!row) throw new HttpProblem(404, "Agent not found in your portfolio");
  return row;
}

async function toMyAgent(row: typeof agents.$inferSelect, freshBalances = false): Promise<MyAgent> {
  const [open, addresses, wallets] = await Promise.all([
    openPositionsFor([row.id]),
    walletAddresses(row.id),
    vaultBalances(row.id, freshBalances),
  ]);
  return {
    ...toAgent(row, open.get(row.id) ?? []),
    evmAddress: addresses.evm ?? "",
    wallets,
  };
}

export const meRouter = Router();
meRouter.use("/me", requireAuth);

meRouter.get(
  "/me/agents",
  handle(async (req, res) => {
    const wallet = (req as AuthedRequest).wallet;
    const rows = await db.select().from(agents).where(eq(agents.ownerAddress, wallet)).orderBy(desc(agents.createdAt));
    res.json({ agents: await Promise.all(rows.map((r) => toMyAgent(r))) });
  }),
);

meRouter.post(
  "/me/agents",
  handle(async (req, res) => {
    const wallet = (req as AuthedRequest).wallet;
    const input = parse(CreateSchema, req.body);
    const character = characterFor(input.characterId);
    const strategy = resolveStrategy(input.strategy);
    const existing = await db.select({ id: agents.id }).from(agents).where(eq(agents.ownerAddress, wallet));
    if (existing.length >= 20) throw new HttpProblem(400, "You can create up to 20 agents per wallet.");
    const id = newId();
    await db.transaction(async (tx) => {
      await tx.insert(schema.users).values({ address: wallet }).onConflictDoNothing();
      await tx.insert(agents).values({
        id,
        kind: "USER",
        ownerAddress: wallet,
        name: input.name,
        symbol: character.symbol,
        characterId: character.id,
        imageUri: character.image,
        ...strategy,
        // Starts paused. Paper mode gets showcase credits so it can be tried immediately.
        mode: "PAPER",
        status: "PAUSED",
        startingBalance: BRAND.startingCredits,
        cashBalance: BRAND.startingCredits,
      });
      await createAgentWallets(tx, id);
    });
    const [row] = await db.select().from(agents).where(eq(agents.id, id));
    res.status(201).json({ agent: await toMyAgent(row) });
  }),
);

meRouter.get(
  "/me/agents/:id",
  handle(async (req, res) => {
    const row = await ownedAgent((req as AuthedRequest).wallet, String(req.params.id));
    res.json({ agent: await toMyAgent(row, req.query.fresh === "1") });
  }),
);

meRouter.patch(
  "/me/agents/:id",
  handle(async (req, res) => {
    const row = await ownedAgent((req as AuthedRequest).wallet, String(req.params.id));
    const input = parse(z.object({ name: z.string().trim().min(1).max(32).optional(), strategy: StrategyInput.optional() }), req.body);
    await db
      .update(agents)
      .set({
        ...(input.name ? { name: input.name } : {}),
        ...(input.strategy ? resolveStrategy(input.strategy) : {}),
        updatedAt: new Date(),
      })
      .where(eq(agents.id, row.id));
    const [updated] = await db.select().from(agents).where(eq(agents.id, row.id));
    res.json({ agent: await toMyAgent(updated) });
  }),
);

meRouter.post(
  "/me/agents/:id/start",
  handle(async (req, res) => {
    const row = await ownedAgent((req as AuthedRequest).wallet, String(req.params.id));
    const { mode } = parse(z.object({ mode: z.enum(["PAPER", "LIVE"]) }), req.body);
    if (mode === "LIVE") {
      const wallets = await vaultBalances(row.id, true);
      const ready = wallets.filter((w) => w.liveEnabled && (w.balance ?? 0) > 0);
      if (ready.length === 0) {
        const anyEnabled = wallets.some((w) => w.liveEnabled);
        throw new HttpProblem(
          400,
          anyEnabled
            ? "Send ETH on Robinhood Chain to this agent's vault first, then start live trading."
            : "Live execution is not enabled on the server yet. Start in paper mode instead.",
        );
      }
    }
    // Switching modes resets the record so paper and live results never mix.
    const reset = mode !== row.mode ? { startingBalance: mode === "PAPER" ? BRAND.startingCredits : 0, cashBalance: mode === "PAPER" ? BRAND.startingCredits : 0 } : {};
    await db.update(agents).set({ mode, status: "ACTIVE", updatedAt: new Date(), ...reset }).where(eq(agents.id, row.id));
    const [updated] = await db.select().from(agents).where(eq(agents.id, row.id));
    emit("agent:update", toAgent(updated));
    res.json({ agent: await toMyAgent(updated) });
  }),
);

meRouter.post(
  "/me/agents/:id/pause",
  handle(async (req, res) => {
    const row = await ownedAgent((req as AuthedRequest).wallet, String(req.params.id));
    await db.update(agents).set({ status: "PAUSED", updatedAt: new Date() }).where(eq(agents.id, row.id));
    const [updated] = await db.select().from(agents).where(eq(agents.id, row.id));
    emit("agent:update", toAgent(updated));
    res.json({ agent: await toMyAgent(updated) });
  }),
);

/** Step 1 of a sensitive action: return the exact message the wallet must sign. */
meRouter.post(
  "/me/agents/:id/challenge",
  handle(async (req, res) => {
    const wallet = (req as AuthedRequest).wallet;
    const row = await ownedAgent(wallet, String(req.params.id));
    const input = parse(
      z.discriminatedUnion("purpose", [
        z.object({
          purpose: z.literal("withdraw"),
          chain: z.string().refine(isChainKey, "Unsupported chain"),
          amount: z.string().regex(/^(max|\d+(\.\d+)?)$/),
          to: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Enter a valid wallet address"),
        }),
        z.object({ purpose: z.literal("export-keys") }),
      ]),
      req.body,
    );
    const scope =
      input.purpose === "withdraw"
        ? { Agent: row.name, "Agent id": row.id, Network: CHAINS[input.chain as keyof typeof CHAINS].name, Chain: input.chain, Amount: input.amount, To: input.to }
        : { Agent: row.name, "Agent id": row.id };
    res.json(await issueChallenge(wallet, input.purpose, scope));
  }),
);

meRouter.post(
  "/me/agents/:id/withdraw",
  handle(async (req, res) => {
    const wallet = (req as AuthedRequest).wallet;
    const row = await ownedAgent(wallet, String(req.params.id));
    const input = parse(z.object({ message: z.string(), signature: z.string() }), req.body);
    const scope = await consumeChallenge({ address: wallet, message: input.message, signature: input.signature, purpose: "withdraw" });
    if (scope["Agent id"] !== row.id) throw new HttpProblem(400, "Signature was made for a different agent");
    const chain = String(scope.Chain);
    if (!isChainKey(chain)) throw new HttpProblem(400, "Unsupported chain");
    if (await pendingWithdrawal(row.id)) throw new HttpProblem(409, "Another withdrawal is still pending.");
    const destination = String(scope.To);
    if (!/^0x[a-fA-F0-9]{40}$/.test(destination)) throw new HttpProblem(400, "Invalid wallet address");
    const result = await withdrawNative({ agentId: row.id, chain, to: destination, amount: String(scope.Amount) });
    res.json({ ...result, explorer: CHAINS[chain].explorerTx(result.txHash) });
  }),
);

meRouter.post(
  "/me/agents/:id/export",
  handle(async (req, res) => {
    const wallet = (req as AuthedRequest).wallet;
    const row = await ownedAgent(wallet, String(req.params.id));
    const input = parse(z.object({ message: z.string(), signature: z.string() }), req.body);
    const scope = await consumeChallenge({ address: wallet, message: input.message, signature: input.signature, purpose: "export-keys" });
    if (scope["Agent id"] !== row.id) throw new HttpProblem(400, "Signature was made for a different agent");
    const evm = await walletSecret(row.id);
    const addresses = await walletAddresses(row.id);
    res.json({ evm: { address: addresses.evm, privateKey: evm } });
  }),
);

export function liveFlags() {
  return Object.fromEntries(Object.keys(CHAINS).map((c) => [c, liveExecutionEnabled(c as keyof typeof CHAINS)]));
}
