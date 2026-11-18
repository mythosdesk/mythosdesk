"use client";

import { ArrowUpRight, CaretDown, GithubLogo, MagnifyingGlass, Plus, XLogo } from "@phosphor-icons/react";
import { BRAND } from "@elyagents/shared";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Logo } from "@/components/brand/logo";
import { WalletButton } from "@/components/wallet/wallet-button";
import { cn } from "@/lib/utils";
import { CommandSearch } from "./command-search";
import { CREATE_NAV, isActive, MORE_NAV, PRIMARY_NAV } from "./nav-items";

/** usePathname is request data on dynamic routes, so it streams in behind Suspense. */
export function SiteNav() {
  return (
    <Suspense fallback={<NavShell pathname="" />}>
      <NavWithPath />
    </Suspense>
  );
}

function NavWithPath() {
  return <NavShell pathname={usePathname()} />;
}

/** Inner circle of a nav pill: the pill height minus its padding. */
const DOT = "size-[calc(var(--nav-h)-0.75rem)]";

function NavShell({ pathname }: { pathname: string }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  // Close the menu on navigation (state adjusted during render, not in an effect).
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setMenuOpen(false);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    document.documentElement.style.overflow = menuOpen ? "hidden" : "";
  }, [menuOpen]);

  return (
    <>
      {/* Pinned inside the frame's top edge, the way the reference floats its pills over the hero. */}
      <header className="pointer-events-none fixed inset-x-0 top-0 z-40 px-[calc(var(--gutter)+var(--frame-pad)+var(--nav-inset))] pt-[calc(var(--gutter)+var(--frame-pad)+var(--nav-inset))]">
        <div className="mx-auto flex max-w-[calc(var(--frame-max)-2*var(--frame-pad)-2*var(--nav-inset))] items-center justify-between gap-2">
          <div className="pointer-events-auto flex min-w-0 items-center gap-1.5 sm:gap-2.5">
            <button
              type="button"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
              className="pill-white group flex h-[var(--nav-h)] items-center gap-2.5 rounded-full pl-3.5 pr-1.5 text-[14px] font-bold tracking-tight transition-transform duration-500 ease-[var(--ease-spring)] active:scale-[0.97] sm:gap-4 sm:pl-5 sm:text-base"
            >
              <span className="w-[3.1em] text-left">{menuOpen ? "Close" : "Menu"}</span>
              <span className={cn("relative grid place-items-center rounded-full bg-primary transition-transform duration-500 ease-[var(--ease-spring)] group-hover:scale-105", DOT)}>
                <span
                  className={cn(
                    "absolute h-[1.5px] w-3.5 rounded-full bg-primary-foreground transition-transform duration-500 ease-[var(--ease-spring)]",
                    menuOpen ? "rotate-45" : "-translate-y-[3px]",
                  )}
                />
                <span
                  className={cn(
                    "absolute h-[1.5px] w-3.5 rounded-full bg-primary-foreground transition-transform duration-500 ease-[var(--ease-spring)]",
                    menuOpen ? "-rotate-45" : "translate-y-[3px]",
                  )}
                />
              </span>
            </button>
            <Link
              href="/"
              aria-label={`${BRAND.name} home`}
              className="pill-white flex h-[var(--nav-h)] items-center rounded-full px-2 transition-transform duration-500 ease-[var(--ease-spring)] active:scale-[0.97] max-[359px]:hidden sm:pl-3 sm:pr-5"
            >
              <Logo compact className="sm:hidden" />
              <Logo className="hidden sm:inline-flex" />
            </Link>
          </div>

          <div className="pointer-events-auto flex items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="pill-white group hidden h-[var(--nav-h)] items-center gap-8 rounded-full pl-5 pr-1.5 lg:flex"
            >
              <span className="text-[13px] font-semibold text-foreground/75">Search agents, tokens…</span>
              <span className={cn("grid place-items-center rounded-full bg-primary text-primary-foreground transition-transform duration-500 ease-[var(--ease-spring)] group-hover:scale-105", DOT)}>
                <MagnifyingGlass weight="bold" className="size-4" />
              </span>
            </button>
            <button
              type="button"
              aria-label="Search agents and tokens"
              onClick={() => setSearchOpen(true)}
              className="pill-white group grid size-[var(--nav-h)] place-items-center rounded-full transition-transform duration-500 ease-[var(--ease-spring)] active:scale-[0.95] lg:hidden"
            >
              <span className={cn("grid place-items-center rounded-full bg-primary text-primary-foreground transition-transform duration-500 ease-[var(--ease-spring)] group-hover:scale-105", DOT)}>
                <MagnifyingGlass weight="bold" className="size-3.5" />
              </span>
            </button>
            <LaunchMenu />
            <WalletButton />
          </div>
        </div>
      </header>

      <AnimatePresence>{menuOpen && <MenuOverlay pathname={pathname} onClose={() => setMenuOpen(false)} />}</AnimatePresence>
      <CommandSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  );
}

function LaunchMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Launch"
        className="pill-white group flex h-[var(--nav-h)] w-[var(--nav-h)] items-center justify-center gap-3 rounded-full outline-none transition-transform duration-500 ease-[var(--ease-spring)] active:scale-[0.95] lg:w-auto lg:justify-start lg:pl-5 lg:pr-1.5"
      >
        <span className="hidden text-[13px] font-semibold lg:inline">Launch</span>
        <span className={cn("grid place-items-center rounded-full bg-olive text-white transition-transform duration-500 ease-[var(--ease-spring)] group-data-[state=open]:rotate-45", DOT)}>
          <Plus weight="bold" className="size-3.5" />
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={10} className="w-72 rounded-3xl p-2">
        {CREATE_NAV.map((item) => (
          <DropdownMenuItem key={item.href} asChild className="rounded-2xl p-3">
            <Link href={item.href} className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
                <item.icon weight="light" className="size-[18px]" />
              </span>
              <span>
                <span className="block text-sm font-semibold">{item.label}</span>
                <span className="block text-xs text-muted-foreground">{item.description}</span>
              </span>
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MenuOverlay({ pathname, onClose }: { pathname: string; onClose: () => void }) {
  const groups = [
    { title: "Explore", items: PRIMARY_NAV },
    { title: "Create", items: CREATE_NAV },
    { title: "More", items: MORE_NAV },
  ];
  let index = 0;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.25 } }}
      transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
      className="fixed inset-0 z-30 overflow-y-auto bg-page/95 text-white backdrop-blur-2xl"
      onClick={onClose}
    >
      <div className="mx-auto grid max-w-[1440px] gap-10 px-5 pb-16 pt-28 md:grid-cols-3 md:px-10 md:pt-32" onClick={(e) => e.stopPropagation()}>
        {groups.map((group) => (
          <div key={group.title}>
            <p className="eyebrow mb-5">{group.title}</p>
            <ul className="grid gap-1">
              {group.items.map((item) => {
                const i = index++;
                const active = isActive(pathname, item.href);
                return (
                  <li key={item.href} className="overflow-hidden">
                    <motion.div
                      initial={{ y: 48, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ delay: 0.05 + i * 0.035, duration: 0.7, ease: [0.32, 0.72, 0, 1] }}
                    >
                      <Link
                        href={item.href}
                        onClick={onClose}
                        {...(item.external ? { target: "_blank", rel: "noreferrer" } : {})}
                        className={cn(
                          "group flex items-center gap-4 rounded-2xl px-3 py-3 transition-colors duration-300 hover:bg-white/[0.07]",
                          active && "bg-white/[0.09]",
                        )}
                      >
                        <span
                          className={cn(
                            "grid size-11 place-items-center rounded-full ring-1 transition-colors",
                            active ? "bg-primary ring-primary" : "bg-white/[0.06] ring-white/15 group-hover:bg-primary group-hover:ring-primary",
                          )}
                        >
                          <item.icon weight="light" className="size-5" />
                        </span>
                        <span className="flex-1">
                          <span className="block text-xl font-semibold tracking-tight md:text-2xl">{item.label}</span>
                          <span className="block text-sm text-white/60">{item.description}</span>
                        </span>
                        {active && <span className="size-2 rounded-full bg-mint" />}
                        {item.external && <ArrowUpRight weight="bold" className="size-4 text-white/60" />}
                      </Link>
                    </motion.div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        {(BRAND.social.x || BRAND.social.github) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { delay: 0.5 } }}
            className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-white/60 md:col-span-3"
          >
            {BRAND.social.x && (
              <a href={BRAND.social.x} target="_blank" rel="noreferrer" className="flex items-center gap-2 transition-colors hover:text-white">
                <XLogo weight="light" className="size-4" /> Follow {BRAND.name} on X
                <CaretDown weight="light" className="size-3 -rotate-90" />
              </a>
            )}
            {BRAND.social.github && (
              <a href={BRAND.social.github} target="_blank" rel="noreferrer" className="flex items-center gap-2 transition-colors hover:text-white">
                <GithubLogo weight="light" className="size-4" /> Source on GitHub
                <CaretDown weight="light" className="size-3 -rotate-90" />
              </a>
            )}
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
