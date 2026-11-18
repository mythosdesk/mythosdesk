"use client";

import type { AgentDetail, AgentSummary, Decision, FloorMessage } from "@elyagents/shared";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ConnectDialog } from "@/components/wallet/connect-dialog";
import { SessionProvider } from "@/lib/session";
import { useSocketEvent } from "@/lib/socket";
import { qk, type FeedFilter } from "@/lib/queries";
import { wagmiConfig } from "@/lib/wagmi";

/** Pushes realtime server events into the React Query cache. */
function RealtimeBridge() {
  const qc = useQueryClient();

  useSocketEvent("feed:decision", (decision: Decision) => {
    const filters: FeedFilter[] = ["ALL", decision.action];
    for (const filter of filters) {
      for (const agentKey of ["all", decision.agentId]) {
        qc.setQueryData<{ decisions: Decision[]; counts: Partial<Record<FeedFilter, number>> }>(
          ["feed", filter, agentKey],
          (prev) => {
            if (!prev || prev.decisions.some((d) => d.id === decision.id)) return prev;
            const counts = { ...prev.counts, [decision.action]: (prev.counts[decision.action] ?? 0) + 1 };
            return { decisions: [decision, ...prev.decisions].slice(0, 80), counts };
          },
        );
      }
    }
  });

  useSocketEvent("agent:update", (agent: AgentSummary) => {
    qc.setQueriesData<AgentSummary[]>({ queryKey: ["agents"] }, (prev) =>
      prev ? prev.map((a) => (a.id === agent.id ? { ...a, ...agent, openPositions: agent.openPositions } : a)) : prev,
    );
    qc.setQueryData<AgentDetail>(qk.agent(agent.id), (prev) => (prev ? { ...prev, agent: { ...prev.agent, ...agent } } : prev));
    void qc.invalidateQueries({ queryKey: qk.agent(agent.id), refetchType: "active" });
  });

  useSocketEvent("trade:new", () => {
    void qc.invalidateQueries({ queryKey: qk.trades });
  });

  useSocketEvent("stats:update", (stats) => {
    qc.setQueryData(qk.stats, stats);
    void qc.invalidateQueries({ queryKey: ["leaderboard"], refetchType: "active" });
  });

  useSocketEvent("floor:message", (message: FloorMessage) => {
    const tabs = ["conversation", ...(message.token ? ["token"] : []), ...(message.authorType === "AGENT" ? ["agent"] : [])];
    for (const tab of tabs) {
      qc.setQueryData<FloorMessage[]>(["floor", tab], (prev) =>
        prev && !prev.some((m) => m.id === message.id) ? [...prev, message].slice(-200) : prev,
      );
    }
    if (message.token) void qc.invalidateQueries({ queryKey: qk.floorTable });
  });

  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 15_000, refetchOnWindowFocus: false, retry: 1 },
        },
      }),
  );
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <TooltipProvider delayDuration={150}>
            <RealtimeBridge />
            {children}
            <ConnectDialog />
            <Toaster position="bottom-right" />
          </TooltipProvider>
        </SessionProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
