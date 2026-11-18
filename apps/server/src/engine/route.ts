/**
 * What a round trip through the live route really costs, measured before any entry.
 *
 * Uniswap v4 pools can charge their swap fee through a hook (graduated pons pools do), and a
 * token can carry a tax, so the aggregator's quote does not always show what a trade costs.
 * Some routes can buy but not sell. So both legs are simulated with eth_call from a probe
 * address whose balances are overridden: no funds, no signature, nothing sent. Paper fills pay
 * the measured cost, and tokens that are too expensive, cannot be sold or cannot be measured
 * never reach the shortlist.
 */
import { CHAINS, type ChainKey, type MarketToken } from "@elyagents/shared";
import { BaseError, decodeAbiParameters, encodeFunctionData, erc20Abi, formatUnits, HttpRequestError, numberToHex, parseEther, TimeoutError, type Hex, type StateOverride } from "viem";
import { errorMessage, log } from "../log";
import { HttpError, TtlCache } from "../market/http";
import { publicClient } from "../wallets/evm";
import { KYBER_ROUTER, kyberBuild, nativePrices, NATIVE_EVM, NoRouteError, type KyberBuild } from "./live";

export type RouteCheck =
  | { ok: true; buyCostPct: number; sellCostPct: number; roundTripPct: number }
  | { ok: false; reason: string };

/** Never holds funds. Its balances exist only inside the simulated calls. */
const PROBE: Hex = "0x000000000000000000000000000000000e1a9e47";
/** eth_createAccessList needs a funded sender. WETH holds all the wrapped ETH. */
const FUNDED_SENDER = CHAINS.robinhood.wrappedNative as Hex;
const CHECK_USD = 20;
/** Wide on purpose: a hidden fee should show up as a number here, not as a revert. */
const CHECK_SLIPPAGE_BPS = 2000;
const SIM_GAS = 8_000_000n;

/** Short, because hook fees and pool depth move within minutes. */
const cache = new TtlCache<RouteCheck>(3 * 60_000);
/** Storage keys of the probe's balance and allowance. A token's layout does not change. */
const slotCache = new Map<string, { balance: Hex; allowance: Hex } | null>();

/** KyberSwap's public API starts refusing at a few requests a second, and trades must not lose to checks. */
const ROUTE_SPACING_MS = 1000;
const RATE_LIMIT_PAUSE_MS = 60_000;
let nextRouteAt = 0;
let pausedUntil = 0;

async function pacedRoute(...args: Parameters<typeof kyberBuild>): Promise<KyberBuild> {
  const now = Date.now();
  const wait = Math.max(0, nextRouteAt - now);
  nextRouteAt = Math.max(now, nextRouteAt) + ROUTE_SPACING_MS;
  if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
  return kyberBuild(...args);
}

/** The single storage key a token reads for this call, found without assuming a storage layout. */
async function touchedKey(chain: ChainKey, token: Hex, data: Hex): Promise<Hex | null> {
  const { accessList } = await publicClient(chain).createAccessList({ account: FUNDED_SENDER, to: token, data });
  const keys = accessList.find((e) => e.address.toLowerCase() === token.toLowerCase())?.storageKeys ?? [];
  return keys.length === 1 ? keys[0] : null;
}

async function probeSlots(chain: ChainKey, token: Hex) {
  const key = token.toLowerCase();
  const known = slotCache.get(key);
  if (known !== undefined) return known;
  const [balance, allowance] = await Promise.all([
    touchedKey(chain, token, encodeFunctionData({ abi: erc20Abi, functionName: "balanceOf", args: [PROBE] })),
    touchedKey(chain, token, encodeFunctionData({ abi: erc20Abi, functionName: "allowance", args: [PROBE, KYBER_ROUTER as Hex] })),
  ]);
  const slots = balance && allowance ? { balance, allowance } : null;
  slotCache.set(key, slots);
  return slots;
}

const isTransient = (err: unknown) => err instanceof BaseError && err.walk((e) => e instanceof HttpRequestError || e instanceof TimeoutError) !== null;

