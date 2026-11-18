"use client";

import type {
  AgentDetail,
  AgentSummary,
  ChainKey,
  Decision,
  FloorMessage,
  FloorTab,
  FloorTokenRef,
  Launch,
  LaunchConfig,
  LeaderboardRow,
  MarketFeed,
  MarketToken,
  MyAgent,
  PlatformStats,
  ProofReport,
  Trade,
} from "@elyagents/shared";
import { keepPreviousData, useQuery as useRQ, type DefaultError, type QueryKey, type UseQueryOptions, type UseQueryResult } from "@tanstack/react-query";
import { api } from "./api";
import { useSession } from "./session";
import { useHydrated } from "./use-hydrated";

/**
 * Query data can arrive before a later route segment hydrates (streaming).
 * Report "pending" until hydration finishes so the first render matches SSR.
 */
function useQuery<TData, TKey extends QueryKey = QueryKey>(
  options: UseQueryOptions<TData, DefaultError, TData, TKey>,
): UseQueryResult<TData> {
  const hydrated = useHydrated();
  const result = useRQ(options);
  if (hydrated) return result;
  return { ...result, data: undefined, isPending: true, isLoading: true, isSuccess: false, status: "pending" } as UseQueryResult<TData>;
}

export type FeedFilter = "ALL" | "BUY" | "SELL" | "HOLD";
export type RecentTrade = Trade & { agentName: string; imageUri: string; characterId: string };

export const qk = {
  stats: ["stats"] as const,
  agents: (kind?: string, strategy?: string) => ["agents", kind ?? "all", strategy ?? "all"] as const,
  agent: (id: string) => ["agent", id] as const,
  feed: (action: FeedFilter, agentId?: string) => ["feed", action, agentId ?? "all"] as const,
  leaderboard: (family?: string) => ["leaderboard", family ?? "all"] as const,
  trades: ["trades", "recent"] as const,
  markets: (chain: ChainKey, feed: MarketFeed, q: string) => ["markets", chain, feed, q] as const,
  token: (chain: string, address: string) => ["token", chain, address.toLowerCase()] as const,
  ohlcv: (chain: string, address: string, tf: string, pool?: string | null) => ["ohlcv", chain, address.toLowerCase(), tf, pool ?? ""] as const,
  launches: ["launches"] as const,
  launchConfig: ["launch-config"] as const,
  floor: (tab: FloorTab) => ["floor", tab] as const,
  floorTable: ["floor", "table"] as const,
  myAgents: ["me", "agents"] as const,
  myAgent: (id: string) => ["me", "agent", id] as const,
  ca: ["ca"] as const,
  burns: ["burns"] as const,
  proof: ["proof"] as const,
};

export function useStats() {
  return useQuery({ queryKey: qk.stats, queryFn: () => api<PlatformStats>("/stats"), refetchInterval: 30_000 });
}

export function useAgents(kind?: string, strategy?: string) {
  return useQuery({
    queryKey: qk.agents(kind, strategy),
    queryFn: () => {
      const qs = new URLSearchParams();
      if (kind) qs.set("kind", kind);
      if (strategy) qs.set("strategy", strategy);
      return api<{ agents: AgentSummary[] }>(`/agents?${qs}`).then((r) => r.agents);
    },
    refetchInterval: 60_000,
    placeholderData: keepPreviousData,
  });
}

export function useAgent(id: string) {
  return useQuery({
    queryKey: qk.agent(id),
    queryFn: () => api<AgentDetail>(`/agents/${encodeURIComponent(id)}`),
    refetchInterval: 30_000,
    enabled: Boolean(id),
  });
}

export function useFeed(action: FeedFilter = "ALL", agentId?: string, limit = 40) {
  return useQuery({
    queryKey: qk.feed(action, agentId),
    queryFn: () => {
      const qs = new URLSearchParams({ limit: String(limit) });
      if (action !== "ALL") qs.set("action", action);
      if (agentId) qs.set("agentId", agentId);
      return api<{ decisions: Decision[]; counts: Partial<Record<FeedFilter, number>> }>(`/agents/feed?${qs}`);
    },
    refetchInterval: 60_000,
    placeholderData: keepPreviousData,
  });
}

