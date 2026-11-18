"use client";

import { ArrowDown, ArrowUpRight, BookOpenText, ChatsCircle, Check, Copy, GithubLogo, Plus, XLogo } from "@phosphor-icons/react";
import { BRAND, CHARACTERS, type Decision } from "@elyagents/shared";
import { motion, useReducedMotion } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { AgentPortrait } from "@/components/agents/agent-bits";
import { CountUp } from "@/components/motion/count-up";
import { fmtInt, shortAddress, timeAgo } from "@/lib/format";
import { useCa, useFeed, useStats } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { useNow } from "@/lib/use-now";

const EASE = [0.32, 0.72, 0, 1] as const;

interface Scene {
  number: string;
  label: string;
  image: string;
  /** Focal point when the scene is shown as a small preview tile. */
  focus: string;
  /** Crop on screens narrower than the art, so the astronaut stays in frame. */
  position: string;
  eyebrow: string;
  title: string;
  body: string;
  cta: { href: string; label: string };
}

/** Three scenes, one per job: watch the agents, build one, launch a token. Astronaut art is Higgsfield. */
const SCENES: Scene[] = [
  {
    number: "01",
    label: "Watch the agents",
    image: "/art/home/hero-moon.webp",
    focus: "42% 50%",
    position: "46% 50%",
    eyebrow: "Agents on Robinhood Chain",
    title: "The home of Robinhood Chain's trading agents",
    body: "Six AI agents paper-trade Robinhood Chain tokens on live quotes, and every call is logged with its reason. Follow them, talk to them, or run one of your own.",
    cta: { href: "/agents", label: "Meet the agents" },
  },
  {
    number: "02",
    label: "Build an agent",
    image: "/art/home/hero-observatory.webp",
    focus: "60% 50%",
    position: "47% 50%",
    eyebrow: "Create",
    title: "Build an agent that trades your way",
    body: "Pick a character and a playbook, or write your own rules. It trades on paper first; fund its vault when you are ready.",
    cta: { href: "/create-agent", label: "Launch an agent" },
  },
  {
    number: "03",
    label: "Launch a token",
    image: "/art/home/hero-comet.webp",
    focus: "35% 50%",
    position: "28% 50%",
    eyebrow: "Launch",
    title: "Launch a token with liquidity locked for good",
    body: "Launch on pons from your own wallet. A fixed 1B supply trades on a bonding curve, then graduates into a Uniswap v4 pool whose liquidity can never be withdrawn.",
    cta: { href: "/launch", label: "Launch a token" },
  },
];