/** Output of the route as the EVM computes it, or null when the swap reverts. */
async function simulate(chain: ChainKey, built: KyberBuild, overrides: StateOverride): Promise<bigint | null> {
  try {
    const { data } = await publicClient(chain).call({
      account: PROBE,
      to: built.routerAddress,
      data: built.data,
      value: BigInt(built.transactionValue),
      stateOverride: overrides,
      gas: SIM_GAS,
    });
    if (!data || data.length < 66) return null;
    return decodeAbiParameters([{ type: "uint256" }], data.slice(0, 66) as Hex)[0];
  } catch (err) {
    if (isTransient(err)) throw err;
    return null;
  }
}

async function measure(token: MarketToken): Promise<RouteCheck> {
  const { chain } = token;
  const address = token.address as Hex;
  const nativeUsd = (await nativePrices())[CHAINS[chain].nativeSymbol];
  if (!nativeUsd) throw new Error(`${CHAINS[chain].nativeSymbol} price unavailable`);
  const spend = parseEther((CHECK_USD / nativeUsd).toFixed(18));
  const funded: StateOverride = [{ address: PROBE, balance: parseEther("1000") }];
  const options = { slippageBps: CHECK_SLIPPAGE_BPS };

  // Buy leg.
  let buy: KyberBuild;
  try {
    buy = await pacedRoute(chain, NATIVE_EVM, address, spend, PROBE, options);
  } catch (err) {
    if (err instanceof NoRouteError) return { ok: false, reason: "no route to buy" };
    throw err;
  }
  const tokensOut = await simulate(chain, buy, funded);
  if (!tokensOut) return { ok: false, reason: "the buy reverts" };

  // Sell leg, with the tokens that buy would really deliver.
  const slots = await probeSlots(chain, address);
  if (!slots) throw new Error(`no storage keys found for ${token.symbol}`);
  const holding: StateOverride = [
    ...funded,
    {
      address,
      stateDiff: [
        { slot: slots.balance, value: numberToHex(tokensOut, { size: 32 }) },
        { slot: slots.allowance, value: numberToHex(tokensOut, { size: 32 }) },
      ],
    },
  ];
  let nativeOut: bigint | null = null;
  try {
    const sell = await pacedRoute(chain, address, NATIVE_EVM, tokensOut, PROBE, options);
    nativeOut = await simulate(chain, sell, holding);
    // The same fallback liveSell uses when a route cannot execute.
    if (!nativeOut) nativeOut = await simulate(chain, await pacedRoute(chain, address, NATIVE_EVM, tokensOut, PROBE, { ...options, excludedSources: sell.sources }), holding);
  } catch (err) {
    if (!(err instanceof NoRouteError)) throw err;
  }
  if (!nativeOut) return { ok: false, reason: "the sell reverts" };

  const decimals = await publicClient(chain).readContract({ address, abi: erc20Abi, functionName: "decimals" });
  // A cheap buy and a rich sell through different pools can look like a profit. It is not one.
  const roundTrip = Math.max(0, 1 - Number(nativeOut) / Number(spend));
  const buyCost = Math.min(roundTrip, Math.max(0, 1 - (Number(formatUnits(tokensOut, decimals)) * token.priceUsd) / CHECK_USD));
  const sellCost = 1 - (1 - roundTrip) / (1 - buyCost);
  const pct = (v: number) => Math.round(v * 10_000) / 100;
  return { ok: true, buyCostPct: pct(buyCost), sellCostPct: pct(sellCost), roundTripPct: pct(roundTrip) };
}

/** Cached per token. Null when it could not be measured right now, for example during an RPC or KyberSwap outage. */
export async function routeCheck(token: MarketToken): Promise<RouteCheck | null> {
  const key = `${token.chain}:${token.address.toLowerCase()}`;
  if (Date.now() < pausedUntil) return cache.peek(key) ?? null;
  try {
    return await cache.get(key, () => measure(token));
  } catch (err) {
    if (err instanceof HttpError && err.status === 429) pausedUntil = Date.now() + RATE_LIMIT_PAUSE_MS;
    log.warn(`route check ${token.symbol}: ${errorMessage(err).slice(0, 160)}`);
    return null;
  }
}

/** How much of a round trip a playbook can absorb: a share of its target and of its stop. One-percent pools cost 2-3%, the floor. */
export function maxRoundTripPct(config: { takeProfitPercent: number; stopLossPercent: number }): number {
  return Math.max(3, Math.min(config.takeProfitPercent * 0.3, config.stopLossPercent * 0.6));
}
