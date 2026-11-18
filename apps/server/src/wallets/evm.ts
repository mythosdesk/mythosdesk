import { ROBINHOOD_NETWORK, type ChainKey } from "@elyagents/shared";
import {
  createPublicClient,
  createWalletClient,
  fallback,
  http,
  type Chain,
  type Hex,
  type PublicClient,
  type Transport,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { robinhood } from "viem/chains";
import { env } from "../env";

export { robinhood };

const VIEM_CHAINS: Record<ChainKey, Chain> = { robinhood };

/** Backup endpoints per chain, used only when no RPC override is configured. */
const BACKUP_RPCS: Record<ChainKey, readonly string[]> = { robinhood: ROBINHOOD_NETWORK.backupRpcs };

export function viemChain(chain: ChainKey): Chain {
  return VIEM_CHAINS[chain];
}

/**
 * A configured provider is used on its own. Without one, the public endpoint is tried first and
 * the backups after it, because some networks intercept the public endpoint.
 */
export function rpcTransport(chain: ChainKey, options: { timeout: number; retryCount?: number }): Transport {
  if (env.rpcOverride[chain]) return http(env.rpcOverride[chain], options);
  return fallback([env.rpc[chain], ...BACKUP_RPCS[chain]].map((url) => http(url, options)));
}

const clients = new Map<ChainKey, PublicClient>();

export function publicClient(chain: ChainKey): PublicClient {
  let client = clients.get(chain);
  if (!client) {
    client = createPublicClient({
      chain: viemChain(chain),
      transport: rpcTransport(chain, { timeout: 12_000, retryCount: 1 }),
    }) as PublicClient;
    clients.set(chain, client);
  }
  return client;
}

export function walletClient(chain: ChainKey, privateKey: Hex) {
  return createWalletClient({
    account: privateKeyToAccount(privateKey),
    chain: viemChain(chain),
    transport: rpcTransport(chain, { timeout: 20_000 }),
  });
}

export function generateEvmWallet() {
  const privateKey = generatePrivateKey();
  return { address: privateKeyToAccount(privateKey).address, privateKey };
}

export async function evmBalance(chain: ChainKey, address: Hex): Promise<bigint> {
  return publicClient(chain).getBalance({ address });
}

/**
 * Send native coin. "max" leaves enough for gas with a 25% buffer. The gas limit is
 * estimated rather than hard-coded: an Arbitrum chain can charge parent-chain data in L2 gas.
 */
export async function sendEvmNative(chain: ChainKey, privateKey: Hex, to: Hex, amount: bigint | "max") {
  const client = publicClient(chain);
  const account = privateKeyToAccount(privateKey);
  const balance = await client.getBalance({ address: account.address });
  const fees = await client.estimateFeesPerGas();
  const maxFee = fees.maxFeePerGas ?? fees.gasPrice ?? 0n;
  const estimated = await client.estimateGas({ account: account.address, to, value: 0n });
  const gas = (estimated * 125n) / 100n;
  const gasCost = gas * maxFee;
  const value = amount === "max" ? balance - gasCost : amount;
  if (value <= 0n) throw new Error("Balance does not cover network fees");
  if (value + gasCost > balance) throw new Error("Amount plus network fees exceeds the vault balance");
  const hash = await walletClient(chain, privateKey).sendTransaction({
    to,
    value,
    gas,
    ...(fees.maxFeePerGas ? { maxFeePerGas: fees.maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas } : {}),
  });
  return { hash, value };
}