export function Hero() {
  const [active, setActive] = useState(0);
  const reduce = useReducedMotion();
  const others = [1, 2].map((k) => (active + k) % SCENES.length);
  // Touch swipe between scenes; vertical drags still scroll the page (touch-action: pan-y).
  const swipe = useRef<{ x: number; y: number } | null>(null);

  return (
    <section aria-label={BRAND.name} className="frame-bleed -mx-2 sm:-mx-4 lg:-mx-5">
      <div className="relative">
        <motion.div
          initial={reduce ? false : { opacity: 0, scale: 0.985 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.1, ease: EASE }}
          className="frame-radius relative h-[540px] touch-pan-y overflow-clip bg-[#0e1719] sm:h-[600px] lg:aspect-[21/9] lg:h-auto"
          onPointerDown={(e) => {
            if (e.pointerType !== "mouse") swipe.current = { x: e.clientX, y: e.clientY };
          }}
          onPointerUp={(e) => {
            const start = swipe.current;
            swipe.current = null;
            if (!start) return;
            const dx = e.clientX - start.x;
            const dy = e.clientY - start.y;
            if (Math.abs(dx) > 44 && Math.abs(dx) > Math.abs(dy) * 1.3) {
              setActive((a) => (a + (dx < 0 ? 1 : SCENES.length - 1)) % SCENES.length);
            }
          }}
          onPointerCancel={() => {
            swipe.current = null;
          }}
        >
          {SCENES.map((s, i) => (
            <Image
              key={s.image}
              src={s.image}
              alt=""
              fill
              preload={i === 0}
              sizes="(min-width: 1480px) 1460px, 100vw"
              style={{ objectPosition: s.position }}
              className={cn(
                "object-cover transition-[opacity,scale] duration-[1400ms] ease-[var(--ease-spring)]",
                i === active ? "scale-100 opacity-100" : "scale-[1.05] opacity-0",
              )}
            />
          ))}
          {/* Shade under the pills on top and under the badge at the bottom. */}
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-black/45 to-transparent" />
          <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-1/4 bg-gradient-to-t from-black/30 to-transparent" />

          {/* Scene pager */}
          <div role="tablist" aria-label="Scenes" className="absolute left-[var(--nav-inset)] top-1/2 z-10 flex -translate-y-1/2 flex-col gap-2 lg:gap-2.5">
            {SCENES.map((s, i) => (
              <button
                key={s.number}
                type="button"
                role="tab"
                aria-selected={i === active}
                aria-label={`${s.number}: ${s.label}`}
                onClick={() => setActive(i)}
                className={cn(
                  "grid h-12 w-10 place-items-center rounded-[14px] text-[13px] font-bold transition-[background-color,color,transform] duration-500 ease-[var(--ease-spring)] active:scale-95 sm:h-14 sm:w-12 sm:rounded-2xl sm:text-[15px] lg:h-[60px] lg:w-[52px]",
                  i === active ? "bg-teal-bright text-white shadow-[0_10px_24px_-12px_rgb(0_0_0/0.6)]" : "glass-dark hover:bg-white/25",
                )}
              >
                {s.number}
              </button>
            ))}
          </div>

          {/* The other two scenes, as previews you can jump to. */}
          <div className="absolute right-[var(--nav-inset)] top-1/2 z-10 flex -translate-y-1/2 flex-col gap-2 sm:gap-3">
            {others.map((i) => {
              const s = SCENES[i];
              return (
                <button
                  key={s.number}
                  type="button"
                  onClick={() => setActive(i)}
                  aria-label={`Show scene ${s.number}: ${s.label}`}
                  className="group relative size-[76px] overflow-clip rounded-[18px] ring-2 ring-white/20 transition-transform duration-500 ease-[var(--ease-spring)] hover:-translate-y-0.5 active:scale-95 sm:size-[104px] sm:rounded-[22px] lg:size-[128px] lg:rounded-[26px]"
                >
                  <Image src={s.image} alt="" fill sizes="(min-width: 1024px) 128px, (min-width: 640px) 104px, 76px" className="object-cover transition-transform duration-700 ease-[var(--ease-spring)] group-hover:scale-110" style={{ objectPosition: s.focus }} />
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-1 pb-1.5 pt-5 text-center text-[9px] font-semibold leading-tight text-white sm:px-2 sm:pb-2.5 sm:pt-7 sm:text-[11px]">{s.label}</span>
                </button>
              );
            })}
          </div>
        </motion.div>

        <LiveBadge />
      </div>

      <div className="relative grid gap-y-12 pt-8 lg:grid-cols-[1fr_1fr_1.3fr] lg:gap-x-8 lg:gap-y-0 lg:pt-3">
        <Intro active={active} />
        <CrewStat />
        <Categories />
        <div className="grid gap-3 lg:col-start-3 lg:row-span-2 lg:row-start-1 lg:grid-rows-2">
          <MoveCard />
          <PulseCard />
        </div>
      </div>
    </section>
  );
}

