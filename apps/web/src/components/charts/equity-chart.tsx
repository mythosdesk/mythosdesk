"use client";

import type { EquityPoint } from "@elyagents/shared";
import { useMemo } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { cn } from "@/lib/utils";

/** Portfolio value over time: one series, baseline at the starting balance, crosshair tooltip. */
export function EquityChart({
  points,
  baseline,
  unit,
  className,
}: {
  points: EquityPoint[];
  baseline: number;
  unit: string;
  className?: string;
}) {
  const data = useMemo(() => points.map((p) => ({ t: Date.parse(p.t), v: p.v })), [points]);
  const last = data.at(-1)?.v ?? baseline;
  const up = last >= baseline;
  const color = up ? "var(--up)" : "var(--coral)";
  const config: ChartConfig = { v: { label: "Portfolio value", color } };
  const values = data.map((d) => d.v);
  const min = Math.min(baseline, ...values);
  const max = Math.max(baseline, ...values);
  const padding = Math.max((max - min) * 0.15, baseline * 0.005);

  if (data.length < 2) {
    return (
      <div className={cn("grid h-64 place-items-center rounded-2xl border border-dashed border-hairline text-sm text-muted-foreground", className)}>
        The chart fills in after a few engine ticks.
      </div>
    );
  }

  return (
    <ChartContainer config={config} className={cn("aspect-auto h-72 w-full", className)}>
      <AreaChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
        <defs>
          <linearGradient id="equity-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.28} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="rgb(15 21 22 / 0.06)" />
        <XAxis
          dataKey="t"
          type="number"
          scale="time"
          domain={["dataMin", "dataMax"]}
          tickLine={false}
          axisLine={false}
          minTickGap={48}
          tickMargin={10}
          tickFormatter={(t: number) => new Date(t).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit" })}
        />
        <YAxis
          domain={[min - padding, max + padding]}
          tickLine={false}
          axisLine={false}
          width={56}
          tickFormatter={(v: number) => v.toFixed(v >= 100 ? 0 : 2)}
        />
        <ReferenceLine y={baseline} stroke="rgb(15 21 22 / 0.22)" strokeDasharray="4 4" />
        <ChartTooltip
          cursor={{ stroke: "rgb(38 124 131 / 0.45)", strokeWidth: 1 }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload as { t: number; v: number };
            const change = ((p.v - baseline) / baseline) * 100;
            return (
              <div className="rounded-xl bg-surface-2/95 px-3 py-2 text-xs shadow-xl ring-1 ring-hairline-strong backdrop-blur">
                <p className="text-muted-foreground">{new Date(p.t).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                <p className="num mt-1 font-mono text-sm text-foreground">
                  {p.v.toFixed(4)} <span className="text-muted-foreground">{unit}</span>
                </p>
                <p className={cn("num font-mono", change >= 0 ? "text-up" : "text-coral")}>
                  {change >= 0 ? "+" : "−"}
                  {Math.abs(change).toFixed(2)}% vs start
                </p>
              </div>
            );
          }}
        />
        <Area
          dataKey="v"
          type="monotone"
          stroke={color}
          strokeWidth={2}
          fill="url(#equity-fill)"
          isAnimationActive
          animationDuration={900}
          activeDot={{ r: 4, fill: color, stroke: "var(--surface-1)", strokeWidth: 2 }}
        />
      </AreaChart>
    </ChartContainer>
  );
}
