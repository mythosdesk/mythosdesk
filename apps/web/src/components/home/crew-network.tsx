"use client";

import { ArrowUpRight, Brain, PaperPlaneRight } from "@phosphor-icons/react";
import { useGSAP } from "@gsap/react";
import { BRAND, characterFor, type AgentSummary, type ChainKey } from "@elyagents/shared";
import gsap from "gsap";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, useState, type CSSProperties } from "react";
import { AgentPortrait, AgentSprite, tileColor } from "@/components/agents/agent-bits";
import { BrandMark } from "@/components/brand/logo";
import { ChainIcon } from "@/components/common/chain";
import { Pnl, StatusDot, Tag } from "@/components/common/bits";
import { fmtNum, timeAgo } from "@/lib/format";
import { useAgent, useAgents, useStats } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { useNow } from "@/lib/use-now";

gsap.registerPlugin(useGSAP);

const W = 1000;
const H = 560;
const ORB = { x: 120, y: 280 };
const NODE_X = 300;
const NODE_W = 170;
const nodeY = (i: number) => 62 + i * 87;

/*
 * Phones: the same network stood upright — engine on top, the crew in a row, the book fanning down.
 * Laid out in real pixels from the measured width, so labels never collide at any phone size.
 */
const M_ORB_Y = 46;
const M_ROW_TOP = 140;
const M_MAX_CHIPS = 8;
function phoneLayout(width: number, chips: number) {
  const col = width / 6;
  const avatar = Math.max(30, Math.min(42, Math.floor(col - 6)));
  const fanTop = M_ROW_TOP + avatar + 44; // under each name and P&L
  const chipY = (row: number) => fanTop + 58 + row * 42;
  const rows = Math.max(1, Math.ceil(chips / 2));
  return {
    avatar,
    nodeX: (i: number) => (i + 0.5) * col,
    fanTop,
    chipY,
    chipX: [width * 0.26, width * 0.74],
    height: chipY(rows - 1) + 22,
  };
}

const pct = (value: number, total: number) => `${(value / total) * 100}%`;

interface FanItem {
  key: string;
  symbol: string;
  chain: ChainKey;
  address: string;
  pnlPct: number | null;
  kind: "open" | "closed";
}