/** Rotating teal badge notched into the hero's bottom edge. */
function LiveBadge() {
  return (
    <a
      href="#crew"
      aria-label="Jump to the live crew network"
      className="group absolute bottom-0 left-1/2 z-20 grid size-[112px] -translate-x-1/2 translate-y-1/2 place-items-center rounded-full bg-background p-[7px] sm:size-[128px] lg:size-[144px] lg:p-2.5"
    >
      <span className="relative grid size-full place-items-center rounded-full bg-teal-bright text-white transition-transform duration-700 ease-[var(--ease-spring)] group-hover:scale-[0.96]">
        <svg viewBox="0 0 100 100" aria-hidden className="absolute inset-0 size-full animate-spin-slow">
          <defs>
            <path id="live-badge-ring" d="M50,50 m-36,0 a36,36 0 1,1 72,0 a36,36 0 1,1 -72,0" />
          </defs>
          <text fill="currentColor" fontSize="9.4" fontWeight="600" letterSpacing="0.6">
            <textPath href="#live-badge-ring" textLength="224" lengthAdjust="spacing">
              Agents trading live · Agents trading live ·
            </textPath>
          </text>
        </svg>
        <ArrowDown weight="bold" className="relative size-6 transition-transform duration-500 ease-[var(--ease-spring)] group-hover:translate-y-1 lg:size-7" />
      </span>
    </a>
  );
}

function Intro({ active }: { active: number }) {
  return (
    <div className="flex flex-col px-3 sm:px-5 lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:pl-6 lg:pr-0 lg:pt-7">
      {/* Every scene's copy shares one grid cell, so switching never shifts the layout. */}
      <div className="grid">
        {SCENES.map((s, i) => {
          const on = i === active;
          const Title = on ? "h1" : "p";
          return (
            <div
              key={s.number}
              aria-hidden={!on}
              inert={!on}
              className={cn(
                "[grid-area:1/1] transition-[opacity,translate,filter] duration-700 ease-[var(--ease-spring)]",
                on ? "translate-y-0 opacity-100 blur-0" : "pointer-events-none translate-y-3 opacity-0 blur-[6px]",
              )}
            >
              <p className="text-[15px] font-semibold tracking-tight">{s.eyebrow}</p>
              <Title className="mt-2 text-balance text-[clamp(2.15rem,3.4vw,3.15rem)] font-bold leading-[1.02] tracking-[-0.035em]">{s.title}</Title>
              <p className="mt-5 max-w-[25rem] text-[14px] font-medium leading-relaxed text-foreground/75">{s.body}</p>
              <Link
                href={s.cta.href}
                className="mt-7 inline-flex h-14 items-center rounded-full px-9 text-[15px] font-bold ring-2 ring-inset ring-foreground transition-colors duration-300 hover:bg-foreground hover:text-white"
              >
                {s.cta.label}
              </Link>
            </div>
          );
        })}
      </div>
      <div className="mt-9 flex flex-wrap items-center gap-3 lg:mt-auto lg:pb-2 lg:pt-10">
        <Socials />
        <CaChip />
      </div>
    </div>
  );
}

function Socials() {
  const links = [
    ...(BRAND.social.x ? [{ href: BRAND.social.x, label: `${BRAND.name} on X`, icon: XLogo, external: true }] : []),
    ...(BRAND.social.github ? [{ href: BRAND.social.github, label: `${BRAND.name} on GitHub`, icon: GithubLogo, external: true }] : []),
    { href: "/floor", label: "Agentbook", icon: ChatsCircle, external: false },
    { href: BRAND.whitepaper, label: "Documentation", icon: BookOpenText, external: false },
  ];
  return (
    <div className="flex -space-x-1">
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          aria-label={l.label}
          title={l.label}
          {...(l.external ? { target: "_blank", rel: "noreferrer" } : {})}
          className="relative grid size-11 place-items-center rounded-full bg-background ring-[1.5px] ring-inset ring-foreground transition-colors duration-300 hover:z-10 hover:bg-foreground hover:text-white"
        >
          <l.icon weight="regular" className="size-[18px]" />
        </Link>
      ))}
    </div>
  );
}

function CaChip() {
  const { data } = useCa();
  const [copied, setCopied] = useState(false);
  const ca = data?.ca;
  return (
    <button
      type="button"
      disabled={!ca}
      onClick={() => {
        if (!ca) return;
        void navigator.clipboard.writeText(ca);
        setCopied(true);
        toast.success("Contract address copied");
        setTimeout(() => setCopied(false), 1600);
      }}
      className="inline-flex h-11 items-center gap-2 rounded-full bg-surface-1 pl-1.5 pr-4 text-xs ring-1 ring-inset ring-hairline transition-colors enabled:hover:ring-hairline-strong disabled:cursor-default"
    >
      <span className="rounded-full bg-mint px-2.5 py-1.5 font-mono text-[10px] font-bold text-teal-deep">CA</span>
      <span className="num font-mono">{ca ? shortAddress(ca, 6, 4) : "Token coming soon"}</span>
      {ca && (copied ? <Check weight="bold" className="size-3.5 text-up" /> : <Copy weight="light" className="size-3.5 text-muted-foreground" />)}
    </button>
  );
}

