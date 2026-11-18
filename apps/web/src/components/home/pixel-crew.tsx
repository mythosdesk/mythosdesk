"use client";

import { useGSAP } from "@gsap/react";
import { CHARACTERS, STRATEGIES } from "@elyagents/shared";
import gsap from "gsap";
import Link from "next/link";
import { useRef } from "react";
import { AgentSprite, tileColor } from "@/components/agents/agent-bits";
import { cn } from "@/lib/utils";

gsap.registerPlugin(useGSAP);

/** Column heights in % of the stage: a rising bar chart the crew stands on. */
const HEIGHTS = [34, 52, 28, 68, 44, 84];

/**
 * The six resident agents standing on pastel columns. The parent sets the
 * stage height; the top padding leaves room for the sprites above the bars.
 */
export function PixelCrew({ className }: { className?: string }) {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      gsap.from("[data-crew-bar]", { scaleY: 0, transformOrigin: "50% 100%", duration: 1.1, ease: "expo.out", stagger: 0.07, delay: 0.3 });
      gsap.from("[data-crew-sprite]", { y: -36, opacity: 0, duration: 0.7, ease: "back.out(2)", stagger: 0.07, delay: 0.8 });
    },
    { scope: root },
  );

  return (
    <div ref={root} className={cn("grid grid-cols-6 items-stretch gap-1.5 sm:gap-2.5", className)}>
      {CHARACTERS.map((c, i) => {
        const strategy = STRATEGIES[c.strategyId].name;
        return (
          <Link key={c.id} href={`/agent/platform-${c.id}`} aria-label={`${c.name}, ${strategy}`} className="group relative flex h-full flex-col justify-end">
            <div
              data-crew-bar
              className="flex flex-col justify-end overflow-hidden rounded-t-[6px] px-1.5 pb-2 ring-1 ring-foreground/[0.06] sm:rounded-t-[10px] sm:px-3 sm:pb-3"
              style={{ height: `${HEIGHTS[i]}%`, background: tileColor(c.color, 34) }}
            >
              <span className="truncate font-mono text-[8px] font-bold uppercase tracking-[0.06em] sm:text-[10px]">{c.name}</span>
              <span className="hidden text-[11px] leading-tight text-foreground/65 md:line-clamp-2">{strategy}</span>
            </div>
            <div data-crew-sprite className="absolute inset-x-0 mx-auto w-[min(100%,100px)]" style={{ bottom: `${HEIGHTS[i]}%` }}>
              <AgentSprite
                characterId={c.id}
                alt=""
                priority
                className="aspect-square w-full transition-transform duration-300 ease-[var(--ease-spring)] group-hover:-translate-y-1.5"
              />
            </div>
          </Link>
        );
      })}
    </div>
  );
}
