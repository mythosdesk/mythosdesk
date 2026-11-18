import type { MarketToken } from "@elyagents/shared";
import { z } from "zod";
import { aiAvailable, aiJson } from "../ai/model";
import { candidatePayload, decisionSystemPrompt, type AgentPromptContext } from "../ai/prompts";
import { mapLimit, truncate } from "../lib/util";
import { maxRoundTripPct, routeCheck, type RouteCheck } from "./route";
import { passesScreen, rulesReason, scoreFor, screenFor } from "./screen";

export interface BrainInput {
  agent: AgentPromptContext;
  freeBalance: number;
  heldKeys: Set<string>;
  openSummary: { symbol: string; chain: string; pnlPct: number }[];
  record: { wins: number; losses: number };
  universe: MarketToken[];
}

export type BrainOutput =
  | { action: "BUY"; token: MarketToken; reason: string; source: "ai" | "rules"; confidence: number }
  | { action: "HOLD"; reason: string; outcome: string; source: "ai" | "rules" };

const DecisionSchema = z.object({
  action: z.enum(["BUY", "HOLD"]),
  candidateId: z.string().describe('Shortlist id such as "c2", or "none" when holding'),
  reason: z.string().describe("At most two short sentences citing the deciding metrics"),
  confidence: z.number().describe("0 to 1"),
});

const SHORTLIST_SIZE = 5;
/** Best-scored tokens whose routes get measured each tick. Results are cached across agents. */
const ROUTE_CHECKS = 8;

const costNote = (check: RouteCheck | null | undefined) => (check?.ok ? ` Simulated round trip costs ${check.roundTripPct.toFixed(1)}%.` : "");

/** Screen the universe, measure the best routes, keep the few worth trading, then let the AI (or rules) decide. */
export async function decide(input: BrainInput): Promise<BrainOutput> {
  const now = Date.now();
  const rules = screenFor(input.agent.strategyId);
  const scanned = input.universe.length;
  const screened = input.universe
    .filter((t) => !input.heldKeys.has(`${t.chain}:${t.address.toLowerCase()}`))
    .filter((t) => passesScreen(t, rules, now))
    .sort((a, b) => scoreFor(input.agent.strategyId, b, now) - scoreFor(input.agent.strategyId, a, now))
    .slice(0, ROUTE_CHECKS);

  if (screened.length === 0) {
    return {
      action: "HOLD",
      reason: `No candidate cleared the ${input.agent.strategyName} screen this tick.`,
      outcome: `${scanned} Robinhood Chain tokens scanned`,
      source: "rules",
    };
  }

  const limit = maxRoundTripPct(input.agent.config);
  const checks = await mapLimit(screened, 3, (t) => routeCheck(t));
  const checkOf = new Map(screened.map((t, i) => [t, checks[i]]));
  const shortlist = screened
    .filter((t) => {
      const check = checkOf.get(t);
      return check?.ok && check.roundTripPct <= limit;
    })
    .slice(0, SHORTLIST_SIZE);

  if (shortlist.length === 0) {
    const rejected = screened
      .slice(0, 3)
      .map((t) => {
        const check = checkOf.get(t);
        return `${t.symbol} ${!check ? "could not be measured" : check.ok ? `costs ${check.roundTripPct.toFixed(1)}%` : `failed: ${check.reason}`}`;
      })
      .join(", ");
    return {
      action: "HOLD",
      reason: truncate(`${screened.length} cleared the ${input.agent.strategyName} screen, none cleared the route check (limit ${limit.toFixed(1)}% round trip): ${rejected}.`, 320),
      outcome: `${scanned} Robinhood Chain tokens scanned`,
      source: "rules",
    };
  }

  if (aiAvailable("decision")) {
    const ids = new Map(shortlist.map((t, i) => [`c${i + 1}`, t]));
    const payload = {
      agent: {
        freeBalance: Math.round(input.freeBalance * 100) / 100,
        openPositions: input.openSummary,
        record: input.record,
      },
      shortlist: [...ids.entries()].map(([id, t]) => {
        const check = checkOf.get(t);
        return { ...candidatePayload(t, id, now), simulatedRoundTripCostPct: check?.ok ? check.roundTripPct : null };
      }),
    };
    const result = await aiJson({
      system: decisionSystemPrompt(input.agent),
      user: `Screened shortlist (${shortlist.length} of ${scanned} tokens scanned):\n${JSON.stringify(payload)}`,
      schema: DecisionSchema,
    });
    if (result) {
      const reason = truncate(result.reason.trim(), 320);
      if (result.action === "BUY") {
        const token = ids.get(result.candidateId.trim());
        if (token) {
          return { action: "BUY", token, reason, source: "ai", confidence: clamp01(result.confidence) };
        }
        // An id outside the shortlist is treated as an invalid response: no entry.
        return {
          action: "HOLD",
          reason: "AI response referenced a token outside the shortlist.",
          outcome: "No order sent",
          source: "ai",
        };
      }
      return {
        action: "HOLD",
        reason: reason || "Nothing on the shortlist fits the playbook right now.",
        outcome: `${scanned} Robinhood Chain tokens scanned`,
        source: "ai",
      };
    }
  }

  // Deterministic engine: best-scored candidate that passed the screen.
  const best = [...shortlist].sort(
    (a, b) => scoreFor(input.agent.strategyId, b, now) - scoreFor(input.agent.strategyId, a, now),
  )[0];
  return {
    action: "BUY",
    token: best,
    reason: rulesReason(input.agent.strategyName, best, now) + costNote(checkOf.get(best)),
    source: "rules",
    confidence: 0.5,
  };
}

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.5);
