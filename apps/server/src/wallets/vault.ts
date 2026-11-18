import { CHAIN_KEYS, CHAINS, type ChainKey, type VaultWallet } from "@elyagents/shared";
import { and, eq } from "drizzle-orm";
import { formatEther, parseEther, type Hex } from "viem";
import { db, schema } from "../db/client";
import { liveExecutionEnabled } from "../env";
import { decryptSecret, encryptSecret } from "../lib/crypto";
import { newId } from "../lib/util";
import { errorMessage } from "../log";
import { TtlCache } from "../market/http";
import { evmBalance, generateEvmWallet, sendEvmNative } from "./evm";

const { agentWallets, withdrawals } = schema;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** One Robinhood Chain key per agent. */
export async function createAgentWallets(tx: Tx, agentId: string) {
  const evm = generateEvmWallet();
  await tx
    .insert(agentWallets)
    .values({ id: newId(), agentId, kind: "evm", address: evm.address, encryptedKey: encryptSecret(evm.privateKey) });
  return { evmAddress: evm.address };
}

export async function walletAddresses(agentId: string) {
  const rows = await db.select().from(agentWallets).where(eq(agentWallets.agentId, agentId));
  return { evm: rows.find((r) => r.kind === "evm")?.address ?? null };
}

export async function walletSecret(agentId: string): Promise<string> {
  const [row] = await db
    .select()
    .from(agentWallets)
    .where(and(eq(agentWallets.agentId, agentId), eq(agentWallets.kind, "evm")));
  if (!row) throw new Error("No wallet for this agent");
  return decryptSecret(row.encryptedKey);
}

const balanceCache = new TtlCache<VaultWallet[]>(20_000);

export async function vaultBalances(agentId: string, fresh = false): Promise<VaultWallet[]> {
  const load = async () => {
    const { evm } = await walletAddresses(agentId);
    return Promise.all(
      CHAIN_KEYS.map(async (chain): Promise<VaultWallet> => {
        const base = {
          chain,
          address: evm ?? "",
          nativeSymbol: CHAINS[chain].nativeSymbol,
          liveEnabled: liveExecutionEnabled(chain),
        };
        if (!evm) return { ...base, balance: null, balanceError: "Wallet missing" };
        try {
          return { ...base, balance: Number(formatEther(await evmBalance(chain, evm as Hex))), balanceError: null };
        } catch (err) {
          return { ...base, balance: null, balanceError: errorMessage(err).slice(0, 120) };
        }
      }),
    );
  };
  if (fresh) {
    const value = await load();
    balanceCache.set(agentId, value);
    return value;
  }
  return balanceCache.get(agentId, load);
}

export async function withdrawNative(params: {
  agentId: string;
  chain: ChainKey;
  to: string;
  amount: string | "max";
}): Promise<{ id: string; txHash: string; amount: string }> {
  const { agentId, chain, to, amount } = params;
  const id = newId();
  await db.insert(withdrawals).values({ id, agentId, chain, toAddress: to, amount, status: "PENDING" });
  try {
    const key = (await walletSecret(agentId)) as Hex;
    const result = await sendEvmNative(chain, key, to as Hex, amount === "max" ? "max" : parseEther(amount));
    const sent = formatEther(result.value);
    await db.update(withdrawals).set({ status: "SENT", txHash: result.hash, amount: sent }).where(eq(withdrawals.id, id));
    balanceCache.set(agentId, await vaultBalances(agentId, true));
    return { id, txHash: result.hash, amount: sent };
  } catch (err) {
    await db
      .update(withdrawals)
      .set({ status: "FAILED", error: errorMessage(err).slice(0, 300) })
      .where(eq(withdrawals.id, id));
    throw err;
  }
}

export async function pendingWithdrawal(agentId: string): Promise<boolean> {
  const rows = await db
    .select({ id: withdrawals.id })
    .from(withdrawals)
    .where(and(eq(withdrawals.agentId, agentId), eq(withdrawals.status, "PENDING")));
  return rows.length > 0;
}