export function useLeaderboard(family?: string) {
  return useQuery({
    queryKey: qk.leaderboard(family),
    queryFn: () => api<{ rows: LeaderboardRow[]; families: string[] }>(`/leaderboard${family ? `?family=${family}` : ""}`),
    refetchInterval: 60_000,
    placeholderData: keepPreviousData,
  });
}

export function useRecentTrades(limit = 12) {
  return useQuery({
    queryKey: qk.trades,
    queryFn: () => api<{ trades: RecentTrade[] }>(`/trades/recent?limit=${limit}`).then((r) => r.trades),
    refetchInterval: 45_000,
  });
}

export function useMarkets(chain: ChainKey, feed: MarketFeed, q: string) {
  return useQuery({
    queryKey: qk.markets(chain, feed, q),
    queryFn: () =>
      api<{ tokens: MarketToken[]; eligibility: Record<string, number>; health: { tokens: number; at: string | null } }>(
        `/markets?${new URLSearchParams({ chain, feed, ...(q ? { q } : {}) })}`,
      ),
    refetchInterval: 60_000,
    placeholderData: keepPreviousData,
  });
}

export interface TokenDetail {
  token: MarketToken | null;
  pools: MarketToken[];
  launch: Launch | null;
  agentHolders: { id: string; name: string; imageUri: string; characterId: string; lastValue: number; costValue: number }[];
}

export function useToken(chain: string, address: string) {
  return useQuery({
    queryKey: qk.token(chain, address),
    queryFn: () => api<TokenDetail>(`/tokens/${chain}/${address}`),
    refetchInterval: 30_000,
    enabled: Boolean(chain && address),
  });
}

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export function useOhlcv(chain: string, address: string, tf: string, pool?: string | null) {
  return useQuery({
    queryKey: qk.ohlcv(chain, address, tf, pool),
    queryFn: () =>
      api<{ candles: Candle[]; pool: string | null }>(
        `/tokens/${chain}/${address}/ohlcv?tf=${tf}${pool ? `&pool=${pool}` : ""}`,
      ),
    refetchInterval: 60_000,
    placeholderData: keepPreviousData,
  });
}

export function useLaunches() {
  return useQuery({ queryKey: qk.launches, queryFn: () => api<{ tokens: Launch[] }>("/launches").then((r) => r.tokens), refetchInterval: 60_000 });
}

export function useLaunchConfig() {
  return useQuery({ queryKey: qk.launchConfig, queryFn: () => api<LaunchConfig>("/launches/config") });
}

export function useFloor(tab: FloorTab) {
  return useQuery({
    queryKey: qk.floor(tab),
    queryFn: () => api<{ messages: FloorMessage[] }>(`/floor?tab=${tab}`).then((r) => r.messages),
    refetchInterval: 120_000,
  });
}

export function useFloorTable() {
  return useQuery({
    queryKey: qk.floorTable,
    queryFn: () => api<{ tokens: FloorTokenRef[] }>("/floor/table").then((r) => r.tokens),
    refetchInterval: 60_000,
  });
}

export function useMyAgents() {
  const { user } = useSession();
  return useQuery({
    queryKey: qk.myAgents,
    queryFn: () => api<{ agents: MyAgent[] }>("/me/agents").then((r) => r.agents),
    enabled: Boolean(user),
    refetchInterval: 30_000,
  });
}

export function useProof() {
  return useQuery({ queryKey: qk.proof, queryFn: () => api<ProofReport>("/proof"), refetchInterval: 60_000 });
}

export function useCa() {
  return useQuery({ queryKey: qk.ca, queryFn: () => api<{ ca: string | null; chain: ChainKey; chainName: string }>("/ca"), staleTime: 300_000 });
}

export function useBurns() {
  return useQuery({
    queryKey: qk.burns,
    queryFn: () =>
      api<{
        ca: string | null;
        chain: ChainKey;
        token: MarketToken | null;
        burns: { id: string; usdSpent: number; amountBurned: number; txHash: string; createdAt: string; explorer: string }[];
        status: string;
      }>("/burns"),
    refetchInterval: 60_000,
  });
}
