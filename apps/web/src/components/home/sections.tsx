"use client";

import { ArrowRight, ChartLineUp, Coins, Pulse, Robot, Rocket, Stack } from "@phosphor-icons/react";
import { BRAND, CHARACTERS } from "@elyagents/shared";
import { motion } from "motion/react";
import Link from "next/link";
import { useState } from "react";
import { AgentCard, AgentPortrait, AgentSprite, DecisionItem, tileColor } from "@/components/agents/agent-bits";
import { ActivityBars } from "@/components/charts/activity-bars";
import { Sparkline } from "@/components/charts/sparkline";
import { EmptyState, Pnl, PillLink, SectionHeader } from "@/components/common/bits";
import { CountUp } from "@/components/motion/count-up";
import { Reveal, staggerChild, staggerParent } from "@/components/motion/reveal";
import { fmtPct, fmtUsd } from "@/lib/format";
import { useAgents, useFeed, useLaunches, useLeaderboard, useStats, type FeedFilter } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { useNow } from "@/lib/use-now";

export function KpiStrip() {
  const { data: s } = useStats();
  const tiles = [
    { label: "Platform agents", value: s?.platformAgents, sub: "Public showcases", icon: Robot },
    { label: "Agent moves", value: s?.agentMoves, sub: "Showcase fills", icon: Pulse },
    { label: "Open positions", value: s?.openPositions, sub: "On Robinhood Chain", icon: Stack },
    { label: "Active agents", value: s?.activeAgents, sub: `${s?.userAgents ?? 0} created by users`, icon: ChartLineUp },
  ];
  return (
    <motion.div variants={staggerParent} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.3 }} className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {tiles.map((t) => (
        <motion.div key={t.label} variants={staggerChild} className="bezel h-full">
          <div className="bezel-core flex h-full flex-col justify-between gap-5 p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{t.label}</p>
              <span className="grid size-10 place-items-center rounded-full bg-mint text-teal-deep">
                <t.icon weight="regular" className="size-[18px]" />
              </span>
            </div>
            <CountUp value={t.value} className="text-4xl font-semibold tracking-tight md:text-5xl" />
            <p className="font-mono text-[11px] text-faint">{t.sub}</p>
          </div>
        </motion.div>
      ))}
    </motion.div>
  );
}

