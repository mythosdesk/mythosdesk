import { CHAINS, type ChainKey, type MarketToken } from "@elyagents/shared";
import { fetchJson } from "./http";

const BASE = "https://api.geckoterminal.com/api/v2";
const HEADERS = { accept: "application/json;version=20230302" };

interface GtTxn {
  buys?: number;
  sells?: number;
}

interface GtPool {
  id: string;
  type: "pool";
  attributes: {
    name: string;
    address: string;
    base_token_price_usd: string | null;
    fdv_usd: string | null;
    market_cap_usd: string | null;
    reserve_in_usd: string | null;
    pool_created_at: string | null;
    price_change_percentage?: Record<string, string | null>;
    transactions?: Record<string, GtTxn>;
    volume_usd?: Record<string, string | null>;
  };
  relationships?: {
    base_token?: { data?: { id: string } };
    quote_token?: { data?: { id: string } };
    dex?: { data?: { id: string } };
  };
}

interface GtToken {
  id: string;
  type: "token";
  attributes: { address: string; name: string; symbol: string; image_url: string | null };
}

interface GtResponse {
  data: GtPool[];
  included?: GtToken[];
}

const n = (v: string | number | null | undefined) => {
  const x = typeof v === "number" ? v : Number.parseFloat(v ?? "");
  return Number.isFinite(x) ? x : 0;
};

const txn = (t: GtTxn | undefined) => ({ buys: t?.buys ?? 0, sells: t?.sells ?? 0 });

function mapPools(chain: ChainKey, body: GtResponse): MarketToken[] {
  const tokens = new Map((body.included ?? []).filter((i) => i.type === "token").map((t) => [t.id, t.attributes]));
  const out: MarketToken[] = [];
  for (const pool of body.data ?? []) {
    const a = pool.attributes;
    const baseId = pool.relationships?.base_token?.data?.id;
    const quoteId = pool.relationships?.quote_token?.data?.id;
    const base = baseId ? tokens.get(baseId) : undefined;
    const quote = quoteId ? tokens.get(quoteId) : undefined;
    const address = base?.address ?? baseId?.split("_").slice(1).join("_");
    if (!address) continue;
    const [baseName] = a.name.split(" / ");
    const fdv = n(a.fdv_usd);
    out.push({
      chain,
      address,
      pairAddress: a.address,
      symbol: base?.symbol ?? baseName ?? "?",
      name: base?.name ?? baseName ?? "Unknown",
      imageUrl: base?.image_url && !base.image_url.includes("missing") ? base.image_url : null,
      quoteSymbol: quote?.symbol ?? a.name.split(" / ")[1] ?? null,
      priceUsd: n(a.base_token_price_usd),
      liquidityUsd: n(a.reserve_in_usd),
      volume24hUsd: n(a.volume_usd?.h24),
      volume1hUsd: n(a.volume_usd?.h1),
      volume5mUsd: n(a.volume_usd?.m5),
      marketCapUsd: n(a.market_cap_usd) || fdv,
      fdvUsd: fdv,
      priceChange5m: n(a.price_change_percentage?.m5),
      priceChange1h: n(a.price_change_percentage?.h1),
      priceChange24h: n(a.price_change_percentage?.h24),
      txns5m: txn(a.transactions?.m5),
      txns1h: txn(a.transactions?.h1),
      txns24h: txn(a.transactions?.h24),
      pairCreatedAt: a.pool_created_at ? Date.parse(a.pool_created_at) : null,
      dexId: pool.relationships?.dex?.data?.id ?? null,
      url: `https://www.geckoterminal.com/${CHAINS[chain].gecko}/pools/${a.address}`,
      source: "geckoterminal",
    });
  }
  return out;
}

export type GeckoFeed = "trending" | "new" | "top";

const FEED_PATH: Record<GeckoFeed, string> = {
  trending: "trending_pools",
  new: "new_pools",
  top: "pools",
};

export async function geckoPools(chain: ChainKey, feed: GeckoFeed, page = 1): Promise<MarketToken[]> {
  const net = CHAINS[chain].gecko;
  const url = `${BASE}/networks/${net}/${FEED_PATH[feed]}?include=base_token,quote_token&page=${page}`;
  const body = await fetchJson<GtResponse>(url, { upstream: "gecko", init: { headers: HEADERS } });
  return mapPools(chain, body);
}

export async function geckoTokenPools(chain: ChainKey, address: string): Promise<MarketToken[]> {
  const net = CHAINS[chain].gecko;
  const url = `${BASE}/networks/${net}/tokens/${address}/pools?include=base_token,quote_token&page=1`;
  const body = await fetchJson<GtResponse>(url, { upstream: "gecko", init: { headers: HEADERS } });
  return mapPools(chain, body);
}

export type OhlcvTimeframe = "5m" | "1h" | "6h" | "1d" | "all";

const TIMEFRAMES: Record<OhlcvTimeframe, { unit: "minute" | "hour" | "day"; aggregate: number; limit: number }> = {
  "5m": { unit: "minute", aggregate: 1, limit: 300 },
  "1h": { unit: "minute", aggregate: 5, limit: 288 },
  "6h": { unit: "minute", aggregate: 15, limit: 300 },
  "1d": { unit: "hour", aggregate: 1, limit: 300 },
  all: { unit: "day", aggregate: 1, limit: 365 },
};

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export async function geckoOhlcv(chain: ChainKey, pool: string, timeframe: OhlcvTimeframe): Promise<Candle[]> {
  const net = CHAINS[chain].gecko;
  const tf = TIMEFRAMES[timeframe];
  const url = `${BASE}/networks/${net}/pools/${pool}/ohlcv/${tf.unit}?aggregate=${tf.aggregate}&limit=${tf.limit}&currency=usd`;
  const body = await fetchJson<{ data: { attributes: { ohlcv_list: number[][] } } }>(url, {
    upstream: "gecko",
    init: { headers: HEADERS },
  });
  return (body.data?.attributes?.ohlcv_list ?? [])
    .map(([time, open, high, low, close, volume]) => ({ time, open, high, low, close, volume }))
    .sort((a, b) => a.time - b.time);
}
