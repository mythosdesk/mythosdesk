import { CHAINS, type ChainKey } from "@elyagents/shared";
import { cn } from "@/lib/utils";

/** Rows and links from before a chain change can name a chain this build no longer knows. */
const chainMeta = (chain: ChainKey) => CHAINS[chain] ?? { name: String(chain), short: String(chain) };

/** A plain letter, not Robinhood Chain's own logo: nothing here should read as an endorsement. */
export function ChainIcon({ chain, className }: { chain: ChainKey; className?: string }) {
  const meta = chainMeta(chain);
  return (
    <span
      className={cn("grid size-5 shrink-0 place-items-center rounded-full bg-foreground text-[10px] font-bold text-background", className)}
      title={meta.name}
    >
      {meta.name.charAt(0).toUpperCase()}
    </span>
  );
}

export function ChainBadge({ chain, className, short = false }: { chain: ChainKey; className?: string; short?: boolean }) {
  const meta = chainMeta(chain);
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full bg-foreground/[0.04] pl-0.5 pr-2.5 text-[11px] font-medium text-foreground/80 ring-1 ring-hairline",
        className,
      )}
    >
      <ChainIcon chain={chain} />
      {short ? meta.short : meta.name}
    </span>
  );
}
