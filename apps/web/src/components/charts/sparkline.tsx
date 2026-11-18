import { useId } from "react";
import { cn } from "@/lib/utils";

/** Single-series micro trend. Tone follows the net change; title carries the numbers. */
export function Sparkline({
  values,
  className,
  height = 32,
  width = 120,
  fill = true,
}: {
  values: number[];
  className?: string;
  height?: number;
  width?: number;
  fill?: boolean;
}) {
  const id = useId();
  if (values.length < 2) {
    return <svg viewBox={`0 0 ${width} ${height}`} className={cn("h-8 w-full", className)} aria-hidden><line x1="0" x2={width} y1={height / 2} y2={height / 2} stroke="var(--hairline-strong)" strokeDasharray="2 4" /></svg>;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 2;
  const pts = values.map((v, i) => [
    (i / (values.length - 1)) * width,
    pad + (1 - (v - min) / span) * (height - pad * 2),
  ]);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const delta = values.at(-1)! - values[0];
  const color = delta > 0 ? "var(--up)" : delta < 0 ? "var(--coral)" : "var(--muted-foreground)";
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className={cn("h-8 w-full overflow-visible", className)}>
      <title>{`${values[0].toFixed(2)} → ${values.at(-1)!.toFixed(2)}`}</title>
      {fill && (
        <>
          <defs>
            <linearGradient id={`${id}-f`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor={color} stopOpacity="0.22" />
              <stop offset="1" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`${d} L${width},${height} L0,${height} Z`} fill={`url(#${id}-f)`} />
        </>
      )}
      <path d={d} fill="none" stroke={color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
