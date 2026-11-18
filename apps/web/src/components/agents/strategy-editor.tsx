"use client";

import {
  CHARACTERS,
  characterFor,
  PRESET_LIST,
  STRATEGIES,
  STRATEGY_LIMITS,
  type PresetStrategyId,
  type StrategyConfig,
} from "@elyagents/shared";
import { AgentPortrait, AgentSprite, tileColor } from "@/components/agents/agent-bits";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export type StrategyDraft =
  | { type: "preset"; presetId: PresetStrategyId }
  | { type: "custom"; name: string; config: StrategyConfig; instructions: string };

export function draftConfig(d: StrategyDraft): StrategyConfig {
  return d.type === "preset" ? STRATEGIES[d.presetId].config : d.config;
}

export function draftName(d: StrategyDraft): string {
  return d.type === "preset" ? STRATEGIES[d.presetId].name : d.name || "My Playbook";
}

export function CharacterPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {CHARACTERS.map((c) => {
        const on = value === c.id;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onChange(c.id)}
            className={cn(
              "group relative flex flex-col items-start gap-2.5 overflow-hidden rounded-2xl p-3 text-left ring-1 transition-all duration-500 ease-[var(--ease-spring)] active:scale-[0.98] sm:flex-row sm:items-center sm:gap-3",
              on ? "bg-white ring-2 ring-primary shadow-[0_16px_30px_-18px_rgb(38_124_131/0.55)]" : "bg-surface-2 ring-hairline hover:ring-hairline-strong",
            )}
          >
            <AgentPortrait characterId={c.id} size={48} rounded="rounded-xl" className="transition-transform duration-500 group-hover:-translate-y-0.5" />
            <span className="relative">
              <span className="block text-sm font-medium">{c.name}</span>
              <span className="block text-[11px] text-muted-foreground">{STRATEGIES[c.strategyId].name} strategy</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function Field({ label, value, children, hint }: { label: string; value: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-baseline justify-between">
        <span className="text-sm">{label}</span>
        <span className="num font-mono text-sm font-bold text-foreground">{value}</span>
      </div>
      {children}
      {hint && <p className="text-[11px] text-faint">{hint}</p>}
    </div>
  );
}

const L = STRATEGY_LIMITS;

export function StrategyEditor({ characterId, draft, onChange }: { characterId: string; draft: StrategyDraft; onChange: (d: StrategyDraft) => void }) {
  const character = characterFor(characterId);
  const custom = draft.type === "custom" ? draft : null;
  const base = draftConfig(draft);
  const setCfg = (patch: Partial<StrategyConfig>) => custom && onChange({ ...custom, config: { ...custom.config, ...patch } });

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => onChange({ type: "preset", presetId: draft.type === "preset" ? draft.presetId : character.strategyId })}
          className={cn("rounded-2xl p-4 text-left ring-1 transition-all", draft.type === "preset" ? "bg-white ring-2 ring-primary" : "bg-surface-2 ring-hairline hover:ring-hairline-strong")}
        >
          <p className="font-medium">{draft.type === "preset" ? STRATEGIES[draft.presetId].name : STRATEGIES[character.strategyId].name}</p>
          <p className="text-xs text-muted-foreground">Preset playbook · tested defaults</p>
        </button>
        <button
          type="button"
          onClick={() =>
            onChange({ type: "custom", name: custom?.name ?? "My Playbook", config: custom?.config ?? { ...base }, instructions: custom?.instructions ?? "" })
          }
          className={cn("rounded-2xl p-4 text-left ring-1 transition-all", draft.type === "custom" ? "bg-white ring-2 ring-primary" : "bg-surface-2 ring-hairline hover:ring-hairline-strong")}
        >
          <p className="font-medium">Custom</p>
          <p className="text-xs text-muted-foreground">Set your own rules and instructions</p>
        </button>
      </div>

      {draft.type === "preset" && (
        <div className="flex flex-wrap gap-2">
          {PRESET_LIST.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onChange({ type: "preset", presetId: p.id })}
              className={cn("rounded-full px-3 py-1.5 text-xs ring-1 transition-colors", draft.presetId === p.id ? "bg-primary text-primary-foreground ring-primary" : "bg-foreground/[0.03] text-muted-foreground ring-hairline hover:text-foreground")}
            >
              {p.name} <span className="opacity-60">· {p.risk}</span>
            </button>
          ))}
        </div>
      )}

      {custom && (
        <div className="space-y-6 rounded-2xl bg-foreground/[0.02] p-5 ring-1 ring-hairline">
          <label className="block space-y-2">
            <span className="text-sm">Playbook name</span>
            <input
              value={custom.name}
              maxLength={32}
              onChange={(e) => onChange({ ...custom, name: e.target.value })}
              className="h-11 w-full rounded-xl bg-surface-2 px-4 text-sm outline-none ring-1 ring-hairline focus:ring-foreground/30"
            />
          </label>
          <div className="grid gap-6 md:grid-cols-2">
            <Field label="Position size" value={`${custom.config.sizePercent}%`} hint="Share of free balance per entry">
              <Slider min={L.sizePercent[0]} max={L.sizePercent[1]} step={1} value={[custom.config.sizePercent]} onValueChange={([v]) => setCfg({ sizePercent: v })} />
            </Field>
            <Field label="Max positions" value={String(custom.config.maxPositions)}>
              <Slider min={L.maxPositions[0]} max={L.maxPositions[1]} step={1} value={[custom.config.maxPositions]} onValueChange={([v]) => setCfg({ maxPositions: v })} />
            </Field>
            <Field label="Take profit" value={`+${custom.config.takeProfitPercent}%`}>
              <Slider min={L.takeProfitPercent[0]} max={200} step={1} value={[custom.config.takeProfitPercent]} onValueChange={([v]) => setCfg({ takeProfitPercent: v })} />
            </Field>
            <Field label="Stop loss" value={`−${custom.config.stopLossPercent}%`}>
              <Slider min={L.stopLossPercent[0]} max={60} step={1} value={[custom.config.stopLossPercent]} onValueChange={([v]) => setCfg({ stopLossPercent: v })} />
            </Field>
            <Field label="Trailing stop" value={custom.config.trailingStopPercent ? `${custom.config.trailingStopPercent}%` : "Off"}>
              <div className="flex items-center gap-3">
                <Switch checked={custom.config.trailingStopPercent !== null} onCheckedChange={(on) => setCfg({ trailingStopPercent: on ? 5 : null })} />
                <Slider disabled={custom.config.trailingStopPercent === null} min={L.trailingStopPercent[0]} max={L.trailingStopPercent[1]} step={1} value={[custom.config.trailingStopPercent ?? 5]} onValueChange={([v]) => setCfg({ trailingStopPercent: v })} />
              </div>
            </Field>
            <Field label="Max hold" value={custom.config.maxHoldMinutes ? `${custom.config.maxHoldMinutes} min` : "No limit"}>
              <div className="flex items-center gap-3">
                <Switch checked={custom.config.maxHoldMinutes !== null} onCheckedChange={(on) => setCfg({ maxHoldMinutes: on ? 30 : null })} />
                <Slider disabled={custom.config.maxHoldMinutes === null} min={1} max={720} step={1} value={[custom.config.maxHoldMinutes ?? 30]} onValueChange={([v]) => setCfg({ maxHoldMinutes: v })} />
              </div>
            </Field>
            <Field label="Cooldown" value={`${custom.config.cooldownMinutes} min`} hint="Wait between entries">
              <Slider min={0} max={240} step={1} value={[custom.config.cooldownMinutes]} onValueChange={([v]) => setCfg({ cooldownMinutes: v })} />
            </Field>
          </div>
          <label className="block space-y-2">
            <span className="flex justify-between text-sm">
              Instructions for the AI <span className="font-mono text-[11px] text-faint">{custom.instructions.length}/{L.instructionsMaxChars}</span>
            </span>
            <textarea
              value={custom.instructions}
              maxLength={L.instructionsMaxChars}
              onChange={(e) => onChange({ ...custom, instructions: e.target.value })}
              rows={4}
              placeholder="e.g. Prefer pools older than a day. Avoid tokens that already pumped more than 30% in the last hour."
              className="w-full rounded-xl bg-surface-2 p-4 text-sm outline-none ring-1 ring-hairline placeholder:text-faint focus:ring-foreground/30"
            />
            <span className="block text-[11px] text-faint">Instructions guide entries. They cannot override the numeric limits or pick tokens outside the screened shortlist.</span>
          </label>
        </div>
      )}
    </div>
  );
}

