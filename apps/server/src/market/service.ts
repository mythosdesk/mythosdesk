import { CHAIN_KEYS, isBaseAsset, type ChainKey, type MarketFeed, type MarketToken } from "@elyagents/shared";
import { env } from "../env";
import { errorMessage, log } from "../log";
import { dsBoosted, dsSearch, dsTokens } from "./dexscreener";
import { geckoOhlcv, geckoPools, geckoTokenPools, type Candle, type OhlcvTimeframe } from "./geckoterminal";
import { TtlCache } from "./http";

/** Markets board eligibility, mirrored in the UI copy. */
export const ELIGIBILITY = {
  minLiquidityUsd: 10_000,
  minVolume24hUsd: 20_000,
  minMarketCapUsd: 25_000,
  minAgeMinutes: 30,
};

export function isEligible(t: MarketToken, now = Date.now()): boolean {
  const age = t.pairCreatedAt ? (now - t.pairCreatedAt) / 60_000 : Number.POSITIVE_INFINITY;
  return (
    !isBaseAsset(t.chain, t.address) &&
    t.liquidityUsd >= ELIGIBILITY.minLiquidityUsd &&
    t.volume24hUsd >= ELIGIBILITY.minVolume24hUsd &&
    t.marketCapUsd >= ELIGIBILITY.minMarketCapUsd &&
    age >= ELIGIBILITY.minAgeMinutes
  );
}

/** Merge feeds by token, keeping the most liquid pool for each. */
function dedupe(tokens: MarketToken[]): MarketToken[] {
  const map = new Map<string, MarketToken>();
  for (const t of tokens) {
    if (!t.priceUsd || t.priceUsd <= 0) continue;
    const key = `${t.chain}:${t.address.toLowerCase()}`;
    const prev = map.get(key);
    if (!prev || t.liquidityUsd > prev.liquidityUsd) map.set(key, t);
  }
  return [...map.values()];
}

class MarketService {
  private universe = new Map<ChainKey, { at: number; tokens: MarketToken[]; error: string | null }>();
  private boardCache = new TtlCache<MarketToken[]>(60_000);
  private tokenCache = new TtlCache<MarketToken | null>(30_000);
  private ohlcvCache = new TtlCache<Candle[]>(60_000);
  private refreshing: Promise<void> | null = null;

