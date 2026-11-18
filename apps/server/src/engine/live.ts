/**
 * Live execution from personal vaults. Disabled unless LIVE_TRADING_ENABLED=true.
 * Swaps route through the KyberSwap aggregator on Robinhood Chain; every trade starts and
 * ends in native ETH inside the vault. Nothing is bridged.
 */
import { CHAINS, type ChainKey, type MarketToken } from "@elyagents/shared";
import { erc20Abi, formatEther, formatUnits, parseEther, parseEventLogs, parseUnits, type Hex } from "viem";
import { env, liveAllowedFor, liveExecutionEnabled } from "../env";
import { fmtUsd } from "../lib/util";
import { errorMessage, log } from "../log";
import { fetchJson, HttpError, TtlCache } from "../market/http";
import type { AgentRow, PositionRow } from "../serializers";
import { publicClient, walletClient } from "../wallets/evm";
import { vaultBalances, walletSecret } from "../wallets/vault";

export const NATIVE_EVM = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
/** ETH kept back for gas. A Robinhood Chain swap costs about a cent, so this covers dozens. */
const GAS_RESERVE_ETH = 0.0005;
const gasReserve = (_chain: ChainKey) => GAS_RESERVE_ETH;

/** KyberSwap MetaAggregationRouterV2, the same address on Robinhood Chain. Builds that name any other router are refused. */
export const KYBER_ROUTER = "0x6131B5fae19EA4f9D964eAc0408E4408b66337b5";
/** KyberSwap API path segment for each chain. */
const KYBER_CHAIN: Record<ChainKey, string> = { robinhood: "robinhood" };
/** KyberSwap codes meaning no pool can take the trade: route not found, no eligible pool, unknown token. */
const KYBER_NO_ROUTE = new Set([4008, 4010, 4011]);

export class NoRouteError extends Error {}

/** A pool below this is treated as drained, e.g. its creator pulled the liquidity. */
export const DRAINED_LIQUIDITY_USD = 100;

const priceCache = new TtlCache<Record<string, number>>(60_000);

async function geckoTerminalPrice(network: string, address: string): Promise<number> {
  const body = await fetchJson<{ data?: { attributes?: { token_prices?: Record<string, string> } } }>(
    `https://api.geckoterminal.com/api/v2/simple/networks/${network}/token_price/${address}`,
    { upstream: "gecko", retries: 1 },
  );
  return Number(Object.values(body.data?.attributes?.token_prices ?? {})[0] ?? 0) || 0;
}

/** USD price of the native coin, keyed by symbol. */
export async function nativePrices(): Promise<Record<string, number>> {
  return priceCache.get("native", async () => {
    // The keyless CoinGecko API refuses some datacenter IPs, so fall back to GeckoTerminal's WETH quote on Robinhood Chain.
    const prices: Record<string, number> = await fetchJson<Record<string, { usd: number }>>(
      "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd",
      { retries: 1 },
    )
      .then((body) => ({ ETH: body.ethereum?.usd ?? 0 }))
      .catch((err) => {
        log.warn(`native prices: CoinGecko unavailable (${errorMessage(err).slice(0, 120)}), using GeckoTerminal`);
        return {};
      });
    if ((prices.ETH ?? 0) <= 0) {
      prices.ETH = await geckoTerminalPrice(CHAINS.robinhood.gecko, CHAINS.robinhood.wrappedNative.toLowerCase()).catch(() => 0);
    }
    if ((prices.ETH ?? 0) <= 0) throw new Error("ETH price unavailable");
    return prices;
  });
}

export async function liveReadiness(
  agent: AgentRow,
): Promise<{ totalUsd: number; chains: ChainKey[]; missingPrice: boolean }> {
  const [wallets, prices] = await Promise.all([vaultBalances(agent.id), nativePrices().catch(() => ({}) as Record<string, number>)]);
  let totalUsd = 0;
  let missingPrice = false;
  const chains: ChainKey[] = [];
  for (const w of wallets) {
    if (!w.liveEnabled || w.balance === null) continue;
    const spendable = w.balance - gasReserve(w.chain);
    if (spendable <= 0) continue;
    const price = prices[w.nativeSymbol] ?? 0;
    if (price <= 0) {
      missingPrice = true;
      continue;
    }
    chains.push(w.chain);
    totalUsd += spendable * price;
  }
  return { totalUsd, chains, missingPrice };
}

type BuyResult =
  | { ok: true; quantity: number; costUsd: number; txHash: string; rawQuantity: string }
  | { ok: false; error: string };
/** `unsellable`: no route and no liquidity left, so retrying cannot succeed. */
type SellResult = { ok: true; proceedsUsd: number; txHash: string } | { ok: false; error: string; unsellable?: boolean };

