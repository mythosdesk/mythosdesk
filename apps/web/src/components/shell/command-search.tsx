"use client";

import { ArrowRight, Coins, MagnifyingGlass } from "@phosphor-icons/react";
import { CHAINS, looksLikeAddress } from "@elyagents/shared";
import { AgentPortrait } from "@/components/agents/agent-bits";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useAgents, useLaunches } from "@/lib/queries";
import { CREATE_NAV, MORE_NAV, PRIMARY_NAV } from "./nav-items";

export function CommandSearch({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const agents = useAgents();
  const launches = useLaunches();
  const go = (href: string, external = false) => {
    onOpenChange(false);
    setQuery("");
    if (external) window.open(href, "_blank", "noopener,noreferrer");
    else router.push(href);
  };
  const address = looksLikeAddress(query.trim());

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Search" description="Search agents, tokens and pages" className="top-[8vh] sm:top-[16vh]">
      {/* This CommandDialog does not provide the cmdk context itself; without <Command> the input crashes on open. */}
      <Command>
        <CommandInput placeholder="Search agents, tokens, launches — or paste a contract" value={query} onValueChange={setQuery} />
        <CommandList className="max-h-[min(60vh,440px)]">
          <CommandEmpty>Nothing matches “{query}”.</CommandEmpty>
          {address && (
            <CommandGroup heading="Contract">
              <CommandItem value={`contract robinhood ${query}`} onSelect={() => go(`/tokens/robinhood/${query.trim()}`)}>
                <Coins weight="light" /> Open on {CHAINS.robinhood.name}
                <ArrowRight weight="light" className="ml-auto" />
              </CommandItem>
            </CommandGroup>
          )}
          <CommandGroup heading="Agents">
            {(agents.data ?? []).slice(0, 40).map((agent) => (
              <CommandItem key={agent.id} value={`${agent.name} ${agent.strategyName} ${agent.symbol}`} onSelect={() => go(`/agent/${agent.id}`)}>
                <AgentPortrait characterId={agent.characterId} size={24} rounded="rounded-md" />
                <span>{agent.name}</span>
                <span className="text-xs text-muted-foreground">{agent.strategyName}</span>
              </CommandItem>
            ))}
          </CommandGroup>
          {(launches.data?.length ?? 0) > 0 && (
            <CommandGroup heading="Launches">
              {launches.data!.slice(0, 20).map((l) => (
                <CommandItem key={l.id} value={`${l.name} ${l.symbol} ${l.tokenAddress}`} onSelect={() => go(`/tokens/${l.chain}/${l.tokenAddress}`)}>
                  <Coins weight="light" /> {l.name} <span className="text-xs text-muted-foreground">${l.symbol}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          <CommandGroup heading="Pages">
            {[...PRIMARY_NAV, ...CREATE_NAV, ...MORE_NAV].map((item) => (
              <CommandItem key={item.href} value={`page ${item.label} ${item.description}`} onSelect={() => go(item.href, item.external)}>
                <item.icon weight="light" /> {item.label}
                <span className="ml-auto text-xs text-muted-foreground">{item.description}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
      <div className="flex items-center gap-2 border-t border-hairline px-4 py-2.5 text-[11px] text-muted-foreground">
        <MagnifyingGlass weight="light" className="size-3.5" /> Tip: paste any Robinhood Chain contract to open its market page.
      </div>
    </CommandDialog>
  );
}
