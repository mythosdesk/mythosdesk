"use client";

import type { Decision } from "@elyagents/shared";
import { useMemo, useState } from "react";
import { useNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";

interface Bucket {
  start: number;
  buy: number;
  sell: number;
  hold: number;
}

/**
 * Decisions per time bucket, stacked BUY / SELL / HOLD with a 2px surface gap
 * between segments (Ref 2 "Steps" style). Hover shows the bucket breakdown.
 */
export function ActivityBars({
  decisions,
  buckets = 24,
  minutesPerBucket = 15,
  className,
}: {
  decisions: Decision[];
  buckets?: number;
  minutesPerBucket?: number;
  className?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  // Re-bucket once a minute; null until mounted so prerendered HTML has no clock.
  const now = useNow(60_000);
  const data = useMemo<Bucket[]>(() => {
    const size = minutesPerBucket * 60_000;
    const end = Math.ceil((now ?? 0) / size) * size;
    const start = end - buckets * size;
    const out: Bucket[] = Array.from({ length: buckets }, (_, i) => ({ start: start + i * size, buy: 0, sell: 0, hold: 0 }));
    for (const d of decisions) {
      const t = Date.parse(d.createdAt);
      if (t < start || t >= end) continue;
      const b = out[Math.floor((t - start) / size)];
      if (d.action === "BUY") b.buy++;
      else if (d.action === "SELL") b.sell++;
      else b.hold++;
    }
    return out;
  }, [decisions, buckets, minutesPerBucket, now]);

  const max = Math.max(1, ...data.map((b) => b.buy + b.sell + b.hold));
  const active = hover !== null ? data[hover] : null;

  return (
    <div className={cn("relative", className)}>
      <div className="flex h-28 items-end gap-[3px]" onMouseLeave={() => setHover(null)}>
        {data.map((b, i) => {
          const total = b.buy + b.sell + b.hold;
          const h = (n: number) => `${(n / max) * 100}%`;
          return (
            <div
              key={b.start}
              className="group relative flex h-full flex-1 cursor-default flex-col-reverse gap-[2px]"
              onMouseEnter={() => setHover(i)}
            >
              {total === 0 && <span className="h-[3px] rounded-full bg-foreground/[0.06]" />}
              {b.hold > 0 && <span className="rounded-[4px] bg-foreground/20 transition-opacity" style={{ height: h(b.hold) }} />}
              {b.sell > 0 && <span className="rounded-[4px] bg-coral" style={{ height: h(b.sell) }} />}
              {b.buy > 0 && <span className="rounded-[4px] bg-up" style={{ height: h(b.buy) }} />}
              {hover === i && <span className="pointer-events-none absolute inset-x-[-1px] inset-y-0 rounded-md bg-foreground/[0.04]" />}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between font-mono text-[10px] text-faint">
        <span>{now ? new Date(data[0].start).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : ""}</span>
        <span>now</span>
      </div>
      {active && (
        <div className="pointer-events-none absolute -top-2 left-1/2 z-10 -translate-x-1/2 -translate-y-full rounded-xl bg-surface-2/95 px-3 py-2 text-xs shadow-xl ring-1 ring-hairline-strong backdrop-blur">
          <p className="text-muted-foreground">
            {new Date(active.start).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })} · {minutesPerBucket}m
          </p>
          <p className="num mt-1 flex gap-3 font-mono">
            <span className="text-up">{active.buy} buy</span>
            <span className="text-coral">{active.sell} sell</span>
            <span className="text-muted-foreground">{active.hold} hold</span>
          </p>
        </div>
      )}
      <div className="mt-3 flex gap-4 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-sm bg-up" />Buy</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-sm bg-coral" />Sell</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-sm bg-foreground/25" />Hold</span>
      </div>
    </div>
  );
}