interface KyberResponse<T> {
  code: number;
  message: string;
  data?: T;
}

export interface KyberBuild {
  amountOut: string;
  data: Hex;
  routerAddress: Hex;
  transactionValue: string;
  /** The exchanges this route goes through. */
  sources: string[];
}

interface KyberOptions {
  slippageBps?: number;
  excludedSources?: string[];
}

/** Fresh KyberSwap route, built into calldata for `account` (sender and recipient). */
export async function kyberBuild(chain: ChainKey, tokenIn: string, tokenOut: string, amountIn: bigint, account: Hex, options: KyberOptions = {}): Promise<KyberBuild> {
  const base = `${env.KYBERSWAP_API_URL.replace(/\/+$/, "")}/${KYBER_CHAIN[chain]}/api/v1`;
  const headers: Record<string, string> = {
    "x-client-id": env.KYBERSWAP_CLIENT_ID,
    ...(env.KYBERSWAP_API_KEY ? { "x-api-key": env.KYBERSWAP_API_KEY } : {}),
  };
  const qs = new URLSearchParams({ tokenIn, tokenOut, amountIn: amountIn.toString(), origin: account });
  if (options.excludedSources?.length) qs.set("excludedSources", options.excludedSources.join(","));
  const route = await fetchJson<KyberResponse<{ routeSummary: { route?: { exchange: string }[][] } & Record<string, unknown> }>>(`${base}/routes?${qs}`, {
    retries: 1,
    init: { headers },
  }).catch((err) => {
    // No route comes back as HTTP 400 with the KyberSwap code in the body.
    const code = err instanceof HttpError ? Number(/"code"\s*:\s*(\d+)/.exec(err.message)?.[1]) : Number.NaN;
    throw KYBER_NO_ROUTE.has(code) ? new NoRouteError(`no KyberSwap route (code ${code})`) : err;
  });
  if (KYBER_NO_ROUTE.has(route.code)) throw new NoRouteError(`no KyberSwap route (code ${route.code})`);
  if (route.code !== 0 || !route.data?.routeSummary) throw new Error(`No KyberSwap route: ${route.message}`);
  const built = await fetchJson<KyberResponse<Omit<KyberBuild, "sources">>>(`${base}/route/build`, {
    retries: 1,
    init: {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({
        routeSummary: route.data.routeSummary,
        sender: account,
        recipient: account,
        origin: account,
        slippageTolerance: options.slippageBps ?? env.LIVE_SLIPPAGE_BPS,
        deadline: Math.floor(Date.now() / 1000) + 600,
        source: env.KYBERSWAP_CLIENT_ID,
      }),
    },
  });
  if (built.code !== 0 || !built.data?.data) throw new Error(`KyberSwap build failed: ${built.message}`);
  if (built.data.routerAddress.toLowerCase() !== KYBER_ROUTER.toLowerCase())
    throw new Error(`Unexpected KyberSwap router ${built.data.routerAddress}`);
  const sources = [...new Set((route.data.routeSummary.route ?? []).flat().map((step) => step.exchange))];
  return { ...built.data, sources };
}

/** Tokens that actually reached `account` in a swap (after any transfer tax). */
function receivedFromLogs(logs: Parameters<typeof parseEventLogs>[0]["logs"], token: string, account: string): bigint {
  return parseEventLogs({ abi: erc20Abi, eventName: "Transfer", logs })
    .filter((l) => l.address.toLowerCase() === token.toLowerCase() && l.args.to.toLowerCase() === account.toLowerCase())
    .reduce((sum, l) => sum + l.args.value, 0n);
}

