import { BRAND } from "@elyagents/shared";
import { cn } from "@/lib/utils";

/**
 * The Mythos Desk mark: a lowercase m drawn as one squared stroke on a 7×6 grid, which is also
 * the base unit of the Greek key. The site, the favicon, the token icon and the X avatar all use
 * this one path. Keep in sync with brand/mythos.ts.
 */
const MARK_PATH = "M0 0h7v1H0zM0 1h1v5H0zM3 1h1v5H3zM6 1h1v5H6z";
const TEAL = "#2F878E";

/** Bare mark in the current text colour. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 7 6" shapeRendering="crispEdges" className={cn("h-6 w-7", className)} aria-hidden>
      <path d={MARK_PATH} fill="currentColor" />
    </svg>
  );
}

/** App tile: the white mark on a teal rounded square, same as the favicon and token icon. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 11 11" className={cn("size-8 shrink-0", className)} aria-hidden>
      <rect width="11" height="11" rx="2.4" fill={TEAL} />
      <path d={MARK_PATH} fill="#fff" transform="translate(2 2.5)" shapeRendering="crispEdges" />
    </svg>
  );
}

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark className="size-8" />
      {!compact && (
        <span className="flex flex-col leading-none">
          <span className="text-[15px] font-semibold tracking-tight">{BRAND.name}</span>
          <span className="mt-1 font-mono text-[9px] uppercase tracking-[0.22em] opacity-55">Agents on Robinhood Chain</span>
        </span>
      )}
    </span>
  );
}
