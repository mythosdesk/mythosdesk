import { CHAINS, chainByDexscreenerId, type ChainKey, type MarketToken } from "@elyagents/shared";
import { chunk } from "../lib/util";
import { fetchJson } from "./http";

const BASE = "https://api.dexscreener.com";

interface DsPair {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  baseToken: { address: string; name: string; symbol: string };
  quoteToken: { address: string; name: string; symbol: string };
  priceUsd?: string;
  txns?: Record<string, { buys: number; sells: number }>;
  volume?: Record<string, number>;
  priceChange?: Record<string, number>;
  liquidity?: { usd?: number };
  fdv?: number;
  marketCap?: number;
  pairCreatedAt?: number;
  info?: { imageUrl?: string };
}

const t = (v?: { buys: number; sells: number }) => ({ buys: v?.buys ?? 0, sells: v?.sells ?? 0 });

export function mapPair(p: DsPair): MarketToken | null {
  const chain = chainByDexscreenerId(p.chainId);
  if (!chain) return null;
  const price = Number.parseFloat(p.priceUsd ?? "");
  return {
    chain: chain.key,
    address: p.baseToken.address,
    pairAddress: p.pairAddress,
    symbol: p.baseToken.symbol,
    name: p.baseToken.name,
    imageUrl: p.info?.imageUrl ?? null,
    quoteSymbol: p.quoteToken?.symbol ?? null,
    priceUsd: Number.isFinite(price) ? price : 0,
    liquidityUsd: p.liquidity?.usd ?? 0,
    volume24hUsd: p.volume?.h24 ?? 0,
    volume1hUsd: p.volume?.h1 ?? 0,
    volume5mUsd: p.volume?.m5 ?? 0,
    marketCapUsd: p.marketCap ?? p.fdv ?? 0,
    fdvUsd: p.fdv ?? 0,
    priceChange5m: p.priceChange?.m5 ?? 0,
    priceChange1h: p.priceChange?.h1 ?? 0,
    priceChange24h: p.priceChange?.h24 ?? 0,
    txns5m: t(p.txns?.m5),
    txns1h: t(p.txns?.h1),
    txns24h: t(p.txns?.h24),
    pairCreatedAt: p.pairCreatedAt ?? null,
    dexId: p.dexId,
    url: p.url,
    source: "dexscreener",
  };
}

/** Best (most liquid) pair per token address. */
function bestByToken(pairs: DsPair[]): Map<string, MarketToken> {
  const best = new Map<string, MarketToken>();
  for (const pair of pairs) {
    const token = mapPair(pair);
    if (!token) continue;
    const key = token.address.toLowerCase();
    const current = best.get(key);
    if (!current || token.liquidityUsd > current.liquidityUsd) best.set(key, token);
  }
  return best;
}

export async function dsTokens(chain: ChainKey, addresses: string[]): Promise<Map<string, MarketToken>> {
  const result = new Map<string, MarketToken>();
  const unique = [...new Set(addresses.filter(Boolean))];
  for (const group of chunk(unique, 30)) {
    const url = `${BASE}/tokens/v1/${CHAINS[chain].dexscreener}/${group.join(",")}`;
    const pairs = await fetchJson<DsPair[]>(url, { upstream: "dexscreener" });
    for (const [k, v] of bestByToken(Array.isArray(pairs) ? pairs : [])) result.set(k, v);
  }
  return result;
}

export async function dsSearch(query: string): Promise<MarketToken[]> {
  const url = `${BASE}/latest/dex/search?q=${encodeURIComponent(query)}`;
  const body = await fetchJson<{ pairs?: DsPair[] }>(url, { upstream: "dexscreener" });
  return [...bestByToken(body.pairs ?? []).values()];
}

interface DsBoost {
  chainId: string;
  tokenAddress: string;
}

/** Tokens currently boosted on DexScreener, enriched with pair data. */
export async function dsBoosted(chain: ChainKey): Promise<MarketToken[]> {
  const boosts = await fetchJson<DsBoost[]>(`${BASE}/token-boosts/top/v1`, { upstream: "dexscreener" });
  const latest = await fetchJson<DsBoost[]>(`${BASE}/token-boosts/latest/v1`, { upstream: "dexscreener" }).catch(
    () => [] as DsBoost[],
  );
  const addresses = [...boosts, ...latest]
    .filter((b) => b.chainId === CHAINS[chain].dexscreener)
    .map((b) => b.tokenAddress);
  if (addresses.length === 0) return [];
  return [...(await dsTokens(chain, addresses.slice(0, 60))).values()];
}
