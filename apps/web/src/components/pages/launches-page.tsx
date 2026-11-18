"use client";

import { Coins, MagnifyingGlass, Rocket } from "@phosphor-icons/react";
import { CHAINS } from "@elyagents/shared";
import Link from "next/link";
import { useMemo, useState } from "react";
import { AgentPortrait } from "@/components/agents/agent-bits";
import { ChainBadge } from "@/components/common/chain";
import { Card, EmptyState, PageHeader, PillLink, Pnl, Tag } from "@/components/common/bits";
import { fmtUsd, shortAddress, timeAgo } from "@/lib/format";
import { useLaunches } from "@/lib/queries";
import { useNow } from "@/lib/use-now";

export function LaunchesPage() {
  const { data, isPending } = useLaunches();
  const [q, setQ] = useState("");
  const now = useNow(60_000);
  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (data ?? []).filter(
      (l) => !term || [l.name, l.symbol, l.tokenAddress, l.agentName ?? "", CHAINS[l.chain].name].some((v) => v.toLowerCase().includes(term)),
    );
  }, [data, q]);

  return (
    <div>
      <PageHeader
        eyebrow="Launched on pons"
        title="Launches"
        description="Tokens launched through the launch studio. Open a page to trade it or meet its agent."
        action={<PillLink href="/launch" size="lg" icon={<Rocket weight="bold" className="size-4" />}>Launch a token</PillLink>}
      />
      <Card>
        <div className="flex items-center gap-3 border-b border-hairline p-4">
          <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full bg-foreground/[0.04] px-4 ring-1 ring-hairline focus-within:ring-primary/40">
            <MagnifyingGlass weight="light" className="size-4 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, ticker, agent, address" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-faint" />
          </label>
          <span className="shrink-0 whitespace-nowrap font-mono text-xs text-muted-foreground">{rows.length} tokens</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-hairline text-left font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                <th className="px-5 py-3 font-normal">Token</th>
                <th className="px-3 py-3 font-normal">Type</th>
                <th className="px-3 py-3 font-normal">Chain</th>
                <th className="px-3 py-3 text-right font-normal">Market cap</th>
                <th className="px-3 py-3 text-right font-normal">24h volume</th>
                <th className="px-3 py-3 text-right font-normal">24h</th>
                <th className="px-3 py-3 font-normal">Agent</th>
                <th className="px-5 py-3 font-normal">Launched</th>
              </tr>
            </thead>
            <tbody>
              {isPending && Array.from({ length: 6 }, (_, i) => <tr key={i}><td colSpan={8} className="px-5 py-3"><div className="skeleton h-10 rounded-lg" /></td></tr>)}
              {rows.map((l) => (
                <tr key={l.id} className="border-b border-hairline/50 last:border-0 hover:bg-foreground/[0.02]">
                  <td className="px-5 py-3">
                    <Link href={`/tokens/${l.chain}/${l.tokenAddress}`} className="flex items-center gap-3">
                      <span className="grid size-10 place-items-center overflow-hidden rounded-xl bg-foreground/[0.05] ring-1 ring-hairline">
                        {l.imageUri ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={l.imageUri} alt="" className="size-full object-cover" />
                        ) : (
                          <Coins weight="light" className="size-4 text-muted-foreground" />
                        )}
                      </span>
                      <span>
                        <span className="block font-medium">{l.name} {l.pinned && <Tag tone="ink">Pinned</Tag>}</span>
                        <span className="font-mono text-[11px] text-muted-foreground">${l.symbol} · {shortAddress(l.tokenAddress)}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="px-3 py-3"><Tag tone={l.withAgent ? "violet" : "default"}>{l.withAgent ? "Token + agent" : "Token only"}</Tag></td>
                  <td className="px-3 py-3"><ChainBadge chain={l.chain} /></td>
                  <td className="num px-3 py-3 text-right font-mono">{fmtUsd(l.marketCapUsd)}</td>
                  <td className="num px-3 py-3 text-right font-mono">{fmtUsd(l.volume24hUsd)}</td>
                  <td className="px-3 py-3 text-right"><Pnl percent={l.change24h} digits={1} /></td>
                  <td className="px-3 py-3">
                    {l.agentId ? (
                      <Link href={`/agent/${l.agentId}`} className="inline-flex items-center gap-2 underline-offset-4 hover:underline">
                        <AgentPortrait characterId={l.characterId ?? "charon"} size={26} rounded="rounded-lg" /> {l.agentName}
                      </Link>
                    ) : (
                      <span className="text-faint">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{now ? timeAgo(l.launchedAt, now) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!isPending && rows.length === 0 && (
            <EmptyState
              icon={<Rocket weight="light" className="size-5" />}
              title={q ? "No launches match" : "No launches yet"}
              description="Launch a token on pons and it will appear here with live market data."
              action={!q && <PillLink href="/launch">Open the launch studio</PillLink>}
            />
          )}
        </div>
      </Card>
    </div>
  );
}