export async function liveBuy(agent: AgentRow, token: MarketToken, spendUsd: number): Promise<BuyResult> {
  if (!liveAllowedFor(agent.ownerAddress)) return { ok: false, error: "Live trading is limited to test agents for now" };
  const chain = token.chain;
  if (!liveExecutionEnabled(chain)) return { ok: false, error: `Live execution is not enabled on ${CHAINS[chain].name}` };
  try {
    const prices = await nativePrices();
    const nativeUsd = prices[CHAINS[chain].nativeSymbol];
    if (!nativeUsd) return { ok: false, error: `${CHAINS[chain].nativeSymbol} price unavailable` };

    const key = (await walletSecret(agent.id)) as Hex;
    const wallet = walletClient(chain, key);
    const client = publicClient(chain);
    // Never dip into the gas reserve, whatever the sizing said.
    const balance = await client.getBalance({ address: wallet.account.address });
    const reserve = parseEther(gasReserve(chain).toFixed(18));
    const spendable = balance > reserve ? balance - reserve : 0n;
    let sellAmount = parseUnits((spendUsd / nativeUsd).toFixed(18), 18);
    if (sellAmount > spendable) sellAmount = spendable;
    if (sellAmount === 0n) return { ok: false, error: "Vault balance is below the gas reserve" };
    const costUsd = Number(formatEther(sellAmount)) * nativeUsd;

    const built = await kyberBuild(chain, NATIVE_EVM, token.address, sellAmount, wallet.account.address);
    const hash = await wallet.sendTransaction({
      to: built.routerAddress,
      data: built.data,
      value: BigInt(built.transactionValue),
    });
    const receipt = await client.waitForTransactionReceipt({ hash, timeout: 120_000 });
    if (receipt.status !== "success") return { ok: false, error: `Swap reverted (${hash})` };
    const decimals = await client.readContract({ address: token.address as Hex, abi: erc20Abi, functionName: "decimals" });
    const received = receivedFromLogs(receipt.logs, token.address, wallet.account.address);
    const raw = received > 0n ? received : BigInt(built.amountOut);
    return { ok: true, quantity: Number(formatUnits(raw, decimals)), costUsd, txHash: hash, rawQuantity: raw.toString() };
  } catch (err) {
    return { ok: false, error: `Live buy failed: ${errorMessage(err).slice(0, 160)}` };
  }
}

export async function liveSell(agent: AgentRow, position: PositionRow, quote: MarketToken): Promise<SellResult> {
  const chain = position.chain as ChainKey;
  if (!liveExecutionEnabled(chain)) return { ok: false, error: `Live execution is not enabled on ${CHAINS[chain].name}` };
  if (!position.rawQuantity) return { ok: false, error: "Missing on-chain quantity" };
  try {
    const prices = await nativePrices();
    const nativeUsd = prices[CHAINS[chain].nativeSymbol] ?? 0;
    const amount = BigInt(position.rawQuantity);
    const key = (await walletSecret(agent.id)) as Hex;
    const wallet = walletClient(chain, key);
    const client = publicClient(chain);

    const owner = wallet.account.address;
    const token = position.tokenAddress as Hex;
    // A transfer tax can leave less in the vault than the swap reported.
    const held = await client.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [owner] });
    const sellAmount = held < amount ? held : amount;
    if (sellAmount === 0n) return { ok: false, error: "Vault holds none of this token" };
    // Route before approving, so a drained pool costs no gas.
    let built: KyberBuild;
    try {
      built = await kyberBuild(chain, token, NATIVE_EVM, sellAmount, owner);
    } catch (err) {
      if (err instanceof NoRouteError && quote.liquidityUsd < DRAINED_LIQUIDITY_USD) {
        return { ok: false, unsellable: true, error: `No liquidity left to sell into (pool holds ${fmtUsd(quote.liquidityUsd)})` };
      }
      throw err;
    }
    const allowance = await client.readContract({
      address: token,
      abi: erc20Abi,
      functionName: "allowance",
      args: [owner, KYBER_ROUTER],
    });
    if (allowance < sellAmount) {
      const approveHash = await wallet.writeContract({
        address: token,
        abi: erc20Abi,
        functionName: "approve",
        args: [KYBER_ROUTER, sellAmount],
      });
      const approval = await client.waitForTransactionReceipt({ hash: approveHash, timeout: 120_000 });
      if (approval.status !== "success") return { ok: false, error: `Approval reverted (${approveHash})` };
    }
    const send = (route: KyberBuild) => wallet.sendTransaction({ to: route.routerAddress, data: route.data, value: BigInt(route.transactionValue) });
    const before = await client.getBalance({ address: owner });
    let hash: Hex;
    try {
      hash = await send(built);
    } catch (err) {
      // A route that cannot execute fails in the gas estimate, which costs nothing. KyberSwap's view
      // of a pool can lag on a young chain, so try once without the exchanges it just used.
      const retry = await kyberBuild(chain, token, NATIVE_EVM, sellAmount, owner, { excludedSources: built.sources }).catch(() => {
        throw err;
      });
      hash = await send(retry);
    }
    const receipt = await client.waitForTransactionReceipt({ hash, timeout: 120_000 });
    if (receipt.status !== "success") return { ok: false, error: `Swap reverted (${hash})` };
    // The quote can overstate what a pool pays, so book what actually arrived.
    const received = (await client.getBalance({ address: owner })) - before + receipt.gasUsed * receipt.effectiveGasPrice;
    return { ok: true, proceedsUsd: Number(formatEther(received > 0n ? received : 0n)) * nativeUsd, txHash: hash };
  } catch (err) {
    return { ok: false, error: `Live sell failed: ${errorMessage(err).slice(0, 160)}` };
  }
}
