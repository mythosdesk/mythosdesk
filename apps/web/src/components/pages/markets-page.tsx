"use client";

import { ArrowClockwise, Broadcast, MagnifyingGlass } from "@phosphor-icons/react";
import { CHAINS, type MarketFeed, type MarketToken } from "@elyagents/shared";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ChainIcon } from "@/components/common/chain";
import { Card, EmptyState, PageHeader, Pnl, Tag } from "@/components/common/bits";
import { TokenAvatar } from "@/components/common/token-avatar";
import { ageFrom, fmtInt, fmtPrice, fmtUsd } from "@/lib/format";
import { useMarkets } from "@/lib/queries";
import { useNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";

const FEEDS: { id: MarketFeed; label: string }[] = [
  { id: "discover", label: "Discover" },
  { id: "trending", label: "Trending" },
  { id: "new", label: "New pools" },
  { id: "top", label: "Top pools" },
  { id: "boosted", label: "DexScreener" },
];

const SORTS = [
  { id: "activity", label: "Activity" },
  { id: "volume", label: "Volume" },
  { id: "mcap", label: "Market cap" },
  { id: "liquidity", label: "Liquidity" },
  { id: "newest", label: "Newest" },
] as const;

type Sort = (typeof SORTS)[number]["id"];
type Filter = "all" | "eligible" | "new";

const activity = (t: MarketToken) => t.txns1h.buys + t.txns1h.sells;

export function MarketsPage() {
  const chain = "robinhood" as const;
  const [feed, setFeed] = useState<MarketFeed>("discover");
  const [sort, setSort] = useState<Sort>("activity");
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const { data, isPending, isFetching, refetch } = useMarkets(chain, feed, query);
  const now = useNow(60_000);

  const rows = useMemo(() => {
    let list = [...(data?.tokens ?? [])];
    if (filter === "eligible") list = list.filter((t) => t.eligible);
    if (filter === "new" && now) list = list.filter((t) => t.pairCreatedAt && now - t.pairCreatedAt < 86_400_000);
    const by: Record<Sort, (t: MarketToken) => number> = {
      activity,
      volume: (t) => t.volume24hUsd,
      mcap: (t) => t.marketCapUsd,
      liquidity: (t) => t.liquidityUsd,
      newest: (t) => t.pairCreatedAt ?? 0,
    };
    return list.sort((a, b) => by[sort](b) - by[sort](a));
  }, [data, filter, sort, now]);

  const eligibleCount = (data?.tokens ?? []).filter((t) => t.eligible).length;

  return (
    <div>
      <PageHeader
        eyebrow="Markets"
        title="Markets"
        description="Tokens the agents can see on Robinhood Chain. Eligible: $10K+ liquidity, $20K+ volume, $25K+ market cap, 30m+ old."
        action={
          <span className="inline-flex items-center gap-2 rounded-full bg-up/10 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-up ring-1 ring-up/25">
            <Broadcast weight="bold" className="size-3.5" /> Live market data
          </span>
        }
      />

      <div className="mb-4 grid gap-4 md:grid-cols-3">
        <Card coreClassName="p-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Network</p>
          <p className="mt-2 flex items-center gap-2 text-2xl font-semibold tracking-tight"><ChainIcon chain={chain} className="size-7" />{CHAINS[chain].name}</p>
          <p className="mt-1 text-xs text-muted-foreground">{`Gas in ${CHAINS[chain].nativeSymbol} · chain ${CHAINS[chain].chainId}`}</p>
        </Card>
        <Card coreClassName="p-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">In this view</p>
          <p className="num mt-2 text-2xl font-semibold tracking-tight">{rows.length} <span className="text-base text-muted-foreground">tokens</span></p>
          <p className="mt-1 text-xs text-muted-foreground">{eligibleCount} eligible for agents</p>
        </Card>
        <Card coreClassName="p-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Data sources</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight">Live feeds</p>
          <p className="mt-1 text-xs text-muted-foreground">GeckoTerminal · DexScreener</p>
        </Card>
      </div>

      <Card coreClassName="overflow-hidden">
        <div className="space-y-3 border-b border-hairline p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1 rounded-full bg-foreground/[0.03] p-1 ring-1 ring-hairline">
              {FEEDS.map((f) => (
                <button key={f.id} type="button" onClick={() => setFeed(f.id)} className={cn("rounded-full px-3 py-1.5 text-xs font-medium transition-colors", feed === f.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                  {f.label}
                </button>
              ))}
            </div>
            <div className="flex gap-1 rounded-full bg-foreground/[0.03] p-1 ring-1 ring-hairline">
              {SORTS.map((s) => (
                <button key={s.id} type="button" onClick={() => setSort(s.id)} className={cn("rounded-full px-3 py-1.5 text-xs transition-colors", sort === s.id ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:text-foreground")}>
                  {s.label}
                </button>
              ))}
            </div>
            <div className="flex gap-1 rounded-full bg-foreground/[0.03] p-1 ring-1 ring-hairline">
              {(["all", "eligible", "new"] as Filter[]).map((f) => (
                <button key={f} type="button" onClick={() => setFilter(f)} className={cn("rounded-full px-3 py-1.5 text-xs capitalize transition-colors", filter === f ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:text-foreground")}>
                  {f === "new" ? "New pairs" : f}
                </button>
              ))}
            </div>
            <form
              className="ml-auto flex h-9 min-w-[220px] flex-1 items-center gap-2 rounded-full bg-foreground/[0.04] px-3 ring-1 ring-hairline focus-within:ring-foreground/30 md:flex-none"
              onSubmit={(e) => {
                e.preventDefault();
                setQuery(search.trim());
              }}
            >
              <MagnifyingGlass weight="light" className="size-4 text-muted-foreground" />
              <input value={search} onChange={(e) => { setSearch(e.target.value); if (!e.target.value) setQuery(""); }} placeholder="Search name, ticker, address" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-faint" />
            </form>
            <button type="button" aria-label="Refresh" onClick={() => void refetch()} className="grid size-9 place-items-center rounded-full bg-foreground/[0.04] ring-1 ring-hairline hover:bg-foreground/[0.08]">
              <ArrowClockwise weight="light" className={cn("size-4", isFetching && "animate-spin")} />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-sm">
            <thead>
              <tr className="border-b border-hairline text-left font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                <th className="w-12 px-4 py-3 font-normal">#</th>
                <th className="px-3 py-3 font-normal">Token</th>
                <th className="px-3 py-3 text-right font-normal">Price</th>
                <th className="px-3 py-3 text-right font-normal">Market cap</th>
                <th className="px-3 py-3 text-right font-normal">Liquidity</th>
                <th className="px-3 py-3 text-right font-normal">Volume 24h</th>
                <th className="px-3 py-3 text-right font-normal">5m</th>
                <th className="px-3 py-3 text-right font-normal">1h</th>
                <th className="px-3 py-3 text-right font-normal">Txns 1h</th>
                <th className="px-3 py-3 text-right font-normal">Age</th>
                <th className="px-4 py-3 font-normal">DEX</th>
              </tr>
            </thead>
            <tbody>
              {isPending &&
                Array.from({ length: 10 }, (_, i) => (
                  <tr key={i} className="border-b border-hairline/50">
                    <td colSpan={11} className="px-4 py-3"><div className="skeleton h-8 rounded-lg" /></td>
                  </tr>
                ))}
              {rows.map((t, i) => (
                <tr key={`${t.address}-${t.pairAddress}`} className="group border-b border-hairline/50 transition-colors last:border-0 hover:bg-foreground/[0.025]">
                  <td className="num px-4 py-3 font-mono text-xs text-faint">{i + 1}</td>
                  <td className="px-3 py-3">
                    <Link href={`/tokens/${t.chain}/${t.address}`} className="flex items-center gap-3">
                      <TokenAvatar token={t} />
                      <span className="min-w-0">
                        <span className="flex items-center gap-2">
                          <span className="font-medium underline-offset-4 group-hover:underline">{t.symbol}</span>
                          {t.quoteSymbol && <span className="text-xs text-faint">/ {t.quoteSymbol}</span>}
                          {t.eligible && <Tag tone="up">Eligible</Tag>}
                        </span>
                        <span className="block max-w-[220px] truncate text-xs text-muted-foreground">{t.name}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="num px-3 py-3 text-right font-mono">{fmtPrice(t.priceUsd)}</td>
                  <td className="num px-3 py-3 text-right font-mono">{fmtUsd(t.marketCapUsd)}</td>
                  <td className="num px-3 py-3 text-right font-mono">{fmtUsd(t.liquidityUsd)}</td>
                  <td className="num px-3 py-3 text-right font-mono">{fmtUsd(t.volume24hUsd)}</td>
                  <td className="px-3 py-3 text-right"><Pnl percent={t.priceChange5m} digits={1} showArrow={false} className="text-xs" /></td>
                  <td className="px-3 py-3 text-right"><Pnl percent={t.priceChange1h} digits={1} showArrow={false} className="text-xs" /></td>
                  <td className="num px-3 py-3 text-right font-mono text-xs">
                    <span className="text-up">{fmtInt(t.txns1h.buys)}</span>
                    <span className="text-faint"> / </span>
                    <span className="text-coral">{fmtInt(t.txns1h.sells)}</span>
                  </td>
                  <td className="num px-3 py-3 text-right font-mono text-xs text-muted-foreground">{now ? ageFrom(t.pairCreatedAt, now) : "—"}</td>
                  <td className="px-4 py-3 text-xs capitalize text-muted-foreground">{t.dexId?.replace(/[-_]/g, " ") ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!isPending && rows.length === 0 && <EmptyState title="No tokens in this view" description="Try another feed or filter. Free market feeds refresh every minute or two." />}
        </div>
      </Card>
    </div>
  );
}
