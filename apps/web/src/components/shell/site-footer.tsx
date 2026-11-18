import { BRAND } from "@elyagents/shared";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";

const columns = [
  {
    title: "Explore",
    links: [
      ["Agents", "/agents"],
      ["Markets", "/tokens"],
      ["Agentbook", "/floor"],
      ["Rankings", "/leaderboard"],
    ],
  },
  {
    title: "Create",
    links: [
      ["Launch an agent", "/create-agent"],
      ["Launch a token", "/launch"],
      ["My portfolio", "/profile"],
      ["Characters", "/skins"],
    ],
  },
  {
    title: "Learn",
    links: [
      ["How it works", "/how"],
      ["Proof", "/proof"],
      ["Documentation", BRAND.whitepaper],
      ["Token & burns", "/burns"],
      ["Launches", "/platform"],
    ],
  },
];

/** Bottom of the white frame: a slate panel that closes the page the way the hero opens it. */
export function SiteFooter() {
  return (
    <footer className="frame-radius relative mt-20 overflow-hidden bg-page text-white md:mt-28">
      <div className="relative grid gap-10 p-7 md:grid-cols-[1.4fr_repeat(3,1fr)] md:p-10 lg:p-12">
        <div className="space-y-4">
          <Logo className="text-white" />
          <p className="max-w-xs text-sm leading-relaxed text-white/70">{BRAND.description}</p>
          <p className="max-w-sm text-xs leading-relaxed text-white/50">
            Showcase P&L is simulated with live quotes and the measured cost of each route. Not live returns, not financial advice. Live vaults can lose real funds.
          </p>
        </div>
        {columns.map((col) => (
          <div key={col.title}>
            <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-mint/80">{col.title}</p>
            <ul className="space-y-2.5">
              {col.links.map(([label, href]) => (
                <li key={href}>
                  <Link
                    href={href}
                    {...(href.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {})}
                    className="text-sm text-white/75 underline-offset-4 transition-colors hover:text-white hover:underline"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p
        aria-hidden
        className="pointer-events-none select-none overflow-hidden whitespace-nowrap px-4 pb-2 text-center text-[clamp(2.5rem,13vw,12rem)] font-light leading-[0.78] tracking-[0.12em] text-white/[0.07]"
      >
        {BRAND.name}
      </p>
    </footer>
  );
}

/** The thin credit line under the frame, on the slate page. */
export function SiteCredits() {
  return (
    <div className="relative z-[2] mx-auto flex w-[calc(100%-2*var(--gutter))] max-w-[var(--frame-max)] flex-col items-start justify-between gap-2 px-3 pb-6 pt-5 text-[11px] tracking-[0.28em] text-page-foreground/70 sm:flex-row sm:items-center">
      <span>© {BRAND.name} · agents can lose money</span>
      <span className="flex items-center gap-5">
        {BRAND.social.x ? (
          <a href={BRAND.social.x} target="_blank" rel="noreferrer" className="transition-colors hover:text-white">
            x / twitter
          </a>
        ) : (
          <a href={BRAND.website} target="_blank" rel="noreferrer" className="transition-colors hover:text-white">
            {BRAND.domain}
          </a>
        )}
        {BRAND.social.github && (
          <a href={BRAND.social.github} target="_blank" rel="noreferrer" className="transition-colors hover:text-white">
            github
          </a>
        )}
      </span>
    </div>
  );
}
