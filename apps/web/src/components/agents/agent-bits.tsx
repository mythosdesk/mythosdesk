import { characterFor, BRAND, type AgentSummary, type Decision } from "@elyagents/shared";
import Image from "next/image";
import Link from "next/link";
import { ChainIcon } from "@/components/common/chain";
import { Pnl, StatusDot, Tag } from "@/components/common/bits";
import { fmtNum, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Pastel tile behind a character, mixed from its accent colour. */
export function tileColor(color: string, amount = 24): string {
  return `color-mix(in oklab, ${color} ${amount}%, #ffffff)`;
}

/** Head-and-shoulders pixel avatar on the character's tile, CryptoPunks style. */
export function AgentPortrait({
  characterId,
  size = 48,
  className,
  rounded = "rounded-2xl",
}: {
  characterId: string;
  size?: number;
  className?: string;
  rounded?: string;
}) {
  const c = characterFor(characterId);
  return (
    <span
      className={cn("relative block shrink-0 overflow-hidden ring-1 ring-foreground/10", rounded, className)}
      style={{ width: size, height: size, background: tileColor(c.color) }}
    >
      <Image src={c.avatar} alt={c.name} width={64} height={64} unoptimized className="pixelated size-full" />
    </span>
  );
}

/** Full-body pixel sprite (100×100 art). Size it in multiples of 50px to keep pixels square. */
export function AgentSprite({
  characterId,
  className,
  priority,
  alt,
}: {
  characterId: string;
  className?: string;
  priority?: boolean;
  alt?: string;
}) {
  const c = characterFor(characterId);
  return (
    <Image src={c.image} alt={alt ?? c.name} width={100} height={100} unoptimized priority={priority} className={cn("pixelated object-contain", className)} />
  );
}

export function ActionTag({ action }: { action: Decision["action"] }) {
  return <Tag tone={action === "BUY" ? "up" : action === "SELL" ? "coral" : "default"}>{action}</Tag>;
}

export function DecisionItem({ d, compact = false, now }: { d: Decision; compact?: boolean; now?: number }) {
  return (
    <div className="group flex gap-3 rounded-2xl px-3 py-3 transition-colors hover:bg-foreground/[0.025]">
      <Link href={`/agent/${d.agentId}`} className="shrink-0">
        <AgentPortrait characterId={d.characterId} size={36} rounded="rounded-xl" />
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Link href={`/agent/${d.agentId}`} className="text-sm font-medium underline-offset-4 hover:underline">
            {d.agentName}
          </Link>
          <span className="text-xs text-muted-foreground">{d.strategyName}</span>
          <span className="font-mono text-[11px] text-faint">{now ? timeAgo(d.createdAt, now) : ""}</span>
          <span className="ml-auto flex items-center gap-1.5">
            {d.source === "ai" && <Tag tone="violet">AI</Tag>}
            <ActionTag action={d.action} />
          </span>
        </div>
        <p className={cn("mt-1 text-[13px] leading-relaxed text-foreground/85", compact && "line-clamp-2")}>{d.reason}</p>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          {d.chain && <ChainIcon chain={d.chain} className="size-4" />}
          {d.outcome}
        </p>
      </div>
    </div>
  );
}

export function AgentCard({ agent, index }: { agent: AgentSummary; index?: number }) {
  const c = characterFor(agent.characterId);
  const unit = agent.mode === "PAPER" ? BRAND.creditSymbol : "USD";
  return (
    <Link href={`/agent/${agent.id}`} className="group block h-full">
      <div className="bezel flex h-full flex-col transition-transform duration-700 ease-[var(--ease-spring)] group-hover:-translate-y-1">
        <div className="bezel-core flex h-full flex-1 flex-col justify-between overflow-hidden">
          <div>
            <div
              className="relative h-52 overflow-hidden rounded-t-[calc(1.75rem-0.3125rem)]"
              style={{ background: tileColor(c.color) }}
            >
              <div className="hairline-grid absolute inset-0 opacity-70" />
              <AgentSprite
                characterId={agent.characterId}
                className="absolute bottom-0 left-1/2 size-[200px] -translate-x-1/2 transition-transform duration-500 ease-[var(--ease-spring)] group-hover:-translate-y-2"
              />
              <div className="absolute left-4 top-4 flex items-center gap-2">
                {index !== undefined && <span className="font-mono text-[11px] text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>}
                <Tag tone={agent.kind === "PLATFORM" ? "default" : "violet"}>{agent.kind === "PLATFORM" ? agent.strategyName : `Creator · ${agent.strategyName}`}</Tag>
              </div>
              <div className="absolute right-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-surface-1/85 px-2.5 py-1 text-[11px] backdrop-blur-sm">
                <StatusDot active={agent.status === "ACTIVE"} />
                {agent.status === "ACTIVE" ? "Active" : "Paused"}
              </div>
            </div>
            <div className="p-5 pb-0">
              <div className="flex items-baseline gap-2">
                <h3 className="truncate text-xl font-semibold tracking-tight">{agent.name}</h3>
                {agent.tokenAddress && <span className="font-mono text-[11px] text-muted-foreground">${agent.symbol}</span>}
              </div>
              <p className="mt-1 line-clamp-1 h-5 text-sm text-muted-foreground">
                {agent.kind === "PLATFORM" ? c.tagline : agent.owner ? `By ${agent.owner}` : "Created with a token launch."}
              </p>
            </div>
          </div>
          <div className="p-5 pt-4">
            <div className="grid grid-cols-3 gap-2">
              <div className="panel px-3 py-2.5">
                <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">P&L</p>
                <Pnl percent={agent.pnlPercent} className="mt-1 text-sm" />
                <p className="num font-mono text-[10px] text-faint">{fmtNum(agent.pnl, 3)} {unit}</p>
              </div>
              <div className="panel px-3 py-2.5">
                <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">Trades</p>
                <p className="num mt-1 font-mono text-sm">{agent.trades}</p>
                <p className="font-mono text-[10px] text-faint">{agent.openPositions} open</p>
              </div>
              <div className="panel px-3 py-2.5">
                <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">Stop</p>
                <p className="num mt-1 font-mono text-sm">{agent.strategyConfig.stopLossPercent}%</p>
                <p className="font-mono text-[10px] text-faint">TP {agent.strategyConfig.takeProfitPercent}%</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

