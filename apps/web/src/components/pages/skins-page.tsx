"use client";

import { useGSAP } from "@gsap/react";
import { CHARACTERS, STRATEGIES, type CharacterFamily } from "@elyagents/shared";
import gsap from "gsap";
import { useMemo, useRef, useState } from "react";
import { AgentSprite, tileColor } from "@/components/agents/agent-bits";
import { Card, PageHeader, PillLink, Tag } from "@/components/common/bits";
import { cn } from "@/lib/utils";

gsap.registerPlugin(useGSAP);

export function SkinsPage() {
  const [family, setFamily] = useState<CharacterFamily | "All">("All");
  const list = useMemo(() => CHARACTERS.filter((c) => family === "All" || c.family === family), [family]);
  const [activeId, setActiveId] = useState(CHARACTERS[0].id);
  const active = CHARACTERS.find((c) => c.id === activeId) ?? CHARACTERS[0];
  const stage = useRef<HTMLDivElement>(null);
  const strategy = STRATEGIES[active.strategyId];

  useGSAP(
    () => {
      gsap.fromTo("[data-skin-img]", { y: 40, scale: 0.92, opacity: 0, rotate: -4 }, { y: 0, scale: 1, opacity: 1, rotate: 0, duration: 1, ease: "expo.out" });
      gsap.fromTo("[data-skin-text] > *", { y: 20, opacity: 0, filter: "blur(6px)" }, { y: 0, opacity: 1, filter: "blur(0px)", duration: 0.8, stagger: 0.06, ease: "expo.out" });
      gsap.fromTo("[data-skin-num]", { yPercent: 40, opacity: 0 }, { yPercent: 0, opacity: 0.06, duration: 1.2, ease: "expo.out" });
    },
    { dependencies: [activeId], scope: stage },
  );

  return (
    <div>
      <PageHeader eyebrow="Characters" title="Characters" description="The faces behind the agents. Pick one when you launch an agent — each comes with a preset playbook you can keep or rewrite." />

      <Card coreClassName="relative overflow-hidden">
        <div ref={stage} className="relative grid min-h-[520px] items-center gap-6 p-6 md:grid-cols-2 md:p-10">
          <div className="absolute inset-y-0 left-0 w-full transition-[background] duration-700 md:w-1/2" style={{ background: tileColor(active.color) }} />
          <div className="hairline-grid absolute inset-0 opacity-70 mask-fade-b" />
          <span data-skin-num className="pointer-events-none absolute -left-4 bottom-0 select-none text-[22rem] font-bold leading-none tracking-tighter text-foreground">
            {String(active.index).padStart(2, "0")}
          </span>
          <div className="relative grid h-[340px] place-items-center md:h-[440px]">
            <div data-skin-img key={active.id}>
              <AgentSprite characterId={active.id} priority className="size-[300px] md:size-[400px]" />
            </div>
          </div>
          <div data-skin-text key={`t-${active.id}`} className="relative space-y-5">
            <p className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">{active.family} · {strategy.name}</p>
            <h2 className="text-6xl font-semibold tracking-[-0.05em] md:text-7xl">{active.name}</h2>
            <p className="text-xl text-foreground/80">{active.tagline}</p>
            <p className="max-w-md text-muted-foreground">{active.bio}</p>
            <div className="flex flex-wrap gap-6 text-sm">
              <div><p className="text-xs text-muted-foreground">Type</p><p className="font-medium">{active.family}</p></div>
              <div><p className="text-xs text-muted-foreground">Character</p><p className="font-medium">{String(active.index).padStart(2, "0")} of {String(CHARACTERS.length).padStart(2, "0")}</p></div>
              <div><p className="text-xs text-muted-foreground">Risk</p><p className="font-medium">{strategy.risk}</p></div>
            </div>
            <div className="flex flex-wrap gap-3">
              <PillLink href={`/agent/platform-${active.id}`}>View agent</PillLink>
              <PillLink href={`/create-agent?character=${active.id}`} variant="ghost">Use this character</PillLink>
            </div>
            <p className="text-xs text-faint">Collectible skin sales are not available yet.</p>
          </div>
        </div>
      </Card>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-full bg-foreground/[0.03] p-1 ring-1 ring-hairline">
          {(["All", "Steady", "Rush", "Wild"] as const).map((f) => (
            <button key={f} type="button" onClick={() => setFamily(f)} className={cn("rounded-full px-4 py-1.5 text-xs", family === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
              {f}
            </button>
          ))}
        </div>
        <Tag>Character collection / {String(CHARACTERS.length).padStart(2, "0")}</Tag>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {list.map((c) => (
          <button key={c.id} type="button" onClick={() => setActiveId(c.id)} className={cn("bezel text-left transition-transform duration-500 ease-[var(--ease-spring)] hover:-translate-y-1", c.id === activeId && "ring-2 ring-primary")}>
            <div className="bezel-core overflow-hidden p-3">
              <div className="relative grid h-36 place-items-end justify-center overflow-hidden rounded-2xl" style={{ background: tileColor(c.color) }}>
                <AgentSprite characterId={c.id} className="size-[100px] sm:size-[130px]" />
              </div>
              <p className="mt-3 font-medium">{c.name}</p>
              <p className="text-xs text-muted-foreground">{c.family} · {STRATEGIES[c.strategyId].name}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
