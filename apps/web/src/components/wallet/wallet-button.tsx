"use client";

import { CaretDown, Copy, SignIn, SignOut, Wallet } from "@phosphor-icons/react";
import Link from "next/link";
import { toast } from "sonner";
import { useAccount } from "wagmi";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { shortAddress } from "@/lib/format";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { WalletAvatar } from "./wallet-avatar";

export function WalletButton({ className }: { className?: string }) {
  const { address, isConnected } = useAccount();
  const { user, needsSignIn, signIn, signingIn, signOut, setConnectOpen } = useSession();

  if (!isConnected || !address) {
    return (
      <button
        type="button"
        onClick={() => setConnectOpen(true)}
        aria-label="Connect wallet"
        className={cn(
          "group inline-flex h-[var(--nav-h)] w-[var(--nav-h)] items-center justify-center gap-3 rounded-full bg-primary text-[13px] font-semibold text-primary-foreground shadow-[0_10px_28px_-16px_rgb(15_21_22/0.6)] transition-all duration-500 ease-[var(--ease-spring)] hover:bg-primary/90 active:scale-[0.95] sm:w-auto sm:justify-start sm:pl-5 sm:pr-1.5",
          className,
        )}
      >
        <span className="hidden sm:inline">Connect</span>
        <span className="grid size-[calc(var(--nav-h)-0.75rem)] place-items-center rounded-full bg-primary-foreground/15 transition-transform duration-500 ease-[var(--ease-spring)] group-hover:translate-x-0.5">
          <Wallet weight="bold" className="size-3.5" />
        </span>
      </button>
    );
  }

  if (needsSignIn) {
    return (
      <button
        type="button"
        disabled={signingIn}
        onClick={() => void signIn()}
        aria-label={signingIn ? "Check your wallet" : "Sign in"}
        className={cn(
          "pill-white relative inline-flex h-[var(--nav-h)] w-[var(--nav-h)] items-center justify-center gap-2 rounded-full text-[13px] font-semibold transition-colors hover:bg-surface-1 disabled:opacity-60 sm:w-auto sm:px-4",
          className,
        )}
      >
        <SignIn weight="bold" className="size-4 sm:hidden" />
        <span className="absolute right-1 top-1 size-2 animate-pulse-dot rounded-full bg-amber sm:static" />
        <span className="hidden sm:inline">{signingIn ? "Check wallet…" : "Sign in"}</span>
      </button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "pill-white inline-flex h-[var(--nav-h)] w-[var(--nav-h)] items-center justify-center gap-2.5 rounded-full text-[13px] font-semibold outline-none transition-colors hover:bg-surface-1 data-[state=open]:bg-surface-1 sm:w-auto sm:justify-start sm:pl-1.5 sm:pr-4",
          className,
        )}
        aria-label="Wallet menu"
      >
        <WalletAvatar address={address} className="size-[calc(var(--nav-h)-0.75rem)]" />
        <span className="num hidden font-mono text-xs sm:inline">{shortAddress(address, 5, 4)}</span>
        <CaretDown weight="fill" className="hidden size-3 text-foreground sm:block" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60 rounded-2xl p-1.5">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Signed in as <span className="font-mono text-foreground">{shortAddress(user?.address ?? address)}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="rounded-xl">
          <Link href="/profile">
            <Wallet weight="light" /> My portfolio
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="rounded-xl"
          onSelect={() => {
            void navigator.clipboard.writeText(address);
            toast.success("Address copied");
          }}
        >
          <Copy weight="light" /> Copy address
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="rounded-xl text-coral focus:text-coral" onSelect={signOut}>
          <SignOut weight="light" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