export function CrewNetwork() {
  const { data: agents } = useAgents("PLATFORM");
  const crew = useMemo(
    () =>
      (agents ?? [])
        .filter((a) => a.kind === "PLATFORM")
        .sort((a, b) => characterFor(a.characterId).index - characterFor(b.characterId).index)
        .slice(0, 6),
    [agents],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Default to the busiest book so the fan has something to show.
  const busiest = useMemo(() => [...crew].sort((a, b) => b.openPositions - a.openPositions || b.trades - a.trades)[0], [crew]);
  const selected = crew.find((a) => a.id === selectedId) ?? busiest;
  const selectedIndex = Math.max(0, crew.findIndex((a) => a.id === selected?.id));
  const detail = useAgent(selected?.id ?? "");
  const { data: stats } = useStats();

  const fan: FanItem[] = useMemo(() => {
    const d = detail.data;
    if (!d) return [];
    const items: FanItem[] = d.positions.map((p) => ({
      key: p.id,
      symbol: p.symbol,
      chain: p.chain,
      address: p.tokenAddress,
      pnlPct: p.costValue ? ((p.lastValue - p.costValue) / p.costValue) * 100 : null,
      kind: "open",
    }));
    for (const p of d.closedPositions) {
      if (items.length >= 12) break;
      items.push({
        key: p.id,
        symbol: p.symbol,
        chain: p.chain,
        address: p.tokenAddress,
        pnlPct: p.costValue && p.realizedPnl !== null ? (p.realizedPnl / p.costValue) * 100 : null,
        kind: "closed",
      });
    }
    return items.slice(0, 12);
  }, [detail.data]);

  const fanPoints = fan.map((_, i) => {
    const n = Math.max(fan.length, 1);
    const t = n === 1 ? 0.5 : i / (n - 1);
    const angle = (-62 + t * 124) * (Math.PI / 180);
    return { x: 560 + 330 * Math.cos(angle), y: H / 2 + 250 * Math.sin(angle) };
  });

  // Phone layout: two columns of chips under the crew row; a lone last chip sits centred.
  const [phoneWidth, setPhoneWidth] = useState(340);
  const measurePhone = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const w = Math.round(entry.contentRect.width);
      if (w > 0) setPhoneWidth(w);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const mFan = fan.slice(0, M_MAX_CHIPS);
  const m = phoneLayout(phoneWidth, mFan.length);
  const mFanPoints = mFan.map((_, i) => ({
    x: mFan.length % 2 === 1 && i === mFan.length - 1 ? phoneWidth / 2 : m.chipX[i % 2],
    y: m.chipY(Math.floor(i / 2)),
  }));

  // Both layouts are in the DOM (CSS picks one), so the same animation runs on desktop and phones.
  const rootRef = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      rootRef.current?.querySelectorAll<SVGPathElement>("[data-fan]").forEach((path) => {
        let len = 0;
        try {
          len = path.getTotalLength();
        } catch {
          len = 0;
        }
        if (!len) return;
        gsap.fromTo(
          path,
          { strokeDasharray: len, strokeDashoffset: len },
          { strokeDashoffset: 0, duration: 1.1, ease: "expo.out", delay: 0.05, onComplete: () => void gsap.set(path, { clearProps: "strokeDasharray,strokeDashoffset" }) },
        );
      });
      if (!fan.length) return;
      gsap.fromTo("[data-fan-chip='x']", { opacity: 0, x: -12, filter: "blur(6px)" }, { opacity: 1, x: 0, filter: "blur(0px)", duration: 0.8, stagger: 0.04, ease: "expo.out", delay: 0.15 });
      gsap.fromTo("[data-fan-chip='y']", { opacity: 0, y: -12, filter: "blur(6px)" }, { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.8, stagger: 0.05, ease: "expo.out", delay: 0.15 });
    },
    { dependencies: [selected?.id, fan.length], scope: rootRef },
  );

  if (!selected) {
    return <div className="bezel"><div className="bezel-core skeleton h-[560px]" /></div>;
  }

  const sy = nodeY(selectedIndex);
  const msx = m.nodeX(selectedIndex);

  return (
    <div className="bezel">
      <div ref={rootRef} className="bezel-core grid overflow-hidden lg:grid-cols-[1fr_400px]">
        {/* Graph, desktop and tablet */}
        <div className="relative hidden border-r border-hairline md:block">
          <div className="absolute left-6 top-6 z-10 flex items-center gap-2">
            <span className="eyebrow">
              <span className="size-1.5 rounded-full bg-primary" /> Crew network
            </span>
            <span className="text-xs text-muted-foreground">Select an agent to trace its book</span>
          </div>
          <div className="relative mx-auto aspect-[1000/560] w-full max-w-[1000px]">
            <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 size-full">
              <defs>
                <linearGradient id="link" x1="0" x2="1">
                  <stop offset="0" stopColor="rgb(38 124 131 / 0.9)" />
                  <stop offset="1" stopColor="rgb(38 124 131 / 0.25)" />
                </linearGradient>
                <linearGradient id="fan" x1="0" x2="1">
                  <stop offset="0" stopColor="rgb(38 124 131 / 0.85)" />
                  <stop offset="1" stopColor="rgb(38 124 131 / 0.18)" />
                </linearGradient>
              </defs>
              {crew.map((a, i) => {
                const y = nodeY(i);
                const active = a.id === selected.id;
                return (
                  <path
                    key={a.id}
                    d={`M${ORB.x + 44},${ORB.y} C${ORB.x + 120},${ORB.y} ${NODE_X - 90},${y} ${NODE_X},${y}`}
                    fill="none"
                    stroke={active ? "url(#link)" : "rgb(15 21 22 / 0.09)"}
                    strokeWidth={active ? 2 : 1}
                  />
                );
              })}
              {fanPoints.map((p, i) => (
                <g key={fan[i].key}>
                  <path
                    data-fan
                    d={`M${NODE_X + NODE_W},${sy} C${NODE_X + NODE_W + 110},${sy} ${p.x - 130},${p.y} ${p.x - 8},${p.y}`}
                    fill="none"
                    stroke="url(#fan)"
                    strokeWidth="1.3"
                  />
                  <circle cx={p.x - 8} cy={p.y} r="3.5" fill="var(--primary)" />
                </g>
              ))}
            </svg>

            {/* Orb */}
            <div className="absolute grid place-items-center" style={{ left: pct(ORB.x, W), top: pct(ORB.y, H), transform: "translate(-50%,-50%)" }}>
              <EngineOrb size="lg" />
              <p className="mt-1 text-center text-xs font-medium">{BRAND.name} engine</p>
              <span className="mt-1 rounded-full bg-white px-2 py-0.5 font-mono text-[10px] text-muted-foreground ring-1 ring-hairline">
                {fmtNum(stats?.tokensScanned ?? 0, 0)} tokens
              </span>
            </div>

            {/* Agent nodes */}
            {crew.map((a, i) => {
              const active = a.id === selected.id;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setSelectedId(a.id)}
                  aria-pressed={active}
                  className={cn(
                    "absolute flex items-center gap-2.5 rounded-full py-1.5 pl-1.5 pr-3 text-left transition-all duration-500 ease-[var(--ease-spring)]",
                    active
                      ? "bg-white ring-2 ring-primary shadow-[0_16px_30px_-18px_rgb(38_124_131/0.65)]"
                      : "bg-white/75 ring-1 ring-hairline hover:bg-white hover:ring-primary/40",
                  )}
                  style={{ left: pct(NODE_X, W), top: pct(nodeY(i), H), width: pct(NODE_W, W), transform: "translateY(-50%)" }}
                >
                  <AgentPortrait characterId={a.characterId} size={36} rounded="rounded-full" />
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-medium">{a.name}</span>
                    <Pnl percent={a.pnlPercent} className="text-[11px]" />
                  </span>
                </button>
              );
            })}

            {/* Fan chips */}
            {fanPoints.map((p, i) => (
              <FanChip key={fan[i].key} item={fan[i]} axis="x" className="absolute max-w-[150px]" style={{ left: pct(p.x, W), top: pct(p.y, H), transform: "translateY(-50%)" }} />
            ))}
            {fan.length === 0 && (
              <p className="absolute right-[12%] top-1/2 -translate-y-1/2 text-sm text-muted-foreground">No positions yet — watching the market.</p>
            )}
          </div>
        </div>

        {/* Graph, phones: the same network, upright */}
        <div className="relative px-4 pt-5 md:hidden">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="eyebrow">
              <span className="size-1.5 rounded-full bg-primary" /> Crew network
            </span>
            <span className="text-xs text-muted-foreground">Tap an agent to trace its book</span>
          </div>
          <div ref={measurePhone} className="relative mx-auto mt-3 w-full max-w-[460px]" style={{ height: m.height }}>
            <svg viewBox={`0 0 ${phoneWidth} ${m.height}`} className="absolute inset-0 size-full" aria-hidden>
              <defs>
                <linearGradient id="m-link" gradientUnits="userSpaceOnUse" x1="0" y1={M_ORB_Y + 40} x2="0" y2={M_ROW_TOP}>
                  <stop offset="0" stopColor="rgb(38 124 131 / 0.9)" />
                  <stop offset="1" stopColor="rgb(38 124 131 / 0.35)" />
                </linearGradient>
                <linearGradient id="m-fan" gradientUnits="userSpaceOnUse" x1="0" y1={m.fanTop} x2="0" y2={m.height}>
                  <stop offset="0" stopColor="rgb(38 124 131 / 0.85)" />
                  <stop offset="1" stopColor="rgb(38 124 131 / 0.22)" />
                </linearGradient>
              </defs>
              {crew.map((a, i) => {
                const x = m.nodeX(i);
                const cx = phoneWidth / 2;
                const active = a.id === selected.id;
                return (
                  <path
                    key={a.id}
                    d={`M${cx},${M_ORB_Y + 40} C${cx},${M_ORB_Y + 80} ${x},${M_ROW_TOP - 52} ${x},${M_ROW_TOP - 7}`}
                    fill="none"
                    stroke={active ? "url(#m-link)" : "rgb(15 21 22 / 0.09)"}
                    strokeWidth={active ? 2 : 1}
                  />
                );
              })}
              {mFanPoints.map((p, i) => (
                <g key={mFan[i].key}>
                  <path
                    data-fan
                    d={`M${msx},${m.fanTop} C${msx},${m.fanTop + 34} ${p.x},${p.y - 56} ${p.x},${p.y - 19}`}
                    fill="none"
                    stroke="url(#m-fan)"
                    strokeWidth="1.3"
                  />
                  <circle cx={p.x} cy={p.y - 19} r="3" fill="var(--primary)" />
                </g>
              ))}
            </svg>

            {/* Orb, with its label to the right */}
            <div className="absolute" style={{ left: phoneWidth / 2, top: M_ORB_Y, transform: "translate(-50%,-50%)" }}>
              <EngineOrb size="sm" />
            </div>
            <div className="absolute right-0" style={{ left: phoneWidth / 2 + 50, top: M_ORB_Y, transform: "translateY(-50%)" }}>
              <p className="text-[11px] font-medium leading-tight">{BRAND.name} engine</p>
              <span className="mt-1 inline-block rounded-full bg-white px-2 py-0.5 font-mono text-[10px] text-muted-foreground ring-1 ring-hairline">
                {fmtNum(stats?.tokensScanned ?? 0, 0)} tokens
              </span>
            </div>

            {/* The crew, one column each so every avatar sits under its line */}
            {crew.map((a, i) => {
              const active = a.id === selected.id;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setSelectedId(a.id)}
                  aria-pressed={active}
                  aria-label={`Trace ${a.name}'s book`}
                  className="absolute flex flex-col items-center"
                  style={{ left: m.nodeX(i), top: M_ROW_TOP, width: phoneWidth / 6, transform: "translateX(-50%)" }}
                >
                  <AgentPortrait
                    characterId={a.characterId}
                    size={m.avatar}
                    rounded="rounded-full"
                    className={cn(
                      "transition-[scale,box-shadow] duration-500 ease-[var(--ease-spring)]",
                      active ? "scale-110 ring-2 ring-primary ring-offset-2 ring-offset-surface-1" : "ring-1 ring-hairline",
                    )}
                  />
                  <span className={cn("mt-2 w-full truncate px-0.5 text-center text-[10px] leading-[14px]", active ? "font-semibold" : "font-medium text-foreground/75")}>{a.name}</span>
                  <Pnl percent={a.pnlPercent} digits={1} showArrow={false} className="text-[9.5px] leading-[13px]" />
                </button>
              );
            })}

            {/* The selected agent's book */}
            {mFanPoints.map((p, i) => (
              <div key={mFan[i].key} className="absolute max-w-[47%]" style={{ left: p.x, top: p.y, transform: "translate(-50%,-50%)" }}>
                <FanChip item={mFan[i]} axis="y" />
              </div>
            ))}
            {fan.length === 0 && (
              <p className="absolute inset-x-0 text-center text-sm text-muted-foreground" style={{ top: m.chipY(0) - 10 }}>
                No positions yet — watching the market.
              </p>
            )}
          </div>
        </div>

        {/* Detail panel */}
        <AgentPanel agent={selected} lastReason={detail.data?.decisions[0]?.reason ?? null} lastAt={detail.data?.decisions[0]?.createdAt ?? null} trades={detail.data?.trades ?? []} />
      </div>
    </div>
  );
}

