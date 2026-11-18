"use client";

import { ArrowClockwise, ArrowLeft, ArrowUpRight, Coins, Robot, ShieldCheck } from "@phosphor-icons/react";
import { BRAND, CHAINS, characterFor, type AgentDetail, type ChainKey } from "@elyagents/shared";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { ActionTag, AgentSprite, tileColor } from "@/components/agents/agent-bits";
import { ActivityBars } from "@/components/charts/activity-bars";
import { EquityChart } from "@/components/charts/equity-chart";
import { ChainBadge, ChainIcon } from "@/components/common/chain";
import { Card, EmptyState, PillLink, Pnl, StatusDot, Tag } from "@/components/common/bits";
import { CountUp } from "@/components/motion/count-up";
import { Reveal } from "@/components/motion/reveal";
import { fmtNum, fmtPrice, fmtTime, shortAddress, timeAgo } from "@/lib/format";
import { qk, useAgent, useStats } from "@/lib/queries";
import { useSocketEvent } from "@/lib/socket";
import { useNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";

type Tab = "decisions" | "positions" | "trades";

export function AgentDetailPage() {
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(params.id);
  const { data, isPending, isError, refetch, isFetching } = useAgent(id);
  const qc = useQueryClient();
  const now = useNow(30_000);
  const { data: stats } = useStats();

  useSocketEvent(
    "feed:decision",
    (d) => {
      if (d.agentId !== id) return;
      qc.setQueryData<AgentDetail>(qk.agent(id), (prev) => (prev && !prev.decisions.some((x) => x.id === d.id) ? { ...prev, decisions: [d, ...prev.decisions] } : prev));
    },
    `agent:${id}`,
  );

  if (isError) {
    return (
      <Card className="mt-10">
        <EmptyState icon={<Robot weight="light" className="size-5" />} title="Agent not found" description="It may have been removed, or the link is mistyped." action={<PillLink href="/agents">All agents</PillLink>} />
      </Card>
    );
  }
  if (isPending || !data) {
    return (
      <div className="mt-10 grid gap-4 lg:grid-cols-12">
        <div className="skeleton h-40 rounded-[1.75rem] lg:col-span-12" />
        <div className="skeleton h-96 rounded-[1.75rem] lg:col-span-3" />
        <div className="skeleton h-96 rounded-[1.75rem] lg:col-span-6" />
        <div className="skeleton h-96 rounded-[1.75rem] lg:col-span-3" />
      </div>
    );
  }

  const { agent } = data;
  const c = characterFor(agent.characterId);
  const unit = agent.mode === "PAPER" ? BRAND.creditSymbol : "USD";
  const chainsTraded = [...new Set(data.trades.map((t) => t.chain))] as ChainKey[];

  return (
    <div className="space-y-4 pt-4">
      <div className="flex items-center justify-between gap-3">
        <Link href="/agents" className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft weight="light" className="size-4" /> All agents
        </Link>
        <div className="flex items-center gap-2">
          <Link href="/profile" className="text-sm text-muted-foreground transition-colors hover:text-foreground">My vault →</Link>
          <button type="button" onClick={() => void refetch()} className="inline-flex h-9 items-center gap-2 rounded-full bg-foreground/[0.04] px-3 text-xs ring-1 ring-hairline transition-colors hover:bg-foreground/[0.08]">
            <ArrowClockwise weight="light" className={cn("size-3.5", isFetching && "animate-spin")} /> Refresh
          </button>
        </div>
      </div>

      {/* Header bar (Ref 2 trip bar) */}
      <Reveal>
        <Card coreClassName="relative overflow-hidden">
          <div className="relative flex flex-col gap-6 p-5 md:flex-row md:items-center md:p-6">
            <div className="relative grid size-[150px] shrink-0 place-items-end overflow-hidden rounded-3xl ring-1 ring-foreground/10" style={{ background: tileColor(c.color) }}>
              <div className="hairline-grid absolute inset-0 opacity-70" />
              <AgentSprite characterId={agent.characterId} priority className="relative size-[150px]" />
            </div>
            <div className="min-w-0 flex-1 space-y-3">
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                {agent.kind === "PLATFORM" ? "Platform agent · no token needed" : `Creator agent · ${agent.owner ?? "launch"}`}
              </p>
              <div className="flex flex-wrap items-baseline gap-3">
                <h1 className="text-4xl font-semibold tracking-[-0.04em] md:text-5xl">{agent.name}</h1>
                {agent.tokenAddress && <span className="font-mono text-sm text-muted-foreground">${agent.symbol}</span>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Tag tone={agent.status === "ACTIVE" ? "up" : "default"}>
                  <StatusDot active={agent.status === "ACTIVE"} className="mr-1" /> {agent.status}
                </Tag>
                <Tag tone="violet">{agent.mode === "PAPER" ? "Showcase" : "Live vault"}</Tag>
                <Tag>{agent.strategyName}</Tag>
                <Tag>{c.family} family</Tag>
              </div>
              <p className="text-xs text-muted-foreground">
                Created {new Date(agent.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · last decision{" "}
                {now ? timeAgo(agent.lastDecisionAt, now) : "—"}
              </p>
            </div>
            <div className="flex flex-col items-start gap-3 md:items-end">
              <div className="flex flex-wrap gap-1.5">
                {(chainsTraded.length ? chainsTraded : (Object.keys(CHAINS) as ChainKey[])).map((ch) => (
                  <ChainBadge key={ch} chain={ch} short />
                ))}
              </div>
              <PillLink href={`/create-agent?strategy=${agent.strategyId === "custom" ? c.strategyId : agent.strategyId}&character=${c.id}`}>
                Trade with {agent.name}
              </PillLink>
            </div>
          </div>
        </Card>
      </Reveal>

      <div className="grid gap-4 lg:grid-cols-12">
        {/* Left: metrics (Ref 2 left column) */}
        <Reveal className="lg:col-span-3" delay={0.05}>
          <Metrics data={data} />
        </Reveal>

        {/* Center */}
        <div className="space-y-4 lg:col-span-6">
          <Reveal delay={0.1} className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {[
              { label: "Balance", node: <CountUp value={agent.cashBalance} format={(v) => fmtNum(v, 4)} />, sub: "Free balance" },
              { label: "Portfolio", node: <CountUp value={agent.portfolioValue} format={(v) => fmtNum(v, 4)} />, sub: `${agent.openPositions} open positions` },
              { label: "Strategy P&L", node: <Pnl percent={agent.pnlPercent} />, sub: `${agent.pnl >= 0 ? "+" : "−"}${Math.abs(agent.pnl).toFixed(4)} vs start` },
              { label: "Trades", node: <CountUp value={agent.trades} />, sub: `${agent.wins} wins · ${agent.losses} losses` },
            ].map((k) => (
              <Card key={k.label} coreClassName="p-4">
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{k.label}</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight">{k.node}</p>
                <p className="mt-1 font-mono text-[10px] text-faint">{k.sub}</p>
              </Card>
            ))}
          </Reveal>
          <Reveal delay={0.15}>
            <Card coreClassName="p-5 md:p-6">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="font-medium">Portfolio value</p>
                  <p className="text-xs text-muted-foreground">
                    {unit} · dashed line = starting balance {fmtNum(agent.startingBalance, 2)}
                  </p>
                </div>
                <Tag tone="violet">Showcase record</Tag>
              </div>
              <EquityChart points={data.equity} baseline={agent.startingBalance} unit={unit} />
            </Card>
          </Reveal>
        </div>

        {/* Right */}
        <div className="space-y-4 lg:col-span-3">
          <Reveal delay={0.1}>
            <Card coreClassName="space-y-4 p-5">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Trade with {agent.name}</p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Create your own agent with this playbook. Your vault, balance and trades stay separate from everyone else&apos;s.
              </p>
              <PillLink href={`/create-agent?strategy=${agent.strategyId === "custom" ? c.strategyId : agent.strategyId}&character=${c.id}`} className="w-full justify-between">
                Use this playbook
              </PillLink>
              <p className="flex items-start gap-2 text-[11px] text-faint">
                <ShieldCheck weight="light" className="mt-0.5 size-3.5 shrink-0" /> Connect a wallet to create and manage your account.
              </p>
            </Card>
          </Reveal>
          <Reveal delay={0.15}>
            <Card coreClassName="p-5">
              <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Strategy · {agent.strategyName}</p>
              <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
                {data.agent.instructions ? `“${data.agent.instructions}”` : `${stats?.aiEnabled ? "The AI reviews each screened entry against the playbook." : "The rules engine ranks each screened entry against the playbook."} Position limits and exits follow these rules.`}
              </p>
              <dl className="divide-y divide-hairline text-sm">
                {[
                  ["Per trade", `${agent.strategyConfig.sizePercent}%`],
                  ["Take profit / stop", `+${agent.strategyConfig.takeProfitPercent}% / −${agent.strategyConfig.stopLossPercent}%`],
                  ["Trailing stop", agent.strategyConfig.trailingStopPercent ? `${agent.strategyConfig.trailingStopPercent}%` : "Off"],
                  ["Max hold", agent.strategyConfig.maxHoldMinutes ? `${agent.strategyConfig.maxHoldMinutes} min` : "Unlimited"],
                  ["Max positions", agent.strategyConfig.maxPositions],
                  ["Cooldown", `${agent.strategyConfig.cooldownMinutes} min`],
                ].map(([k, v]) => (
                  <div key={String(k)} className="flex justify-between py-2">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="num font-mono">{v}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 text-[11px] text-faint">Showcase P&L is simulated. Not live returns.</p>
            </Card>
          </Reveal>
          {data.launch && (
            <Reveal delay={0.2}>
              <Card coreClassName="space-y-3 p-5">
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Associated coin</p>
                <p className="flex items-center gap-2 font-medium">
                  <Coins weight="light" className="size-4 text-foreground" /> ${data.launch.symbol} · {CHAINS[data.launch.chain].name}
                </p>
                <Link href={`/tokens/${data.launch.chain}/${data.launch.tokenAddress}`} className="inline-flex items-center gap-1 text-sm font-medium text-foreground underline-offset-4 hover:underline">
                  View token details <ArrowUpRight weight="bold" className="size-3" />
                </Link>
                <p className="font-mono text-[11px] text-faint">{shortAddress(data.launch.tokenAddress)}</p>
              </Card>
            </Reveal>
          )}
        </div>
      </div>

      <Reveal>
        <ActivityLog data={data} unit={unit} now={now} />
      </Reveal>
    </div>
  );
}

function Metrics({ data }: { data: AgentDetail }) {
  const counts = { BUY: 0, SELL: 0, HOLD: 0 };
  for (const d of data.decisions) counts[d.action]++;
  const exits = useMemo(() => {
    const groups: Record<string, number> = { "Take profit": 0, "Stop loss": 0, "Trailing stop": 0, "Max hold": 0 };
    for (const p of data.closedPositions) {
      const reason = p.exitReason ?? "";
      const key = Object.keys(groups).find((g) => reason.startsWith(g));
      if (key) groups[key]++;
    }
    return groups;
  }, [data.closedPositions]);
  const maxExit = Math.max(1, ...Object.values(exits));
  const total = counts.BUY + counts.SELL + counts.HOLD || 1;

  return (
    <Card coreClassName="space-y-6 p-5">
      <div className="flex items-center justify-between">
        <p className="font-medium">Metrics</p>
        <span className="font-mono text-[10px] text-faint">last {data.decisions.length} decisions</span>
      </div>
      <div>
        <p className="mb-3 text-xs text-muted-foreground">Decisions per 15 min</p>
        <ActivityBars decisions={data.decisions} buckets={16} minutesPerBucket={15} />
      </div>
      <div>
        <p className="mb-3 text-xs text-muted-foreground">Decision mix</p>
        <div className="flex h-2.5 gap-[2px] overflow-hidden rounded-full">
          {counts.BUY > 0 && <span className="bg-up" style={{ width: `${(counts.BUY / total) * 100}%` }} />}
          {counts.SELL > 0 && <span className="bg-coral" style={{ width: `${(counts.SELL / total) * 100}%` }} />}
          {counts.HOLD > 0 && <span className="bg-foreground/20" style={{ width: `${(counts.HOLD / total) * 100}%` }} />}
        </div>
        <div className="mt-2 flex justify-between font-mono text-[11px] text-muted-foreground">
          <span>{counts.BUY} buy</span>
          <span>{counts.SELL} sell</span>
          <span>{counts.HOLD} hold</span>
        </div>
      </div>
      <div>
        <p className="mb-3 text-xs text-muted-foreground">Exit reasons</p>
        <div className="space-y-2.5">
          {Object.entries(exits).map(([k, v]) => (
            <div key={k}>
              <div className="mb-1 flex justify-between text-xs">
                <span className="text-foreground/80">{k}</span>
                <span className="num font-mono text-muted-foreground">{v}</span>
              </div>
              <div className="h-1.5 rounded-full bg-foreground/[0.05]">
                <motion.div
                  initial={{ width: 0 }}
                  whileInView={{ width: `${(v / maxExit) * 100}%` }}
                  viewport={{ once: true }}
                  transition={{ duration: 1, ease: [0.32, 0.72, 0, 1] }}
                  className={cn("h-full rounded-full", k === "Take profit" ? "bg-up" : k === "Stop loss" ? "bg-coral" : "bg-sky")}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function ActivityLog({ data, unit, now }: { data: AgentDetail; unit: string; now: number | null }) {
  const [tab, setTab] = useState<Tab>("decisions");
  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "decisions", label: "Decisions", count: data.decisions.length },
    { id: "positions", label: "Positions", count: data.positions.length },
    { id: "trades", label: "Trade history", count: data.trades.length },
  ];
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline p-5">
        <div>
          <p className="font-medium">Activity</p>
          <p className="text-xs text-muted-foreground">Decisions · positions · trades</p>
        </div>
        <div className="flex gap-1 rounded-full bg-foreground/[0.03] p-1 ring-1 ring-hairline">
          {tabs.map((t) => (
            <button key={t.id} type="button" onClick={() => setTab(t.id)} className={cn("relative rounded-full px-3.5 py-1.5 text-xs font-medium", tab === t.id ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
              {tab === t.id && <motion.span layoutId="agent-tab" className="absolute inset-0 rounded-full bg-foreground/[0.09]" />}
              <span className="relative">{t.label} <span className="ml-1 font-mono text-[10px] text-faint">{t.count}</span></span>
            </button>
          ))}
        </div>
      </div>

      <div className="max-h-[640px] overflow-auto">
        {tab === "decisions" && (
          <ol className="relative px-5 py-4">
            <span className="absolute bottom-6 left-[29px] top-6 w-px bg-hairline" />
            {data.decisions.map((d) => {
              const t = fmtTime(d.createdAt);
              return (
                <li key={d.id} className="relative flex gap-4 py-3">
                  <span className={cn("relative z-[1] mt-1 grid size-5 shrink-0 place-items-center rounded-full ring-4 ring-surface-1", d.action === "BUY" ? "bg-up" : d.action === "SELL" ? "bg-coral" : "bg-surface-3")}>
                    <span className="size-1.5 rounded-full bg-black/60" />
                  </span>
                  <div className="grid min-w-0 flex-1 gap-3 md:grid-cols-[110px_1fr_220px]">
                    <div className="font-mono text-[11px] text-muted-foreground">
                      <p>{t.date}</p>
                      <p>{t.time}</p>
                    </div>
                    <div className="min-w-0">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <ActionTag action={d.action} />
                        {d.symbol && <span className="font-medium">{d.symbol}</span>}
                        {d.chain && <ChainBadge chain={d.chain} short />}
                        {d.source === "ai" && <Tag tone="violet">AI</Tag>}
                      </div>
                      <p className="text-[13px] leading-relaxed text-foreground/85">{d.reason}</p>
                    </div>
                    <p className="rounded-xl bg-foreground/[0.025] px-3 py-2 text-xs text-muted-foreground ring-1 ring-hairline md:self-start">{d.outcome}</p>
                  </div>
                </li>
              );
            })}
            {data.decisions.length === 0 && <EmptyState title="No decisions yet" description="The first decision round lands within a minute." />}
          </ol>
        )}

        {tab === "positions" && (
          <PositionsTable data={data} unit={unit} now={now} />
        )}

        {tab === "trades" && (
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-hairline text-left font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                <th className="px-5 py-3 font-normal">Time</th>
                <th className="px-3 py-3 font-normal">Side</th>
                <th className="px-3 py-3 font-normal">Token</th>
                <th className="px-3 py-3 text-right font-normal">Price</th>
                <th className="px-3 py-3 text-right font-normal">Value ({unit})</th>
                <th className="px-3 py-3 text-right font-normal">P&L</th>
                <th className="px-5 py-3 font-normal">Reason</th>
              </tr>
            </thead>
            <tbody>
              {data.trades.map((t) => (
                <tr key={t.id} className="border-b border-hairline/60 last:border-0 hover:bg-foreground/[0.02]">
                  <td className="whitespace-nowrap px-5 py-3 font-mono text-xs text-muted-foreground">{fmtTime(t.createdAt).date} {fmtTime(t.createdAt).time}</td>
                  <td className="px-3 py-3"><ActionTag action={t.side} /></td>
                  <td className="px-3 py-3">
                    <Link href={`/tokens/${t.chain}/${t.tokenAddress}`} className="inline-flex items-center gap-2 underline-offset-4 hover:underline">
                      <ChainIcon chain={t.chain} /> {t.symbol}
                    </Link>
                  </td>
                  <td className="num px-3 py-3 text-right font-mono text-xs">{fmtPrice(t.priceUsd)}</td>
                  <td className="num px-3 py-3 text-right font-mono">{t.value.toFixed(4)}</td>
                  <td className="px-3 py-3 text-right">{t.pnl !== null ? <Pnl value={t.pnl} digits={4} /> : <span className="text-faint">—</span>}</td>
                  <td className="max-w-[320px] truncate px-5 py-3 text-xs text-muted-foreground" title={t.reason}>{t.reason}</td>
                </tr>
              ))}
              {data.trades.length === 0 && (
                <tr><td colSpan={7}><EmptyState title="No trades yet" /></td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </Card>
  );
}

function PositionsTable({ data, unit, now }: { data: AgentDetail; unit: string; now: number | null }) {
  const rows = [...data.positions, ...data.closedPositions.slice(0, 20)];
  return (
    <table className="w-full min-w-[820px] text-sm">
      <thead>
        <tr className="border-b border-hairline text-left font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          <th className="px-5 py-3 font-normal">Token</th>
          <th className="px-3 py-3 font-normal">Status</th>
          <th className="px-3 py-3 text-right font-normal">Cost ({unit})</th>
          <th className="px-3 py-3 text-right font-normal">Value</th>
          <th className="px-3 py-3 text-right font-normal">P&L</th>
          <th className="px-3 py-3 text-right font-normal">Entry → Last</th>
          <th className="px-5 py-3 font-normal">Opened</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((p) => {
          const pnl = p.status === "OPEN" ? p.lastValue - p.costValue : (p.realizedPnl ?? 0);
          const pct = p.costValue ? (pnl / p.costValue) * 100 : 0;
          return (
            <tr key={p.id} className="border-b border-hairline/60 last:border-0 hover:bg-foreground/[0.02]">
              <td className="px-5 py-3">
                <Link href={`/tokens/${p.chain}/${p.tokenAddress}`} className="inline-flex items-center gap-2 underline-offset-4 hover:underline">
                  <ChainIcon chain={p.chain} /> <span className="font-medium">{p.symbol}</span>
                </Link>
              </td>
              <td className="px-3 py-3">
                {p.status === "OPEN" ? <Tag tone="up">Open</Tag> : <span className="text-xs text-muted-foreground">{p.exitReason}</span>}
              </td>
              <td className="num px-3 py-3 text-right font-mono">{p.costValue.toFixed(4)}</td>
              <td className="num px-3 py-3 text-right font-mono">{p.lastValue.toFixed(4)}</td>
              <td className="px-3 py-3 text-right"><Pnl percent={pct} /></td>
              <td className="num px-3 py-3 text-right font-mono text-xs text-muted-foreground">{fmtPrice(p.entryPriceUsd)} → {fmtPrice(p.lastPriceUsd)}</td>
              <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{now ? timeAgo(p.openedAt, now) : ""}</td>
            </tr>
          );
        })}
        {rows.length === 0 && (
          <tr><td colSpan={7}><EmptyState title="No positions yet" /></td></tr>
        )}
      </tbody>
    </table>
  );
}
