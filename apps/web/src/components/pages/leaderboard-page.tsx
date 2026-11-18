"use client";

import { Crown } from "@phosphor-icons/react";
import { BRAND, characterFor } from "@elyagents/shared";
import { motion } from "motion/react";
import Link from "next/link";
import { useState } from "react";
import { AgentPortrait, AgentSprite, tileColor } from "@/components/agents/agent-bits";
import { Sparkline } from "@/components/charts/sparkline";
import { Card, PageHeader, PillLink, Pnl, StatusDot, Tag } from "@/components/common/bits";
import { staggerChild, staggerParent } from "@/components/motion/reveal";
import { fmtNum } from "@/lib/format";
import { useLeaderboard } from "@/lib/queries";
import { cn } from "@/lib/utils";

export function LeaderboardPage() {
  const [family, setFamily] = useState<string | undefined>();
  const { data, isPending } = useLeaderboard(family);
  const rows = data?.rows ?? [];
  const podium = rows.slice(0, 3);
  const order = [1, 0, 2];

  return (
    <div>
      <PageHeader
        eyebrow="Showcase P&L"
        title="Rankings"
        description={`Ranked by showcase P&L in ${BRAND.creditName}. Simulated on live quotes and measured route costs, not on-chain returns.`}
        action={<PillLink href="/agents" size="lg">Meet the agents</PillLink>}
      />

      {podium.length === 3 && (
        <motion.div variants={staggerParent} initial="hidden" animate="show" className="mb-6 grid items-end gap-4 md:grid-cols-3">
          {order.map((idx) => {
            const row = podium[idx];
            const c = characterFor(row.agent.characterId);
            const first = idx === 0;
            return (
              <motion.div key={row.agent.id} variants={staggerChild} className={cn(first ? "md:-translate-y-4" : "")}>
                <Link href={`/agent/${row.agent.id}`} className="group block">
                  <Card coreClassName="relative overflow-hidden p-6 text-center">
                    <div className="absolute inset-x-0 top-0 h-1/2" style={{ background: `linear-gradient(to bottom, ${tileColor(c.color, first ? 34 : 22)}, transparent)` }} />
                    <div className="relative">
                      <span className={cn("mx-auto mb-2 inline-flex items-center gap-1 rounded-full px-3 py-1 font-mono text-[11px] ring-1", first ? "bg-primary text-primary-foreground ring-primary" : "bg-foreground/[0.04] text-muted-foreground ring-hairline")}>
                        {first && <Crown weight="fill" className="size-3.5" />} #{row.rank}
                      </span>
                      <AgentSprite characterId={row.agent.characterId} className={cn("mx-auto transition-transform duration-500 ease-[var(--ease-spring)] group-hover:-translate-y-1", first ? "size-[200px]" : "size-[150px]")} />
                      <p className="mt-2 text-xl font-semibold tracking-tight">{row.agent.name}</p>
                      <p className="text-xs text-muted-foreground">{row.agent.strategyName}</p>
                      <Pnl percent={row.agent.pnlPercent} className="mt-3 text-2xl font-semibold" />
                      <Sparkline values={row.sparkline} className="mx-auto mt-3 h-10 w-40" />
                    </div>
                  </Card>
                </Link>
              </motion.div>
            );
          })}
        </motion.div>
      )}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline p-5">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{BRAND.name} / performance</p>
            <p className="text-lg font-medium">Full rankings</p>
          </div>
          <div className="flex gap-1 rounded-full bg-foreground/[0.03] p-1 ring-1 ring-hairline">
            {[undefined, ...(data?.families ?? ["Steady", "Rush", "Wild"])].map((f) => (
              <button key={f ?? "all"} type="button" onClick={() => setFamily(f)} className={cn("rounded-full px-3 py-1.5 text-xs", family === f ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:text-foreground")}>
                {f ?? "All"}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-hairline text-left font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                <th className="w-16 px-5 py-3 font-normal">Rank</th>
                <th className="px-3 py-3 font-normal">Agent</th>
                <th className="px-3 py-3 font-normal">24h trend</th>
                <th className="px-3 py-3 text-right font-normal">Value</th>
                <th className="px-3 py-3 text-right font-normal">P&L</th>
                <th className="px-3 py-3 text-right font-normal">Win / loss</th>
                <th className="px-5 py-3 text-right font-normal">Trades</th>
              </tr>
            </thead>
            <tbody>
              {isPending && Array.from({ length: 8 }, (_, i) => <tr key={i}><td colSpan={7} className="px-5 py-3"><div className="skeleton h-9 rounded-lg" /></td></tr>)}
              {rows.map((row) => (
                <tr key={row.agent.id} className="border-b border-hairline/50 transition-colors last:border-0 hover:bg-foreground/[0.02]">
                  <td className={cn("num px-5 py-3 font-mono", row.rank <= 3 ? "font-bold text-foreground" : "text-faint")}>{String(row.rank).padStart(2, "0")}</td>
                  <td className="px-3 py-3">
                    <Link href={`/agent/${row.agent.id}`} className="flex items-center gap-3">
                      <AgentPortrait characterId={row.agent.characterId} size={36} rounded="rounded-xl" />
                      <span>
                        <span className="flex items-center gap-2 font-medium">{row.agent.name}<StatusDot active={row.agent.status === "ACTIVE"} /></span>
                        <span className="text-xs text-muted-foreground">{row.agent.kind === "PLATFORM" ? row.agent.strategyName : `Creator · ${row.agent.strategyName}`}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="px-3 py-3"><Sparkline values={row.sparkline} className="h-8 w-28" /></td>
                  <td className="num px-3 py-3 text-right font-mono">{fmtNum(row.agent.portfolioValue, 3)}</td>
                  <td className="px-3 py-3 text-right"><Pnl percent={row.agent.pnlPercent} /></td>
                  <td className="num px-3 py-3 text-right font-mono text-xs"><span className="text-up">{row.agent.wins}</span> / <span className="text-coral">{row.agent.losses}</span></td>
                  <td className="num px-5 py-3 text-right font-mono">{row.agent.trades}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-hairline px-5 py-3 text-[11px] text-faint"><Tag className="mr-2">Note</Tag>Simulated P&L. Not on-chain.</p>
      </Card>
    </div>
  );
}
