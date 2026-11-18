"use client";

import { ArrowDown, ArrowUp, ArrowUpRight, Key, Pause, PencilSimple, Play, Plus, Wallet } from "@phosphor-icons/react";
import { BRAND, CHAINS, characterFor, type MyAgent, type StrategyConfig, type VaultWallet } from "@elyagents/shared";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AgentPortrait, AgentSprite, DecisionItem, tileColor } from "@/components/agents/agent-bits";
import { StrategyEditor, type StrategyDraft } from "@/components/agents/strategy-editor";
import { EquityChart } from "@/components/charts/equity-chart";
import { ChainIcon } from "@/components/common/chain";
import { Card, EmptyState, PageHeader, PillButton, PillLink, Pnl, StatusDot, Tag } from "@/components/common/bits";
import { DepositDialog, ExportKeysDialog, WithdrawDialog } from "@/components/portfolio/vault-dialogs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { fmtNum, shortAddress } from "@/lib/format";
import { qk, useAgent, useFeed, useMyAgents } from "@/lib/queries";
import { useSession } from "@/lib/session";
import { useNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";

export function ProfilePage() {
  const { user, requireSession, signingIn, needsSignIn } = useSession();
  const { data: agents, isPending } = useMyAgents();
  const params = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const id = params.get("agent");
    if (id) setSelectedId(id);
  }, [params]);

  if (!user) {
    return (
      <div>
        <PageHeader eyebrow="Your trading desk" title="My portfolio" description="Your agents, wallets, and trading results in one place." action={<PillLink href="/create-agent" size="lg" icon={<Plus weight="bold" className="size-4" />}>Create agent</PillLink>} />
        <Card coreClassName="relative overflow-hidden">
          <div className="relative flex flex-col items-center gap-5 px-6 py-20 text-center">
            <div className="flex -space-x-4">
              {["charon", "hermes", "argus"].map((id) => (
                <AgentPortrait key={id} characterId={id} size={64} rounded="rounded-2xl" className="ring-4 ring-surface-1" />
              ))}
            </div>
            <h2 className="text-3xl font-semibold tracking-tight">Your trading crew starts here</h2>
            <p className="max-w-md text-muted-foreground">Connect your wallet to view your agents and their ETH balances on Robinhood Chain.</p>
            <PillButton size="lg" disabled={signingIn} onClick={() => void requireSession()} icon={<Wallet weight="bold" className="size-4" />}>
              {signingIn ? "Check your wallet…" : needsSignIn ? "Sign in" : "Connect wallet"}
            </PillButton>
          </div>
        </Card>
      </div>
    );
  }

  const list = agents ?? [];
  const selected = list.find((a) => a.id === selectedId) ?? list[0];
  const totalValue = list.filter((a) => a.mode === "PAPER").reduce((s, a) => s + a.portfolioValue, 0);

  return (
    <div>
      <PageHeader
        eyebrow="Your trading desk"
        title="My portfolio"
        description="Your agents, wallets, and trading results in one place."
        action={<PillLink href="/create-agent" size="lg" icon={<Plus weight="bold" className="size-4" />}>Create agent</PillLink>}
      />

      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          ["Agents", String(list.length), "in your crew"],
          ["Active", String(list.filter((a) => a.status === "ACTIVE").length), "trading now"],
          ["Paper value", fmtNum(totalValue, 2), BRAND.creditSymbol],
          ["Wallet", shortAddress(user.address), "owner"],
        ].map(([k, v, s]) => (
          <Card key={k} coreClassName="p-5">
            <p className="text-sm text-muted-foreground">{k}</p>
            <p className="num mt-2 text-3xl font-semibold tracking-tight">{v}</p>
            <p className="font-mono text-[11px] text-faint">{s}</p>
          </Card>
        ))}
      </div>

      {isPending ? (
        <div className="grid gap-4 lg:grid-cols-12">
          <div className="skeleton h-96 rounded-[1.75rem] lg:col-span-4" />
          <div className="skeleton h-96 rounded-[1.75rem] lg:col-span-8" />
        </div>
      ) : list.length === 0 ? (
        <Card>
          <EmptyState icon={<Plus weight="light" className="size-5" />} title="No agents yet" description="Create your first agent — pick a character and a playbook. It starts paused." action={<PillLink href="/create-agent">Create agent</PillLink>} />
        </Card>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-12">
          {/* List (Ref 3 left column) */}
          <Card className="lg:col-span-4" coreClassName="p-2">
            <p className="px-3 pb-2 pt-3 text-sm font-medium">Your agents</p>
            <ul className="space-y-1">
              {list.map((a) => {
                const on = a.id === selected?.id;
                return (
                  <li key={a.id}>
                    <button type="button" onClick={() => setSelectedId(a.id)} className={cn("relative flex w-full items-center gap-3 rounded-2xl p-3 text-left transition-colors", on ? "text-foreground" : "hover:bg-foreground/[0.03]")}>
                      {on && <motion.span layoutId="pf-sel" className="absolute inset-0 rounded-2xl bg-surface-1 ring-2 ring-primary" />}
                      <AgentPortrait characterId={a.characterId} size={44} rounded="rounded-xl" className="relative" />
                      <span className="relative min-w-0 flex-1">
                        <span className="flex items-center gap-2 truncate font-medium">{a.name} <StatusDot active={a.status === "ACTIVE"} /></span>
                        <span className="block truncate text-xs text-muted-foreground">{a.strategyName} · {a.mode === "PAPER" ? "Paper" : "Live"}</span>
                      </span>
                      <span className="relative text-right">
                        <span className="num block font-mono text-sm">{fmtNum(a.portfolioValue, 2)}</span>
                        <Pnl percent={a.pnlPercent} className="text-[11px]" />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>

          {selected && <AgentDesk key={selected.id} agent={selected} />}
        </div>
      )}
    </div>
  );
}

function AgentDesk({ agent }: { agent: MyAgent }) {
  const qc = useQueryClient();
  const c = characterFor(agent.characterId);
  const detail = useAgent(agent.id);
  const feed = useFeed("ALL", agent.id, 20);
  const now = useNow(30_000) ?? undefined;
  const [busy, setBusy] = useState(false);
  const [deposit, setDeposit] = useState<VaultWallet | null>(null);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const liveAvailable = agent.wallets.some((w) => w.liveEnabled);
  const unit = agent.mode === "PAPER" ? BRAND.creditSymbol : "USD";

  const control = async (action: "start" | "pause", mode?: "PAPER" | "LIVE") => {
    setBusy(true);
    try {
      await api(`/me/agents/${agent.id}/${action}`, { method: "POST", json: action === "start" ? { mode } : {} });
      await qc.invalidateQueries({ queryKey: qk.myAgents });
      void qc.invalidateQueries({ queryKey: qk.agent(agent.id) });
      toast.success(action === "start" ? `${agent.name} is live in ${mode === "LIVE" ? "live" : "paper"} mode` : `${agent.name} paused`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 lg:col-span-8">
      <Card coreClassName="relative overflow-hidden p-5 md:p-6">
        <div className="relative flex flex-col gap-5 md:flex-row md:items-center">
          <span className="grid size-[100px] shrink-0 place-items-end overflow-hidden rounded-2xl ring-1 ring-foreground/10" style={{ background: tileColor(c.color) }}>
            <AgentSprite characterId={agent.characterId} className="size-[100px]" />
          </span>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-3xl font-semibold tracking-tight">{agent.name}</h2>
              <Tag tone={agent.status === "ACTIVE" ? "up" : "default"}>{agent.status}</Tag>
              <Tag tone={agent.mode === "LIVE" ? "amber" : "violet"}>{agent.mode === "LIVE" ? "Live vault" : "Paper"}</Tag>
            </div>
            <p className="text-sm text-muted-foreground">{agent.strategyName} · {c.name} character</p>
            <Link href={`/agent/${agent.id}`} className="inline-flex items-center gap-1 text-xs font-medium text-foreground underline-offset-4 hover:underline">Public agent page <ArrowUpRight weight="bold" className="size-3" /></Link>
          </div>
          <div className="flex flex-wrap gap-2">
            {agent.status === "ACTIVE" ? (
              <PillButton variant="dark" disabled={busy} onClick={() => void control("pause")} icon={<Pause weight="fill" className="size-3.5" />}>Pause</PillButton>
            ) : (
              <>
                <PillButton disabled={busy} onClick={() => void control("start", "PAPER")} icon={<Play weight="fill" className="size-3.5" />}>Start paper</PillButton>
                <PillButton variant="dark" disabled={busy || !liveAvailable} onClick={() => void control("start", "LIVE")} title={liveAvailable ? undefined : "Live execution is not enabled on the server"} icon={<Play weight="fill" className="size-3.5" />}>Start live</PillButton>
              </>
            )}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          ["Value", fmtNum(agent.portfolioValue, 3), unit],
          ["P&L", <Pnl key="p" percent={agent.pnlPercent} />, `${agent.pnl >= 0 ? "+" : "−"}${Math.abs(agent.pnl).toFixed(3)} ${unit}`],
          ["Trades", String(agent.trades), `${agent.wins}W · ${agent.losses}L`],
          ["Open", String(agent.openPositions), `max ${agent.strategyConfig.maxPositions}`],
        ].map(([k, v, s]) => (
          <Card key={String(k)} coreClassName="p-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{k}</p>
            <p className="num mt-2 text-2xl font-semibold tracking-tight">{v}</p>
            <p className="num font-mono text-[10px] text-faint">{s}</p>
          </Card>
        ))}
      </div>

      {/* Vault (Ref 3 payout card) */}
      <Card coreClassName="p-5 md:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-medium">Agent vault</p>
            <p className="text-xs text-muted-foreground">Robinhood Chain {shortAddress(agent.evmAddress)}</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setWithdrawOpen(true)} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-foreground/[0.05] px-3 text-xs ring-1 ring-hairline hover:bg-foreground/[0.09]"><ArrowUp weight="bold" className="size-3.5" /> Withdraw</button>
            <button type="button" onClick={() => setExportOpen(true)} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-foreground/[0.05] px-3 text-xs ring-1 ring-hairline hover:bg-foreground/[0.09]"><Key weight="light" className="size-3.5" /> Export key</button>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {agent.wallets.map((w) => (
            <div key={w.chain} className={cn("group rounded-2xl p-4 ring-1 transition-colors", (w.balance ?? 0) > 0 ? "bg-up/[0.06] ring-up/25" : "bg-surface-2 ring-hairline")}>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm"><ChainIcon chain={w.chain} />{CHAINS[w.chain].name}</span>
                {w.liveEnabled ? <Tag tone="up">Live</Tag> : <Tag>Paper only</Tag>}
              </div>
              <p className="num mt-3 font-mono text-xl">{w.balance === null ? "—" : w.balance.toFixed(5)} <span className="text-xs text-muted-foreground">{w.nativeSymbol}</span></p>
              {w.balanceError && <p className="mt-1 truncate text-[10px] text-amber" title={w.balanceError}>RPC unavailable</p>}
              <button type="button" onClick={() => setDeposit(w)} className="mt-3 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-full bg-foreground/[0.06] text-xs ring-1 ring-hairline transition-colors hover:bg-primary hover:text-primary-foreground">
                <ArrowDown weight="bold" className="size-3.5" /> Deposit
              </button>
            </div>
          ))}
        </div>
        {!liveAvailable && <p className="mt-4 text-xs text-muted-foreground">Live execution is switched off on this server. Deposits and withdrawals work; trading runs in paper mode until the operator enables live routes.</p>}
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card coreClassName="p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="font-medium">Playbook · {agent.strategyName}</p>
            <button type="button" onClick={() => setEditOpen(true)} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><PencilSimple weight="light" className="size-3.5" /> Edit</button>
          </div>
          <PlaybookSummary config={agent.strategyConfig} />
          {agent.instructions && <p className="mt-3 rounded-xl bg-foreground/[0.03] p-3 text-xs italic text-muted-foreground ring-1 ring-hairline">“{agent.instructions}”</p>}
        </Card>
        <Card coreClassName="p-5">
          <p className="mb-3 font-medium">Performance</p>
          {detail.data ? <EquityChart points={detail.data.equity} baseline={agent.startingBalance || 1} unit={unit} className="h-48" /> : <div className="skeleton h-48 rounded-xl" />}
        </Card>
      </div>

      <Card coreClassName="p-2">
        <p className="px-3 pb-1 pt-3 font-medium">Recent decisions</p>
        {feed.data?.decisions.length ? feed.data.decisions.slice(0, 12).map((d) => <DecisionItem key={d.id} d={d} compact now={now} />) : <EmptyState title={agent.status === "ACTIVE" ? "Waiting for the next decision round" : "Start the agent to see its decisions"} />}
      </Card>

      <DepositDialog wallet={deposit} open={Boolean(deposit)} onOpenChange={(v) => !v && setDeposit(null)} />
      <WithdrawDialog agent={agent} open={withdrawOpen} onOpenChange={setWithdrawOpen} />
      <ExportKeysDialog agent={agent} open={exportOpen} onOpenChange={setExportOpen} />
      <EditPlaybookDialog agent={agent} open={editOpen} onOpenChange={setEditOpen} />
    </div>
  );
}

