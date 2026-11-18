"use client";

import { ArrowLeft, ArrowSquareOut, ChatsCircle, Check, Copy, Swap } from "@phosphor-icons/react";
import { BRAND, CHAINS, isChainKey, type ChainKey } from "@elyagents/shared";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { AgentPortrait } from "@/components/agents/agent-bits";
import { PriceChart } from "@/components/charts/price-chart";
import { ChainBadge } from "@/components/common/chain";
import { Card, EmptyState, PillLink, Pnl, Tag } from "@/components/common/bits";
import { TokenAvatar } from "@/components/common/token-avatar";
import { Reveal } from "@/components/motion/reveal";
import { ageFrom, fmtInt, fmtPrice, fmtUsd, shortAddress } from "@/lib/format";
import { useOhlcv, useToken } from "@/lib/queries";
import { useNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";

const TFS = ["5m", "1h", "6h", "1d", "all"] as const;

/** Optional referral code appended to the GMGN link. */
const GMGN_REF = process.env.NEXT_PUBLIC_GMGN_REF;

function tradeLinks(chain: ChainKey, address: string) {
  return [
    { label: "GMGN", href: `https://gmgn.ai/${CHAINS[chain].dexscreener}/token/${address}${GMGN_REF ? `?ref=${GMGN_REF}` : ""}` },
    { label: "DexScreener", href: `https://dexscreener.com/${CHAINS[chain].dexscreener}/${address}` },
    { label: "GeckoTerminal", href: `https://www.geckoterminal.com/${CHAINS[chain].gecko}/tokens/${address}` },
  ];
}

export function TokenPage() {
  const params = useParams<{ chain: string; address: string }>();
  const chain: ChainKey = isChainKey(params.chain) ? params.chain : "robinhood";
  const address = decodeURIComponent(params.address);
  const [tf, setTf] = useState<(typeof TFS)[number]>("1d");
  const [pool, setPool] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { data, isPending } = useToken(chain, address);
  const t = data?.token;
  const candles = useOhlcv(chain, address, tf, pool ?? t?.pairAddress ?? null);
  const now = useNow(60_000);

  return (
    <div className="space-y-4 pt-4">
      <Link href="/tokens" className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft weight="light" className="size-4" /> Back to markets
      </Link>

      <Reveal>
        <Card coreClassName="flex flex-col gap-5 p-5 md:flex-row md:items-center md:p-6">
          {t ? <TokenAvatar token={t} size={64} /> : <span className="skeleton size-16 rounded-full" />}
          <div className="min-w-0 flex-1 space-y-2">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              {data?.launch ? `Launched on ${BRAND.name}` : "Market token"} · {CHAINS[chain].name}
            </p>
            <h1 className="flex flex-wrap items-baseline gap-3 text-3xl font-semibold tracking-tight md:text-4xl">
              {t?.name ?? data?.launch?.name ?? (isPending ? "Loading…" : "Unknown token")}
              <span className="font-mono text-base text-muted-foreground">${t?.symbol ?? data?.launch?.symbol ?? "—"}</span>
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              <ChainBadge chain={chain} />
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(address);
                  setCopied(true);
                  toast.success("Address copied");
                  setTimeout(() => setCopied(false), 1500);
                }}
                className="inline-flex h-6 items-center gap-1.5 rounded-full bg-foreground/[0.04] px-2.5 font-mono text-[11px] ring-1 ring-hairline hover:ring-hairline-strong"
              >
                {shortAddress(address, 8, 6)} {copied ? <Check weight="bold" className="size-3 text-up" /> : <Copy weight="light" className="size-3" />}
              </button>
              <a href={CHAINS[chain].explorerAddress(address)} target="_blank" rel="noreferrer" className="inline-flex h-6 items-center gap-1 rounded-full bg-foreground/[0.04] px-2.5 text-[11px] ring-1 ring-hairline hover:ring-hairline-strong">
                Explorer <ArrowSquareOut weight="light" className="size-3" />
              </a>
            </div>
          </div>
          <div className="text-left md:text-right">
            <p className="num text-3xl font-semibold tracking-tight">{fmtPrice(t?.priceUsd)}</p>
            <Pnl percent={t?.priceChange24h ?? null} className="text-sm" /> <span className="text-xs text-muted-foreground">24h</span>
          </div>
        </Card>
      </Reveal>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        {[
          ["Market cap", fmtUsd(t?.marketCapUsd)],
          ["Liquidity", fmtUsd(t?.liquidityUsd)],
          ["Volume 24h", fmtUsd(t?.volume24hUsd)],
          ["5m change", <Pnl key="5m" percent={t?.priceChange5m ?? null} />],
          ["1h change", <Pnl key="1h" percent={t?.priceChange1h ?? null} />],
          ["Pair age", now && t ? ageFrom(t.pairCreatedAt, now) : "—"],
        ].map(([label, value]) => (
          <Card key={String(label)} className="h-full" coreClassName="p-4 h-full flex flex-col justify-between">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
            <p className="num mt-2 text-xl font-semibold tracking-tight">{value}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-8" coreClassName="p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium">Price history</p>
              <p className="text-xs text-muted-foreground">{t?.dexId ? `${t.dexId} · ` : ""}{t?.quoteSymbol ? `${t.symbol}/${t.quoteSymbol}` : "USD"}</p>
            </div>
            <div className="flex gap-1 rounded-full bg-foreground/[0.03] p-1 ring-1 ring-hairline">
              {TFS.map((x) => (
                <button key={x} type="button" onClick={() => setTf(x)} className={cn("rounded-full px-3 py-1 font-mono text-xs", tf === x ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:text-foreground")}>
                  {x}
                </button>
              ))}
            </div>
          </div>
          {candles.data?.candles.length ? (
            <PriceChart candles={candles.data.candles} />
          ) : (
            <div className="grid h-[380px] place-items-center rounded-2xl border border-dashed border-hairline text-sm text-muted-foreground">
              {candles.isPending ? "Loading candles…" : "No chart data for this pool yet."}
            </div>
          )}
        </Card>

        <div className="space-y-4 lg:col-span-4">
          <Card coreClassName="space-y-4 p-5">
            <p className="flex items-center gap-2 font-medium"><Swap weight="light" className="size-4 text-foreground" /> Trade {t?.symbol ?? "token"}</p>
            <p className="text-sm text-muted-foreground">Swaps run in your own wallet on {CHAINS[chain].name}. Your personal agent can trade it too once its vault is funded.</p>
            <div className="grid gap-2">
              {tradeLinks(chain, address).map((l) => (
                <a key={l.label} href={l.href} target="_blank" rel="noreferrer" className="group flex items-center justify-between rounded-2xl bg-foreground/[0.03] px-4 py-3 text-sm ring-1 ring-hairline transition-colors hover:bg-foreground/[0.06]">
                  {l.label}
                  <ArrowSquareOut weight="light" className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </a>
              ))}
            </div>
            <PillLink href={`/floor?chain=${chain}&token=${address}`} variant="dark" className="w-full justify-between" icon={<ChatsCircle weight="bold" className="size-3.5" />}>
              Ask the crew about it
            </PillLink>
          </Card>

          <Card coreClassName="p-5">
            <p className="mb-3 font-medium">Activity 1h</p>
            <div className="flex h-3 gap-[2px] overflow-hidden rounded-full">
              <span className="bg-up" style={{ flex: t?.txns1h.buys || 1 }} />
              <span className="bg-coral" style={{ flex: t?.txns1h.sells || 1 }} />
            </div>
            <div className="mt-2 flex justify-between font-mono text-xs">
              <span className="text-up">{fmtInt(t?.txns1h.buys)} buys</span>
              <span className="text-coral">{fmtInt(t?.txns1h.sells)} sells</span>
            </div>
          </Card>

          <Card coreClassName="p-5">
            <p className="mb-3 font-medium">Agents holding</p>
            {data?.agentHolders.length ? (
              <ul className="space-y-2">
                {data.agentHolders.map((h) => (
                  <li key={h.id}>
                    <Link href={`/agent/${h.id}`} className="flex items-center gap-3 rounded-xl p-1.5 hover:bg-foreground/[0.03]">
                      <AgentPortrait characterId={h.characterId} size={32} rounded="rounded-lg" />
                      <span className="flex-1 text-sm">{h.name}</span>
                      <Pnl percent={h.costValue ? ((h.lastValue - h.costValue) / h.costValue) * 100 : 0} className="text-xs" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No agent holds this token right now.</p>
            )}
          </Card>
        </div>
      </div>

      {data?.launch && (
        <Card coreClassName="grid gap-6 p-6 md:grid-cols-2">
          <div className="space-y-2">
            <Tag tone="ink">Created on {BRAND.name}</Tag>
            <p className="text-lg font-medium">About {data.launch.name}</p>
            <p className="text-sm leading-relaxed text-muted-foreground">{data.launch.description || "No description."}</p>
          </div>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <dt className="text-muted-foreground">Paired with</dt><dd>{data.launch.pairSymbol}</dd>
            <dt className="text-muted-foreground">Creator</dt><dd className="font-mono">{shortAddress(data.launch.creatorWallet)}</dd>
            <dt className="text-muted-foreground">Launched</dt><dd>{new Date(data.launch.launchedAt).toLocaleString()}</dd>
            {data.launch.txHash && (<><dt className="text-muted-foreground">Launch tx</dt><dd><a className="font-medium text-foreground underline-offset-4 hover:underline" href={CHAINS[data.launch.chain].explorerTx(data.launch.txHash)} target="_blank" rel="noreferrer">View ↗</a></dd></>)}
          </dl>
        </Card>
      )}

      <Card>
        <div className="border-b border-hairline p-5">
          <p className="font-medium">Pools</p>
          <p className="text-xs text-muted-foreground">Pick a pool to chart it</p>
        </div>
        {data?.pools.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-hairline text-left font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                  <th className="px-5 py-3 font-normal">Pair</th>
                  <th className="px-3 py-3 font-normal">DEX</th>
                  <th className="px-3 py-3 text-right font-normal">Liquidity</th>
                  <th className="px-3 py-3 text-right font-normal">Volume 24h</th>
                  <th className="px-5 py-3 text-right font-normal">24h</th>
                </tr>
              </thead>
              <tbody>
                {data.pools.map((p) => (
                  <tr key={p.pairAddress} onClick={() => setPool(p.pairAddress)} className={cn("cursor-pointer border-b border-hairline/50 last:border-0 hover:bg-foreground/[0.02]", (pool ?? t?.pairAddress) === p.pairAddress && "bg-foreground/[0.05]")}>
                    <td className="px-5 py-3 font-medium">{p.symbol} / {p.quoteSymbol ?? "?"}</td>
                    <td className="px-3 py-3 capitalize text-muted-foreground">{p.dexId?.replace(/[-_]/g, " ")}</td>
                    <td className="num px-3 py-3 text-right font-mono">{fmtUsd(p.liquidityUsd)}</td>
                    <td className="num px-3 py-3 text-right font-mono">{fmtUsd(p.volume24hUsd)}</td>
                    <td className="px-5 py-3 text-right"><Pnl percent={p.priceChange24h} digits={1} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title={isPending ? "Loading pools…" : "No pools found"} />
        )}
      </Card>
    </div>
  );
}
