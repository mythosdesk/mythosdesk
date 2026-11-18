"use client";

import { GridFour, MagnifyingGlass, Rows } from "@phosphor-icons/react";
import { BRAND, characterFor, PRESET_LIST } from "@elyagents/shared";
import { motion } from "motion/react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { AgentCard, AgentPortrait } from "@/components/agents/agent-bits";
import { EmptyState, PageHeader, PillLink, Pnl, StatusDot, Tag } from "@/components/common/bits";
import { staggerChild, staggerParent } from "@/components/motion/reveal";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fmtNum } from "@/lib/format";
import { useAgents } from "@/lib/queries";
import { cn } from "@/lib/utils";

export function AgentsPage() {
  const [kind, setKind] = useState("all");
  const [strategy, setStrategy] = useState("all");
  const [q, setQ] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const { data, isPending } = useAgents(kind === "all" ? undefined : kind, strategy === "all" ? undefined : strategy);

  const agents = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (data ?? []).filter(
      (a) => !term || a.name.toLowerCase().includes(term) || a.strategyName.toLowerCase().includes(term) || a.symbol.toLowerCase().includes(term),
    );
  }, [data, q]);

  return (
    <div>
      <PageHeader
        eyebrow="The crew"
        title="Agents"
        description={`Compare strategies in public. Fund an agent to trade for you. Showcase fills are simulated in ${BRAND.creditName} on live quotes — not on-chain.`}
        action={<PillLink href="/create-agent" size="lg">Build yours</PillLink>}
      />

      <div className="glass sticky top-24 z-20 mb-6 flex flex-wrap items-center gap-2 rounded-[1.4rem] p-2">
        <Select value={kind} onValueChange={setKind}>
          <SelectTrigger className="h-10 w-40 rounded-full border-0 bg-foreground/[0.05] ring-1 ring-hairline">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="PLATFORM">Platform agents</SelectItem>
            <SelectItem value="USER">Creator agents</SelectItem>
          </SelectContent>
        </Select>
        <Select value={strategy} onValueChange={setStrategy}>
          <SelectTrigger className="h-10 w-44 rounded-full border-0 bg-foreground/[0.05] ring-1 ring-hairline">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All strategies</SelectItem>
            {PRESET_LIST.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
            <SelectItem value="custom">Custom playbooks</SelectItem>
          </SelectContent>
        </Select>
        <label className="flex h-10 min-w-full flex-1 items-center gap-2 rounded-full bg-foreground/[0.05] px-4 ring-1 ring-hairline focus-within:ring-foreground/30 sm:min-w-52">
          <MagnifyingGlass weight="light" className="size-4 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search agent or strategy" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-faint" />
        </label>
        <span className="ml-auto px-2 font-mono text-xs text-muted-foreground sm:ml-0">{agents.length} agents</span>
        <div className="flex rounded-full bg-foreground/[0.05] p-1 ring-1 ring-hairline">
          {(["grid", "list"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-label={`${v} view`}
              onClick={() => setView(v)}
              className={cn("grid size-8 place-items-center rounded-full transition-colors", view === v ? "bg-foreground/10 text-foreground" : "text-muted-foreground")}
            >
              {v === "grid" ? <GridFour weight="light" className="size-4" /> : <Rows weight="light" className="size-4" />}
            </button>
          ))}
        </div>
      </div>

      {isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton h-[400px] rounded-[1.75rem]" />)}</div>
      ) : agents.length === 0 ? (
        <div className="bezel"><div className="bezel-core"><EmptyState title="No agents match" description="Try another strategy or clear the search." /></div></div>
      ) : view === "grid" ? (
        <motion.div key={`${kind}-${strategy}`} variants={staggerParent} initial="hidden" animate="show" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {agents.map((a, i) => (
            <motion.div key={a.id} variants={staggerChild} className="h-full">
              <AgentCard agent={a} index={i} />
            </motion.div>
          ))}
        </motion.div>
      ) : (
        <div className="bezel">
          <div className="bezel-core overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-hairline text-left font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                  <th className="px-5 py-3 font-normal">Agent</th>
                  <th className="px-3 py-3 font-normal">Strategy</th>
                  <th className="px-3 py-3 font-normal">Status</th>
                  <th className="px-3 py-3 text-right font-normal">Value</th>
                  <th className="px-3 py-3 text-right font-normal">P&L</th>
                  <th className="px-3 py-3 text-right font-normal">Trades</th>
                  <th className="px-5 py-3 text-right font-normal">Open</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((a) => (
                  <tr key={a.id} className="border-b border-hairline/60 transition-colors last:border-0 hover:bg-foreground/[0.02]">
                    <td className="px-5 py-3">
                      <Link href={`/agent/${a.id}`} className="flex items-center gap-3">
                        <AgentPortrait characterId={a.characterId} size={38} rounded="rounded-xl" />
                        <span>
                          <span className="block font-medium">{a.name}</span>
                          <span className="block text-xs text-muted-foreground">{a.kind === "PLATFORM" ? characterFor(a.characterId).tagline : `Creator · ${a.owner ?? "launch"}`}</span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-3 py-3"><Tag>{a.strategyName}</Tag></td>
                    <td className="px-3 py-3"><span className="inline-flex items-center gap-2 text-xs"><StatusDot active={a.status === "ACTIVE"} />{a.status === "ACTIVE" ? "Active" : "Paused"}</span></td>
                    <td className="num px-3 py-3 text-right font-mono">{fmtNum(a.portfolioValue, 3)}</td>
                    <td className="px-3 py-3 text-right"><Pnl percent={a.pnlPercent} /></td>
                    <td className="num px-3 py-3 text-right font-mono">{a.trades}</td>
                    <td className="num px-5 py-3 text-right font-mono">{a.openPositions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