export function ProfilePreview({ name, characterId, draft }: { name: string; characterId: string; draft: StrategyDraft }) {
  const c = characterFor(characterId);
  const cfg = draftConfig(draft);
  const preset = draft.type === "preset" ? STRATEGIES[draft.presetId] : null;
  const stats: [string, string][] = [
    ["Position size", `${cfg.sizePercent}%`],
    ["Take profit", `+${cfg.takeProfitPercent}%`],
    ["Stop loss", `−${cfg.stopLossPercent}%`],
    ["Trailing stop", cfg.trailingStopPercent ? `${cfg.trailingStopPercent}%` : "Off"],
    ["Max hold", cfg.maxHoldMinutes ? `${cfg.maxHoldMinutes}m` : "No limit"],
    ["Max positions", String(cfg.maxPositions)],
    ["Cooldown", `${cfg.cooldownMinutes}m`],
  ];
  return (
    <div className="bezel">
      <div className="bezel-core overflow-hidden">
        <div className="relative h-56 overflow-hidden" style={{ background: tileColor(c.color) }}>
          <div className="hairline-grid absolute inset-0 opacity-70" />
          <div key={c.id} className="absolute bottom-0 left-1/2 -translate-x-1/2 animate-in fade-in slide-in-from-bottom-2 duration-500">
            <AgentSprite characterId={c.id} className="size-[200px]" />
          </div>
        </div>
        <div className="space-y-4 p-5">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              {c.family} crew · {draft.type === "preset" ? "preset playbook" : "custom playbook"}
            </p>
            <p className="mt-1 text-2xl font-semibold tracking-tight">{name.trim() || c.name}</p>
            <p className="text-sm font-medium text-muted-foreground">{draftName(draft)}</p>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {preset ? preset.description : draft.type === "custom" && draft.instructions.trim() ? `“${draft.instructions.trim().slice(0, 180)}${draft.instructions.length > 180 ? "…" : ""}”` : "Your own rules. The AI picks entries within them."}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {stats.map(([k, v]) => (
              <div key={k} className="panel px-3 py-2.5">
                <p className="num font-mono text-base">{v}</p>
                <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">{k}</p>
              </div>
            ))}
          </div>
          <p className="text-[11px] leading-relaxed text-faint">One Robinhood Chain wallet, held encrypted on the server. Fund it with ETH, then start or pause the agent from My Portfolio.</p>
        </div>
      </div>
    </div>
  );
}