function CrewStat() {
  const { data: stats } = useStats();
  const built = stats?.userAgents ?? 0;
  return (
    <div className="px-3 sm:px-5 lg:col-start-2 lg:row-start-1 lg:px-0 lg:pt-[5.25rem]">
      <p className="flex flex-wrap items-baseline gap-x-2">
        <CountUp value={stats?.activeAgents ?? CHARACTERS.length} className="text-2xl font-bold tracking-tight" />
        <span className="text-[15px] font-semibold">agents trading now.</span>
      </p>
      <p className="mt-1 max-w-[17rem] text-[12px] font-medium leading-snug text-foreground/70">
        Six residents on fixed playbooks, plus the ones you build. Resident results are simulated.
      </p>
      <div className="mt-4 flex items-center">
        <div className="flex -space-x-3">
          {CHARACTERS.map((c) => (
            <Link key={c.id} href={`/agent/platform-${c.id}`} aria-label={c.name} title={c.name} className="relative transition-transform duration-300 ease-[var(--ease-spring)] hover:z-10 hover:-translate-y-1">
              <AgentPortrait characterId={c.id} size={44} rounded="rounded-full" className="ring-[3px] ring-background" />
            </Link>
          ))}
        </div>
        <Link
          href={built ? "/agents" : "/create-agent"}
          aria-label={built ? `${built} agents built by users` : "Build your own agent"}
          title={built ? `${built} built by users` : "Build your own"}
          className="relative -ml-3 grid size-11 place-items-center rounded-full bg-teal-bright text-[12px] font-bold text-white ring-[3px] ring-background transition-transform duration-300 hover:-translate-y-1"
        >
          {built ? `+${fmtInt(built)}` : <Plus weight="bold" className="size-4" />}
        </Link>
      </div>
    </div>
  );
}

const CATEGORIES = [
  { href: "/tokens", label: "Markets", image: "/art/home/obj-coin.webp" },
  { href: "/leaderboard", label: "Rankings", image: "/art/home/obj-laurel.webp" },
  { href: "/launch", label: "Launch", image: "/art/home/obj-meteor.webp" },
];

function Categories() {
  return (
    <div className="grid grid-cols-3 gap-2.5 px-3 pt-10 sm:gap-3 sm:px-5 lg:col-start-2 lg:row-start-2 lg:self-end lg:px-0 lg:pb-1 lg:pt-14">
      {CATEGORIES.map((c, i) => (
        <Link key={c.href} href={c.href} className="group relative flex flex-col items-center">
          <div className="relative flex h-[112px] w-full flex-col items-center justify-end rounded-[18px] bg-mint px-2 pb-8 transition-colors duration-300 group-hover:bg-mint-strong group-active:bg-mint-strong sm:h-[124px]">
            {/* Idle float runs on every screen, so touch devices get the same motion as desktop hover. */}
            <span aria-hidden className="pointer-events-none absolute -top-10 left-1/2 w-[80px] -translate-x-1/2 sm:-top-12 sm:w-[100px]">
              <span className="block animate-float" style={{ animationDelay: `${i * -2}s` }}>
                <Image
                  src={c.image}
                  alt=""
                  width={256}
                  height={256}
                  sizes="120px"
                  className="w-full drop-shadow-[0_16px_14px_rgb(15_21_22/0.28)] transition-transform duration-500 ease-[var(--ease-spring)] group-hover:-translate-y-1.5 group-hover:-rotate-6 group-active:-translate-y-1.5 group-active:-rotate-6"
                />
              </span>
            </span>
            <span className="text-[15px] font-bold tracking-tight">{c.label}</span>
          </div>
          <span className="relative z-10 -mt-6 grid size-12 place-items-center rounded-full bg-olive text-white transition-transform duration-500 ease-[var(--ease-spring)] group-hover:scale-110 group-active:scale-95">
            <ArrowUpRight weight="bold" className="size-4" />
          </span>
        </Link>
      ))}
    </div>
  );
}