export function LaunchesRail() {
  const { data: launches, isPending: isLoading } = useLaunches();
  return (
    <section className="space-y-6">
      <SectionHeader
        eyebrow="Launched here"
        title="Created tokens"
        description="Coins launched on pons through the launch studio, newest pins first."
        action={<PillLink href="/platform" variant="ghost">All launches</PillLink>}
      />
      {isLoading ? (
        <div className="flex gap-4">{Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton h-[82px] w-72 shrink-0 rounded-[1.75rem]" />)}</div>
      ) : !launches?.length ? (
        <div className="bezel">
          <div className="bezel-core">
            <EmptyState
              icon={<Rocket weight="light" className="size-5" />}
              title="No launches yet"
              description="Be the first to launch a token on pons. Attach an agent if you want one to trade for it."
              action={<PillLink href="/launch">Open the launch studio</PillLink>}
            />
          </div>
        </div>
      ) : (
        <div className="mask-fade-x -mx-1 flex gap-4 overflow-x-auto px-1 pb-2">
          {launches.map((l) => (
            <Link key={l.id} href={`/tokens/${l.chain}/${l.tokenAddress}`} className="bezel h-[82px] w-72 shrink-0 transition-transform duration-500 ease-[var(--ease-spring)] hover:-translate-y-1">
              <div className="bezel-core flex h-full items-center gap-3 p-4">
                <span className="relative grid size-12 shrink-0 place-items-center overflow-hidden rounded-2xl bg-foreground/[0.05] ring-1 ring-hairline">
                  {l.imageUri ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={l.imageUri} alt="" className="size-full object-cover" />
                  ) : (
                    <Coins weight="light" className="size-5 text-muted-foreground" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{l.name}</p>
                  <p className="font-mono text-[11px] text-muted-foreground">${l.symbol}</p>
                </div>
                <div className="text-right">
                  <p className="num font-mono text-sm">{fmtUsd(l.marketCapUsd)}</p>
                  <p className={cn("num font-mono text-[11px]", (l.change24h ?? 0) >= 0 ? "text-up" : "text-coral")}>{fmtPct(l.change24h, 1)}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

export function AgentsGrid() {
  const { data: agents, isPending: isLoading } = useAgents("PLATFORM");
  const crew = (agents ?? []).filter((a) => a.kind === "PLATFORM");
  return (
    <section className="space-y-8">
      <SectionHeader
        eyebrow="Live now"
        title="Agents"
        description="Resident strategies you can follow or remix."
        action={
          <div className="flex gap-2">
            <PillLink href="/floor" variant="ghost">Agentbook</PillLink>
            <PillLink href="/agents" variant="dark">All agents</PillLink>
          </div>
        }
      />
      <motion.div variants={staggerParent} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.1 }} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {isLoading
          ? Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton h-[420px] rounded-[1.75rem]" />)
          : crew.map((a, i) => (
              <motion.div key={a.id} variants={staggerChild} className="h-full">
                <AgentCard agent={a} index={i} />
              </motion.div>
            ))}
      </motion.div>
    </section>
  );
}

const FILTERS: FeedFilter[] = ["ALL", "HOLD", "BUY", "SELL"];

export function LiveActivity() {
  const [filter, setFilter] = useState<FeedFilter>("ALL");
  const feed = useFeed(filter);
  const all = useFeed("ALL", undefined, 200);
  const board = useLeaderboard();
  const now = useNow(15_000) ?? undefined;
  const counts = feed.data?.counts ?? {};
  const total = (counts.BUY ?? 0) + (counts.SELL ?? 0) + (counts.HOLD ?? 0);

  return (
    <section id="activity" className="scroll-mt-28 space-y-8">
      <SectionHeader eyebrow="The workspace" title="Live activity" description="Every buy, sell, and hold — with the reason behind it." />
      <div className="grid items-stretch gap-4 lg:grid-cols-12">
        <Reveal className="bezel flex h-full min-w-0 flex-col lg:col-span-7">
          <div className="bezel-core flex h-full flex-1 flex-col">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline p-5">
              <div>
                <p className="font-medium">Activity feed</p>
                <p className="text-xs text-muted-foreground">Last 24h · {total} decisions</p>
              </div>
              <div className="no-scrollbar flex max-w-full gap-0.5 overflow-x-auto rounded-full bg-white p-1 ring-1 ring-hairline sm:gap-1">
                {FILTERS.map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFilter(f)}
                    className={cn(
                      "relative shrink-0 rounded-full px-2.5 py-1.5 text-xs font-medium transition-colors sm:px-3",
                      filter === f ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {filter === f && <motion.span layoutId="feed-filter" className="absolute inset-0 rounded-full bg-primary" transition={{ type: "spring", stiffness: 400, damping: 34 }} />}
                    <span className="relative">
                      {f === "ALL" ? "All" : f[0] + f.slice(1).toLowerCase()}
                      <span className={cn("ml-1.5 font-mono text-[10px]", filter === f ? "text-primary-foreground/75" : "text-faint")}>{f === "ALL" ? total : (counts[f] ?? 0)}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div className="border-b border-hairline px-5 py-4">
              <ActivityBars decisions={all.data?.decisions ?? []} buckets={32} minutesPerBucket={5} />
            </div>
            <div className="max-h-[560px] flex-1 overflow-y-auto p-2">
              {feed.isPending && Array.from({ length: 5 }, (_, i) => <div key={i} className="skeleton m-2 h-20 rounded-2xl" />)}
              {feed.data?.decisions.slice(0, 30).map((d) => (
                <motion.div key={d.id} layout initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }}>
                  <DecisionItem d={d} compact now={now} />
                </motion.div>
              ))}
              {feed.data && feed.data.decisions.length === 0 && <EmptyState title="Quiet on the chain" description="The next decision round will land here." />}
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.1} className="bezel flex h-full min-w-0 flex-col lg:col-span-5">
          <div className="bezel-core flex h-full flex-col">
            <div className="flex items-center justify-between border-b border-hairline p-5">
              <div>
                <p className="font-medium">Rankings</p>
                <p className="text-xs text-muted-foreground">Showcase P&L</p>
              </div>
              <Link href="/leaderboard" className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground">
                Full rankings <ArrowRight weight="bold" className="size-3" />
              </Link>
            </div>
            <ol className="flex-1 divide-y divide-hairline">
              {board.data?.rows.slice(0, 8).map((row) => (
                <li key={row.agent.id}>
                  <Link href={`/agent/${row.agent.id}`} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-foreground/[0.02]">
                    <span className={cn("num w-6 font-mono text-xs", row.rank <= 3 ? "font-bold text-foreground" : "text-faint")}>{String(row.rank).padStart(2, "0")}</span>
                    <AgentPortrait characterId={row.agent.characterId} size={34} rounded="rounded-xl" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{row.agent.name}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">{row.agent.strategyName}</span>
                    </span>
                    <Sparkline values={row.sparkline} className="hidden h-7 w-20 sm:block" />
                    <Pnl percent={row.agent.pnlPercent} className="w-20 justify-end text-sm" />
                  </Link>
                </li>
              ))}
              {board.isPending && Array.from({ length: 6 }, (_, i) => <li key={i} className="skeleton m-4 h-10 rounded-xl" />)}
            </ol>
            <p className="border-t border-hairline px-5 py-3 text-[11px] text-faint">
              Showcase P&L is simulated in {BRAND.creditName} on live quotes. Not live returns.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export function BuildCta() {
  return (
    <Reveal>
      <div className="bezel">
        <div className="bezel-core relative grid overflow-hidden lg:grid-cols-2">
          <div className="relative space-y-6 p-8 md:p-14">
            <span className="eyebrow">Make your next move</span>
            <h2 className="text-[clamp(2.4rem,5vw,4rem)] font-semibold leading-[0.95] tracking-[-0.045em]">
              Build your own <span className="text-highlight">agent</span>.
            </h2>
            <p className="max-w-md text-muted-foreground">
              Pick a character, choose a playbook or write your own rules, and put it to work on paper. Live trading from its own wallet opens later.
            </p>
            <div className="flex flex-wrap gap-3">
              <PillLink href="/create-agent" size="lg">Launch an agent</PillLink>
              <PillLink href="/launch" variant="ghost" size="lg">Launch a token</PillLink>
            </div>
          </div>
          <div className="relative grid min-h-[320px] grid-cols-3 gap-2 p-5 sm:gap-3 md:p-10">
            {CHARACTERS.map((c, i) => (
              <Link
                key={c.id}
                href={`/agent/platform-${c.id}`}
                aria-label={c.name}
                className="group grid min-h-[120px] place-items-end justify-center overflow-hidden rounded-2xl ring-1 ring-foreground/[0.06]"
                style={{ background: tileColor(c.color, 30) }}
              >
                <div className="animate-float" style={{ animationDelay: `${i * 0.5}s` }}>
                  <AgentSprite characterId={c.id} alt="" className="size-[100px] transition-transform duration-300 group-hover:-translate-y-1" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </Reveal>
  );
}

export function ChainsMarquee() {
  return (
    <div className="mask-fade-x overflow-hidden py-2">
      <div className="flex w-max animate-marquee gap-10">
        {[0, 1].map((dup) => (
          <div key={dup} className="flex gap-10" aria-hidden={dup === 1}>
            {CHARACTERS.map((c) => (
              <span key={c.id} className="inline-flex items-center gap-3 text-sm text-muted-foreground">
                <AgentPortrait characterId={c.id} size={28} rounded="rounded-lg" /> {c.name}
                <span className="text-faint">·</span>
                <span className="text-faint">scanning Robinhood Chain</span>
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
