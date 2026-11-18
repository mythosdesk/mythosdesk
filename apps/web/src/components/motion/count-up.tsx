"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useRef } from "react";

gsap.registerPlugin(useGSAP);

/** Tweens a number between values with GSAP; renders tabular figures. */
export function CountUp({
  value,
  format = (v) => Math.round(v).toLocaleString("en-US"),
  duration = 1.4,
  className,
}: {
  value: number | null | undefined;
  format?: (v: number) => string;
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const from = useRef(0);

  useGSAP(
    () => {
      if (!ref.current || value === null || value === undefined || !Number.isFinite(value)) return;
      const state = { v: from.current };
      gsap.to(state, {
        v: value,
        duration,
        ease: "expo.out",
        onUpdate: () => {
          if (ref.current) ref.current.textContent = format(state.v);
        },
        onComplete: () => {
          from.current = value;
        },
      });
    },
    { dependencies: [value], scope: ref },
  );

  return (
    <span ref={ref} className={`num ${className ?? ""}`}>
      {value === null || value === undefined ? "—" : format(from.current)}
    </span>
  );
}