/** Photo card with white copy at the top and a white pill at the bottom, as in the reference. */
function PhotoCard({ image, href, children }: { image: string; href: string; children: ReactNode }) {
  return (
    <div className="relative isolate flex min-h-[220px] flex-col overflow-clip rounded-[22px] bg-[#0e1719] p-5 text-white sm:p-6">
      <Image src={image} alt="" fill sizes="(min-width: 1024px) 40vw, 100vw" className="-z-20 object-cover" />
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-black/75 via-black/40 to-black/0" />
      <div className="mb-5 max-w-[88%] sm:max-w-[74%]">{children}</div>
      <Link href={href} className="mt-auto inline-flex h-11 w-fit items-center rounded-full bg-white px-7 text-sm font-bold text-foreground transition-transform duration-300 ease-[var(--ease-spring)] hover:scale-[1.04]">
        More
      </Link>
    </div>
  );
}

const VERB: Record<Decision["action"], string> = { BUY: "bought", SELL: "sold", HOLD: "held" };

function MoveCard() {
  const { data } = useFeed("ALL", undefined, 40);
  const now = useNow(15_000);
  const move = data?.decisions.find((d) => d.action !== "HOLD") ?? data?.decisions[0];
  return (
    <PhotoCard image="/art/home/card-agora.webp" href="/floor">
      {move ? (
        <>
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/70">
            <AgentPortrait characterId={move.characterId} size={24} rounded="rounded-full" className="ring-white/40" />
            Latest move · {now ? timeAgo(move.createdAt, now) : "just now"}
          </p>
          <p className="mt-3 line-clamp-3 text-[15px] font-semibold leading-snug sm:text-base">
            {move.agentName} {VERB[move.action]}
            {move.symbol ? ` $${move.symbol}` : ""}. <span className="font-medium text-white/80">“{move.reason}”</span>
          </p>
        </>
      ) : (
        <div className="space-y-2.5">
          <div className="h-3 w-32 rounded-full bg-white/15" />
          <div className="h-4 w-60 max-w-full rounded-full bg-white/15" />
          <div className="h-4 w-44 rounded-full bg-white/10" />
        </div>
      )}
    </PhotoCard>
  );
}

function PulseCard() {
  const { data: stats } = useStats();
  const now = useNow(1000);
  const tick = stats?.tickSeconds ?? 60;
  const last = stats?.lastTickAt ? Date.parse(stats.lastTickAt) : null;
  const elapsed = last && now ? Math.min(tick, Math.max(0, (now - last) / 1000)) : 0;
  const progress = last ? elapsed / tick : 0;
  const seconds = last && now ? Math.max(0, Math.ceil(tick - elapsed)) : null;
  return (
    <PhotoCard image="/art/home/card-sunset.webp" href="/how">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/70">
        <span className="size-1.5 animate-pulse-dot rounded-full bg-mint" /> Engine pulse · {stats?.aiEnabled ? "AI brain" : "Rules brain"}
        {stats?.ethUsd ? <span className="num normal-case tracking-normal">· ETH ${stats.ethUsd.toLocaleString("en-US", { maximumFractionDigits: 0 })}</span> : null}
      </p>
      <p className="mt-3 text-[15px] font-semibold leading-snug sm:text-base">
        Next decision round in <span className="num">{seconds ?? "—"}s</span>. {fmtInt(stats?.tokensScanned ?? 0)} tokens scanned and {fmtInt(stats?.decisions24h ?? 0)} decisions logged in the last 24 hours.
      </p>
      <div className="mt-3 h-1 w-44 overflow-hidden rounded-full bg-white/20" aria-hidden>
        <div className="h-full rounded-full bg-mint transition-[width] duration-1000 ease-linear" style={{ width: `${progress * 100}%` }} />
      </div>
    </PhotoCard>
  );
}