/** The engine: the brand mark in a teal core, a mint halo and a slowly turning dashed ring. */
function EngineOrb({ size }: { size: "sm" | "lg" }) {
  const lg = size === "lg";
  return (
    <div className={cn("relative grid place-items-center", lg ? "size-[150px]" : "size-[88px]")}>
      <div className={cn("absolute animate-[orbit_30s_linear_infinite] rounded-full border border-dashed border-primary/40", lg ? "inset-3" : "inset-1")} />
      <div className={cn("absolute rounded-full bg-mint/60", lg ? "inset-8" : "inset-[18px]")} />
      <div className={cn("relative grid place-items-center rounded-full bg-primary text-primary-foreground shadow-[0_14px_30px_-12px_rgb(38_124_131/0.7)]", lg ? "size-14" : "size-11")}>
        <BrandMark className={lg ? "h-6 w-7" : "h-[18px] w-[21px]"} />
      </div>
    </div>
  );
}

/** One position in an agent's book. `axis` sets the direction it animates in from. */
function FanChip({ item, axis, className, style }: { item: FanItem; axis: "x" | "y"; className?: string; style?: CSSProperties }) {
  return (
    <Link
      data-fan-chip={axis}
      href={`/tokens/${item.chain}/${item.address}`}
      className={cn(
        "flex items-center gap-1.5 whitespace-nowrap rounded-full bg-white py-1 pl-1 pr-2.5 text-[11px] ring-1 ring-hairline transition-colors hover:ring-primary/50 active:ring-primary/50",
        className,
      )}
      style={style}
    >
      <ChainIcon chain={item.chain} className="size-4 shrink-0" />
      <span className="truncate font-medium">{item.symbol}</span>
      {item.pnlPct !== null && <Pnl percent={item.pnlPct} digits={1} showArrow={false} className="text-[10px]" />}
      {item.kind === "open" && <span className="size-1.5 shrink-0 rounded-full bg-up" title="Open position" />}
    </Link>
  );
}