  /**
   * Refresh trending, top and new pools. GeckoTerminal leaves reserve_in_usd empty on many
   * Uniswap v4 pools, so DexScreener's liquidity figures are merged in: dedupe keeps the
   * most liquid record per token.
   */
  refreshUniverse(force = false): Promise<void> {
    if (this.refreshing) return this.refreshing;
    const stale = CHAIN_KEYS.filter((chain) => {
      const entry = this.universe.get(chain);
      return force || !entry || Date.now() - entry.at > env.MARKET_REFRESH_SECONDS * 1000;
    });
    if (stale.length === 0) return Promise.resolve();
    this.refreshing = (async () => {
      for (const chain of stale) {
        try {
          const [trending, fresh, top] = await Promise.all([
            geckoPools(chain, "trending").catch(() => [] as MarketToken[]),
            geckoPools(chain, "new").catch(() => [] as MarketToken[]),
            geckoPools(chain, "top").catch(() => [] as MarketToken[]),
          ]);
          const scanned = [...trending, ...fresh, ...top];
          const enriched = await dsTokens(chain, scanned.map((t) => t.address)).catch(() => new Map<string, MarketToken>());
          const tokens = dedupe([...scanned, ...enriched.values()]);
          const prev = this.universe.get(chain);
          // Keep the previous snapshot if both feeds failed.
          if (tokens.length === 0 && prev?.tokens.length) {
            this.universe.set(chain, { ...prev, at: Date.now(), error: "feed unavailable, using last snapshot" });
          } else {
            this.universe.set(chain, { at: Date.now(), tokens, error: null });
          }
        } catch (err) {
          log.warn(`market refresh failed for ${chain}: ${errorMessage(err)}`);
        }
      }
    })().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  /** What the agents may trade. The markets board still lists ETH, WETH and USDG pools; agents never buy them. */
  candidates(): MarketToken[] {
    return [...this.universe.values()].flatMap((e) => e.tokens).filter((t) => !isBaseAsset(t.chain, t.address));
  }

  candidatesFor(chain: ChainKey): MarketToken[] {
    return this.universe.get(chain)?.tokens ?? [];
  }

  tokensScanned(): number {
    return this.candidates().length;
  }

  chainHealth(): Record<ChainKey, { tokens: number; at: string | null; error: string | null }> {
    return Object.fromEntries(
      CHAIN_KEYS.map((chain) => {
        const e = this.universe.get(chain);
        return [chain, { tokens: e?.tokens.length ?? 0, at: e ? new Date(e.at).toISOString() : null, error: e?.error ?? null }];
      }),
    ) as Record<ChainKey, { tokens: number; at: string | null; error: string | null }>;
  }

  /** Fresh quotes for held tokens, keyed by `${chain}:${address lowercased}`. */
  async quotes(items: { chain: ChainKey; tokenAddress: string }[]): Promise<Map<string, MarketToken>> {
    const byChain = new Map<ChainKey, string[]>();
    for (const item of items) {
      const list = byChain.get(item.chain) ?? [];
      list.push(item.tokenAddress);
      byChain.set(item.chain, list);
    }
    const out = new Map<string, MarketToken>();
    for (const [chain, addresses] of byChain) {
      try {
        const found = await dsTokens(chain, addresses);
        for (const [address, token] of found) {
          out.set(`${chain}:${address}`, token);
          this.tokenCache.set(`${chain}:${address}`, token);
        }
      } catch (err) {
        log.warn(`quote refresh failed on ${chain}: ${errorMessage(err)}`);
      }
      // Fall back to the scanned universe for anything DexScreener missed.
      for (const address of addresses) {
        const key = `${chain}:${address.toLowerCase()}`;
        if (out.has(key)) continue;
        const known = this.candidatesFor(chain).find((t) => t.address.toLowerCase() === address.toLowerCase());
        if (known) out.set(key, known);
      }
    }
    return out;
  }

  async token(chain: ChainKey, address: string): Promise<MarketToken | null> {
    return this.tokenCache.get(`${chain}:${address.toLowerCase()}`, async () => {
      const found = await dsTokens(chain, [address]).catch(() => new Map<string, MarketToken>());
      const hit = found.get(address.toLowerCase());
      if (hit) return hit;
      const pools = await geckoTokenPools(chain, address).catch(() => [] as MarketToken[]);
      return pools.sort((a, b) => b.liquidityUsd - a.liquidityUsd)[0] ?? null;
    });
  }

  /** Every pool for a token, most liquid first. */
  async tokenPools(chain: ChainKey, address: string): Promise<MarketToken[]> {
    return this.boardCache.get(`pools:${chain}:${address.toLowerCase()}`, async () => {
      const pools = await geckoTokenPools(chain, address).catch(() => [] as MarketToken[]);
      return pools.sort((a, b) => b.liquidityUsd - a.liquidityUsd);
    });
  }

  async board(chain: ChainKey, feed: MarketFeed, query?: string): Promise<MarketToken[]> {
    if (query?.trim()) {
      const q = query.trim();
      return this.boardCache.get(`search:${q.toLowerCase()}`, () => dsSearch(q)).then((list) =>
        list.filter((t) => t.chain === chain),
      );
    }
    const key = `${chain}:${feed}`;
    // The discover feed mirrors the live universe, so keep its cache short.
    const list = await this.boardCache.get(key, async () => {
      switch (feed) {
        case "trending":
          return geckoPools(chain, "trending");
        case "new":
          return geckoPools(chain, "new");
        case "top":
          return geckoPools(chain, "top");
        case "boosted":
          return dsBoosted(chain);
        case "discover":
        default: {
          // Serve the engine's scanned universe immediately; refresh in the background.
          void this.refreshUniverse();
          const universe = this.candidatesFor(chain);
          if (universe.length) return universe;
          const scanned = [...(await geckoPools(chain, "trending")), ...(await geckoPools(chain, "new"))];
          const enriched = await dsTokens(chain, scanned.map((t) => t.address)).catch(() => new Map<string, MarketToken>());
          return dedupe([...scanned, ...enriched.values()]);
        }
      }
    });
    const now = Date.now();
    return dedupe(list).map((t) => ({ ...t, eligible: isEligible(t, now) }));
  }

  async ohlcv(chain: ChainKey, pool: string, timeframe: OhlcvTimeframe): Promise<Candle[]> {
    return this.ohlcvCache.get(`${chain}:${pool}:${timeframe}`, () => geckoOhlcv(chain, pool, timeframe));
  }
}

export const market = new MarketService();