function PlaybookSummary({ config }: { config: StrategyConfig }) {
  const rows: [string, string][] = [
    ["Per trade", `${config.sizePercent}%`],
    ["Take profit", `+${config.takeProfitPercent}%`],
    ["Stop loss", `−${config.stopLossPercent}%`],
    ["Trailing", config.trailingStopPercent ? `${config.trailingStopPercent}%` : "Off"],
    ["Max hold", config.maxHoldMinutes ? `${config.maxHoldMinutes}m` : "No limit"],
    ["Cooldown", `${config.cooldownMinutes}m`],
  ];
  return (
    <div className="grid grid-cols-3 gap-2">
      {rows.map(([k, v]) => (
        <div key={k} className="panel px-3 py-2">
          <p className="num font-mono text-sm">{v}</p>
          <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">{k}</p>
        </div>
      ))}
    </div>
  );
}

function EditPlaybookDialog({ agent, open, onOpenChange }: { agent: MyAgent; open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const initial: StrategyDraft =
    agent.strategyId === "custom"
      ? { type: "custom", name: agent.strategyName, config: agent.strategyConfig, instructions: agent.instructions ?? "" }
      : { type: "preset", presetId: agent.strategyId };
  const [draft, setDraft] = useState<StrategyDraft>(initial);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      const strategy = draft.type === "preset" ? { type: "preset", presetId: draft.presetId } : { type: "custom", name: draft.name, config: draft.config, instructions: draft.instructions };
      await api(`/me/agents/${agent.id}`, { method: "PATCH", json: { strategy } });
      await qc.invalidateQueries({ queryKey: qk.myAgents });
      toast.success("Playbook updated");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl">Edit playbook</DialogTitle>
          <DialogDescription>Changes apply from the next decision round. Open positions keep their entries.</DialogDescription>
        </DialogHeader>
        <StrategyEditor characterId={agent.characterId} draft={draft} onChange={setDraft} />
        <PillButton disabled={saving} onClick={() => void save()} className="w-full justify-between">{saving ? "Saving…" : "Save playbook"}</PillButton>
      </DialogContent>
    </Dialog>
  );
}
