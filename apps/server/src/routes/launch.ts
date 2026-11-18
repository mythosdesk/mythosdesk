import { mkdirSync } from "node:fs";
import path from "node:path";
import {
  BRAND,
  CHAINS,
  CHARACTERS,
  PONS_FACTORY_ABI,
  PONS_NATIVE_PAIR,
  type Launch,
  type LaunchConfig,
} from "@elyagents/shared";
import { desc, eq, inArray } from "drizzle-orm";
import { Router } from "express";
import multer from "multer";
import { decodeEventLog, erc20Abi, formatUnits, parseAbi, type Hex } from "viem";
import { z } from "zod";
import { db, schema } from "../db/client";
import { env } from "../env";
import { HttpProblem, requireAuth, type AuthedRequest } from "../lib/auth";
import { newId } from "../lib/util";
import { errorMessage } from "../log";
import { market } from "../market/service";
import { toLaunch } from "../serializers";
import { publicClient } from "../wallets/evm";
import { createAgentWallets } from "../wallets/vault";
import { handle, parse } from "./helpers";
import { resolveStrategy, StrategyInput } from "./me";

const { launches, agents } = schema;
const factoryAbi = parseAbi(PONS_FACTORY_ABI);
const chain = CHAINS.robinhood;
const factory = env.PONS_FACTORY_ADDRESS as Hex;

let configCache: { at: number; value: LaunchConfig } | null = null;

/** Live pons terms. Read on every page load (cached a minute) because pons can edit or disable a config. */
export async function launchConfig(): Promise<LaunchConfig> {
  if (configCache && Date.now() - configCache.at < 60_000) return configCache.value;
  const base: LaunchConfig = {
    chainId: chain.chainId,
    chainName: chain.name,
    explorer: chain.explorer,
    factory,
    launchAndBuy: env.PONS_LAUNCH_AND_BUY_ADDRESS,
    deployed: false,
    publicLaunchOpen: false,
    launchFeeWei: null,
    launchConfigId: null,
    totalSupply: null,
    graduationThresholdWei: null,
    phantomQuoteWei: null,
    curveFeeBps: null,
    error: null,
  };
  try {
    const client = publicClient("robinhood");
    const [fee, count, publicOpen] = await Promise.all([
      client.readContract({ address: factory, abi: factoryAbi, functionName: "launchFee" }),
      client.readContract({ address: factory, abi: factoryAbi, functionName: "launchConfigCount" }),
      // The zero address is never whitelisted, so this is true only while launches are public.
      client.readContract({ address: factory, abi: factoryAbi, functionName: "canLaunch", args: [PONS_NATIVE_PAIR] }),
    ]);
    // Configs are append-only and can be disabled, so take the first one that is still open.
    for (let id = 0n; id < count; id++) {
      const config = await client.readContract({ address: factory, abi: factoryAbi, functionName: "getLaunchConfig", args: [id] });
      if (!config.enabled) continue;
      Object.assign(base, {
        deployed: true,
        launchConfigId: id.toString(),
        totalSupply: Number(formatUnits(config.supply, 18)),
        graduationThresholdWei: config.graduationThreshold.toString(),
        phantomQuoteWei: config.phantomQuote.toString(),
        curveFeeBps: Number(config.curveFeeBps),
      });
      break;
    }
    Object.assign(base, {
      launchFeeWei: fee.toString(),
      publicLaunchOpen: publicOpen,
      error: base.deployed ? null : "pons has no launch config open right now.",
    });
  } catch (err) {
    base.error = `Could not read the pons factory: ${errorMessage(err).slice(0, 120)}`;
  }
  configCache = { at: Date.now(), value: base };
  return base;
}

async function enrich(rows: (typeof launches.$inferSelect)[]): Promise<Launch[]> {
  const agentIds = rows.map((r) => r.agentId).filter((id): id is string => Boolean(id));
  const agentRows = agentIds.length ? await db.select().from(agents).where(inArray(agents.id, agentIds)) : [];
  const byId = new Map(agentRows.map((a) => [a.id, a]));
  const quotes = await market.quotes(rows.map((r) => ({ chain: r.chain as "robinhood", tokenAddress: r.tokenAddress })));
  return rows.map((r) => {
    const a = r.agentId ? byId.get(r.agentId) : undefined;
    const q = quotes.get(`${r.chain}:${r.tokenAddress.toLowerCase()}`);
    return toLaunch(r, {
      agentName: a?.name ?? null,
      characterId: a?.characterId ?? null,
      strategyName: a?.strategyName ?? null,
      marketCapUsd: q?.marketCapUsd ?? null,
      volume24hUsd: q?.volume24hUsd ?? null,
      change24h: q?.priceChange24h ?? null,
      priceUsd: q?.priceUsd ?? null,
      liquidityUsd: q?.liquidityUsd ?? null,
    });
  });
}