function AgentPanel({
  agent,
  lastReason,
  lastAt,
  trades,
}: {
  agent: AgentSummary;
  lastReason: string | null;
  lastAt: string | null;
  trades: { pnl: number | null; side: string; value: number }[];
}) {
  const router = useRouter();
  const now = useNow(15_000);
  const [question, setQuestion] = useState("");
  const c = characterFor(agent.characterId);
  const closed = trades.filter((t) => t.side === "SELL" && t.pnl !== null).slice(0, 28).reverse();
  const wins = closed.filter((t) => (t.pnl ?? 0) >= 0).length;
  const winRate = closed.length ? Math.round((wins / closed.length) * 100) : null;
  const maxAbs = Math.max(0.0001, ...closed.map((t) => Math.abs(t.pnl ?? 0)));
  const unit = BRAND.creditSymbol;

  return (
    <div className="flex flex-col gap-4 p-5 md:p-6">
      <div className="flex items-center gap-4">
        <div className="relative">
          <span className="grid size-[100px] place-items-end overflow-hidden rounded-[22px] ring-1 ring-foreground/10" style={{ background: tileColor(c.color) }}>
            <AgentSprite characterId={c.id} className="size-[100px]" />
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{agent.strategyName}</p>
          <h3 className="text-2xl font-semibold tracking-tight">{agent.name}</h3>
          <p className="text-xs text-muted-foreground">{c.tagline}</p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-full bg-white py-2 pl-2.5 pr-2 ring-1 ring-hairline">
        <div className="flex items-center gap-2">
          <Tag tone={agent.status === "ACTIVE" ? "up" : "default"}>
            <StatusDot active={agent.status === "ACTIVE"} className="mr-1" /> {agent.status === "ACTIVE" ? "Active" : "Paused"}
          </Tag>
          <span className="text-[11px] text-muted-foreground">Last decision {now ? timeAgo(lastAt ?? agent.lastDecisionAt, now) : "—"}</span>
        </div>
        <Link href={`/agent/${agent.id}`} className="inline-flex items-center gap-1 rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
          Explore <ArrowUpRight weight="bold" className="size-3" />
        </Link>
      </div>

      {/* Win rate (Ref 1 sentiment card) */}
      <div className="relative overflow-hidden rounded-[22px] p-4 ring-1 ring-hairline" style={{ background: `linear-gradient(135deg, ${tileColor(c.color, 34)}, #ffffff 72%)` }}>
        <div className="flex items-center justify-between">
          <p className="text-sm text-foreground/80">Win rate</p>
          <Tag tone={winRate === null ? "default" : winRate >= 50 ? "up" : "amber"}>{winRate === null ? "No exits yet" : winRate >= 50 ? "Healthy" : "Choppy"}</Tag>
        </div>
        <div className="mt-2 flex items-end justify-between gap-4">
          <div>
            <p className="num text-5xl font-semibold tracking-tight">{winRate === null ? "—" : `${winRate}%`}</p>
            <p className="mt-1 text-xs text-muted-foreground">{closed.length} closed trades</p>
          </div>
          <div className="flex h-14 flex-1 items-center justify-end gap-[3px]" aria-label="Recent trade results">
            {closed.map((t, i) => {
              const v = t.pnl ?? 0;
              const h = 8 + (Math.abs(v) / maxAbs) * 44;
              return (
                <span key={i} title={`${v >= 0 ? "+" : ""}${v.toFixed(3)} ${unit}`} className={cn("w-[3px] rounded-full", v >= 0 ? "bg-up" : "bg-coral")} style={{ height: h }} />
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {[
          { label: "Portfolio value", value: `${fmtNum(agent.portfolioValue, 3)}`, sub: unit },
          { label: "Showcase P&L", value: <Pnl percent={agent.pnlPercent} />, sub: `${fmtNum(agent.pnl, 3)} ${unit}` },
          { label: "Trades", value: agent.trades, sub: `${agent.wins}W · ${agent.losses}L` },
          { label: "Open positions", value: agent.openPositions, sub: `max ${agent.strategyConfig.maxPositions}` },
        ].map((k) => (
          <div key={k.label} className="panel p-3">
            <p className="text-[11px] text-muted-foreground">{k.label}</p>
            <p className="num mt-1 text-xl font-semibold">{k.value}</p>
            <p className="num font-mono text-[10px] text-faint">{k.sub}</p>
          </div>
        ))}
      </div>

      <div className="rounded-[22px] bg-white p-4 ring-1 ring-hairline">
        <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <Brain weight="light" className="size-4 text-primary" /> Latest reasoning
        </p>
        <p className="line-clamp-4 text-[13px] leading-relaxed text-muted-foreground">{lastReason ?? "Waiting for the next decision round…"}</p>
      </div>

      <form
        className="mt-auto flex items-center gap-2 rounded-full bg-white p-1.5 pl-5 ring-1 ring-hairline-strong focus-within:ring-2 focus-within:ring-primary/50"
        onSubmit={(e) => {
          e.preventDefault();
          const q = question.trim();
          router.push(`/floor?mention=${c.id}${q ? `&q=${encodeURIComponent(q)}` : ""}`);
        }}
      >
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={`Ask ${agent.name} a question…`}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
        />
        <button type="submit" className="grid size-10 place-items-center rounded-full bg-primary text-primary-foreground transition-transform hover:scale-105" aria-label="Ask on Agentbook">
          <PaperPlaneRight weight="fill" className="size-4" />
        </button>
      </form>
    </div>
  );
}
