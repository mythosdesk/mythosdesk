import { ArrowDownRight, ArrowUpRight } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { fmtPct, fmtSigned } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Signed P&L with an arrow so polarity never relies on color alone. */
export function Pnl({
  value,
  percent,
  digits = 2,
  className,
  showArrow = true,
}: {
  value?: number | null;
  percent?: number | null;
  digits?: number;
  className?: string;
  showArrow?: boolean;
}) {
  const v = percent ?? value ?? 0;
  // Anything that rounds to zero at this precision reads as flat.
  const epsilon = 0.5 * 10 ** -digits;
  const tone = v >= epsilon ? "text-up" : v <= -epsilon ? "text-coral" : "text-muted-foreground";
  const Arrow = v >= 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("num inline-flex items-center gap-0.5 font-mono", tone, className)}>
      {showArrow && Math.abs(v) >= epsilon && <Arrow weight="bold" className="size-[0.85em]" />}
      {percent !== undefined && percent !== null ? fmtPct(percent, digits) : fmtSigned(value, digits)}
    </span>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  description,
  action,
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-4 md:flex-row md:items-end md:justify-between", className)}>
      <div className="max-w-2xl space-y-3">
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h2 className="text-3xl font-semibold tracking-[-0.03em] text-balance md:text-4xl">{title}</h2>
        {description && <p className="text-[15px] leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
  children,
}: {
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="relative mb-8 flex flex-col gap-6 pt-6 md:mb-10 md:flex-row md:items-end md:justify-between md:pt-10">
      <div className="max-w-3xl space-y-4">
        <span className="eyebrow">
          <span className="size-1.5 rounded-full bg-foreground" />
          {eyebrow}
        </span>
        <h1 className="text-[clamp(2.5rem,5.5vw,4.5rem)] font-semibold leading-[0.95] tracking-[-0.045em] text-balance">{title}</h1>
        {description && <p className="max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">{description}</p>}
        {children}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

type PillProps = {
  children: ReactNode;
  icon?: ReactNode;
  variant?: "primary" | "ghost" | "dark";
  className?: string;
  size?: "md" | "lg";
};

const pillClass = (variant: PillProps["variant"], size: PillProps["size"], className?: string) =>
  cn(
    "group inline-flex items-center gap-3 rounded-full font-semibold transition-all duration-500 ease-[var(--ease-spring)] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
    size === "lg" ? "h-14 pl-6 pr-2 text-[15px]" : "h-11 pl-5 pr-1.5 text-sm",
    variant === "primary" && "bg-primary text-primary-foreground hover:bg-primary/90",
    variant === "dark" && "bg-olive text-white hover:bg-olive/90",
    // Outlined, like the reference's "Discover" button; fills with ink on hover.
    variant === "ghost" && "bg-transparent text-foreground ring-[1.5px] ring-inset ring-foreground hover:bg-foreground hover:text-white",
    className,
  );

function PillIcon({ icon, variant, size }: Pick<PillProps, "icon" | "variant" | "size">) {
  return (
    <span
      className={cn(
        "grid place-items-center rounded-full transition-transform duration-500 ease-[var(--ease-spring)] group-hover:-translate-y-px group-hover:translate-x-0.5 group-hover:scale-105",
        size === "lg" ? "size-10" : "size-8",
        variant === "ghost" ? "bg-foreground/[0.07] group-hover:bg-white/15" : "bg-white/15",
      )}
    >
      {icon ?? <ArrowUpRight weight="bold" className="size-3.5" />}
    </span>
  );
}

/** Island CTA with the trailing icon nested in its own circle. */
export function PillLink({
  href,
  children,
  icon,
  variant = "primary",
  size = "md",
  className,
  ...rest
}: PillProps & { href: string } & Omit<ComponentProps<typeof Link>, "href" | "children">) {
  return (
    <Link href={href} className={pillClass(variant, size, className)} {...rest}>
      {children}
      <PillIcon icon={icon} variant={variant} size={size} />
    </Link>
  );
}

export function PillButton({
  children,
  icon,
  variant = "primary",
  size = "md",
  className,
  ...rest
}: PillProps & Omit<ComponentProps<"button">, "children">) {
  return (
    <button type="button" className={pillClass(variant, size, className)} {...rest}>
      {children}
      <PillIcon icon={icon} variant={variant} size={size} />
    </button>
  );
}

export function StatusDot({ active, className }: { active: boolean; className?: string }) {
  return (
    <span className={cn("relative inline-flex size-2", className)}>
      {active && <span className="absolute inset-0 animate-ping rounded-full bg-up/50" />}
      <span className={cn("relative size-2 rounded-full", active ? "bg-up" : "bg-faint")} />
    </span>
  );
}

export function Tag({ children, className, tone = "default" }: { children: ReactNode; className?: string; tone?: "default" | "up" | "ink" | "coral" | "amber" | "violet" | "sky" }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-full px-2.5 font-mono text-[10px] font-medium uppercase tracking-[0.12em] ring-1",
        tone === "default" && "bg-foreground/[0.04] text-muted-foreground ring-hairline",
        tone === "up" && "bg-up/10 text-up ring-up/25",
        tone === "ink" && "bg-foreground text-primary-foreground ring-foreground",
        tone === "coral" && "bg-coral/10 text-coral ring-coral/25",
        tone === "amber" && "bg-amber/10 text-amber ring-amber/25",
        tone === "violet" && "bg-violet/10 text-violet ring-violet/25",
        tone === "sky" && "bg-sky/10 text-sky ring-sky/25",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      {icon && <span className="grid size-12 place-items-center rounded-2xl bg-foreground/[0.04] text-muted-foreground ring-1 ring-hairline">{icon}</span>}
      <p className="text-base font-medium">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action}
    </div>
  );
}

export function Card({ children, className, coreClassName }: { children: ReactNode; className?: string; coreClassName?: string }) {
  return (
    <div className={cn("bezel flex flex-col", className)}>
      <div className={cn("bezel-core h-full flex-1", coreClassName)}>{children}</div>
    </div>
  );
}