const uploadDir = path.join(env.dataDir, "uploads");
mkdirSync(uploadDir, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (_req, file, cb) => cb(null, `${newId()}${path.extname(file.originalname).toLowerCase().slice(0, 6) || ".png"}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, /^image\/(png|jpe?g|gif|webp|avif)$/.test(file.mimetype)),
});

const RecordSchema = z.object({
  txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  name: z.string().trim().min(1).max(64),
  symbol: z.string().trim().min(1).max(16),
  description: z.string().max(2_000).default(""),
  imageUri: z.string().url().nullable().optional(),
  website: z.string().url().nullable().optional(),
  twitter: z.string().url().nullable().optional(),
  agent: z
    .object({
      name: z.string().trim().min(1).max(32),
      characterId: z.string(),
      strategy: StrategyInput,
    })
    .nullable()
    .optional(),
});

export const launchRouter = Router();

launchRouter.get(
  "/launches",
  handle(async (_req, res) => {
    const rows = await db.select().from(launches).orderBy(desc(launches.pinned), desc(launches.launchedAt)).limit(100);
    res.json({ tokens: await enrich(rows) });
  }),
);

launchRouter.get(
  "/launches/config",
  handle(async (_req, res) => {
    res.json(await launchConfig());
  }),
);

launchRouter.post(
  "/uploads",
  upload.single("file"),
  handle(async (req, res) => {
    if (!req.file) throw new HttpProblem(400, "Upload a PNG, JPG, GIF, WebP or AVIF under 5 MB");
    if (env.PINATA_JWT) {
      const form = new FormData();
      const { readFile } = await import("node:fs/promises");
      form.append("file", new Blob([await readFile(req.file.path)], { type: req.file.mimetype }), req.file.originalname);
      const pinned = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
        method: "POST",
        headers: { authorization: `Bearer ${env.PINATA_JWT}` },
        body: form,
      });
      if (pinned.ok) {
        const body = (await pinned.json()) as { IpfsHash: string };
        res.json({ url: `${env.PINATA_GATEWAY}${body.IpfsHash}`, ipfs: `ipfs://${body.IpfsHash}` });
        return;
      }
    }
    res.json({ url: `${env.PUBLIC_SERVER_URL}/uploads/${req.file.filename}`, ipfs: null });
  }),
);

/** Called by the browser after the wallet's pons launch transaction is mined. */
launchRouter.post(
  "/launches",
  requireAuth,
  handle(async (req, res) => {
    const wallet = (req as AuthedRequest).wallet;
    const input = parse(RecordSchema, req.body);
    const client = publicClient("robinhood");

    const receipt = await client.getTransactionReceipt({ hash: input.txHash as Hex }).catch(() => null);
    if (!receipt) throw new HttpProblem(404, "Transaction not found yet. Wait for confirmation and retry.");
    if (receipt.status !== "success") throw new HttpProblem(400, "Launch transaction reverted");

    // The factory emits TokenLaunched for direct launches and for the launch-and-buy router alike,
    // and records the initiating wallet as the deployer in both cases.
    let event: { token: string; curve: string; deployer: string; pairToken: string } | null = null;
    for (const entry of receipt.logs) {
      if (entry.address.toLowerCase() !== factory.toLowerCase()) continue;
      try {
        const decoded = decodeEventLog({ abi: factoryAbi, data: entry.data, topics: entry.topics });
        if (decoded.eventName === "TokenLaunched") {
          const { token, curve, deployer, pairToken } = decoded.args;
          event = { token, curve, deployer, pairToken };
        }
      } catch {
        // not a pons event
      }
    }
    if (!event) throw new HttpProblem(400, "No pons launch found in this transaction");
    if (event.deployer.toLowerCase() !== wallet) throw new HttpProblem(403, "This launch was made by a different wallet");

    const [existing] = await db.select().from(launches).where(eq(launches.tokenAddress, event.token));
    if (existing) {
      res.json({ launch: (await enrich([existing]))[0] });
      return;
    }

    const native = event.pairToken.toLowerCase() === PONS_NATIVE_PAIR;
    const pairSymbol = native
      ? chain.nativeSymbol
      : await client.readContract({ address: event.pairToken as Hex, abi: erc20Abi, functionName: "symbol" }).catch(() => "ERC-20");

    const launchId = newId();
    let agentId: string | null = null;
    await db.transaction(async (tx) => {
      if (input.agent) {
        const character = CHARACTERS.find((c) => c.id === input.agent!.characterId) ?? CHARACTERS[0];
        agentId = newId();
        await tx.insert(schema.users).values({ address: wallet }).onConflictDoNothing();
        await tx.insert(agents).values({
          id: agentId,
          kind: "USER",
          ownerAddress: wallet,
          name: input.agent.name,
          symbol: input.symbol.toUpperCase(),
          characterId: character.id,
          imageUri: character.image,
          ...resolveStrategy(input.agent.strategy),
          mode: "PAPER",
          status: "ACTIVE",
          startingBalance: BRAND.startingCredits,
          cashBalance: BRAND.startingCredits,
          launchId,
          tokenAddress: event!.token,
        });
        await createAgentWallets(tx, agentId);
      }
      await tx.insert(launches).values({
        id: launchId,
        chain: "robinhood",
        tokenAddress: event!.token,
        curveAddress: event!.curve,
        name: input.name,
        symbol: input.symbol.toUpperCase(),
        description: input.description,
        imageUri: input.imageUri ?? null,
        website: input.website ?? null,
        twitter: input.twitter ?? null,
        // The zero address means native ETH, as pons records it.
        pairToken: event!.pairToken,
        pairSymbol,
        creatorWallet: wallet,
        withAgent: Boolean(input.agent),
        agentId,
        txHash: input.txHash,
      });
    });
    const [row] = await db.select().from(launches).where(eq(launches.id, launchId));
    res.status(201).json({ launch: (await enrich([row]))[0] });
  }),
);
