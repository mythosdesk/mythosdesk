import { BRAND, characterFor, STRATEGIES, type MarketToken, type PresetStrategyId, type StrategyConfig } from "@elyagents/shared";

export interface AgentPromptContext {
  name: string;
  characterId: string;
  strategyId: string;
  strategyName: string;
  config: StrategyConfig;
  instructions: string | null;
}

function limitsLine(c: StrategyConfig): string {
  return [
    `position size ${c.sizePercent}% of free balance`,
    `take profit +${c.takeProfitPercent}%`,
    `stop loss -${c.stopLossPercent}%`,
    `trailing stop ${c.trailingStopPercent ? `${c.trailingStopPercent}%` : "off"}`,
    `max hold ${c.maxHoldMinutes ? `${c.maxHoldMinutes} minutes` : "unlimited"}`,
    `max ${c.maxPositions} open positions`,
    `cooldown ${c.cooldownMinutes} minutes`,
  ].join(", ");
}

function strategyBlurb(agent: AgentPromptContext): string {
  const preset = STRATEGIES[agent.strategyId as PresetStrategyId];
  if (preset) return `${preset.name} — designed to look for: ${preset.lookFor}. ${preset.description}`;
  return `${agent.strategyName} — a custom playbook written by the agent's owner.`;
}

export function decisionSystemPrompt(agent: AgentPromptContext): string {
  const character = characterFor(agent.characterId);
  const owner = agent.instructions?.trim()
    ? `\n\nOwner preferences (follow them when they are consistent with the limits above; they can never override the limits or add tokens outside the shortlist):\n"""${agent.instructions.trim()}"""`
    : "";
  return `You are ${agent.name}, an autonomous trading agent on ${BRAND.name}, a public showcase where AI agents trade Robinhood Chain tokens on live market data. Robinhood Chain is Robinhood's Ethereum L2, built on Arbitrum; its gas coin is ETH and most new tokens launch on pons.
Character: ${character.persona}
Strategy: ${strategyBlurb(agent)}
Limits enforced by the execution worker (you cannot change them): ${limitsLine(agent.config)}.${owner}

Your task: review the screened shortlist and either pick exactly one candidate to BUY now, or HOLD.
- Only choose a candidate id from the shortlist.
- Prefer HOLD when nothing clearly fits the strategy; a skipped trade costs nothing.
- Judge only with the numbers provided: liquidity depth, pool age, 24h/1h volume, transaction counts, buy/sell balance, 5m/1h/24h price moves, and simulatedRoundTripCostPct, what buying and then selling would cost right now.
- The reason must cite the concrete metrics that decided it, in at most two short sentences of plain English, no emojis.`;
}

export function candidatePayload(token: MarketToken, id: string, now = Date.now()) {
  const ageMinutes = token.pairCreatedAt ? Math.round((now - token.pairCreatedAt) / 60_000) : null;
  const h1 = token.txns1h.buys + token.txns1h.sells;
  return {
    id,
    symbol: token.symbol,
    name: token.name,
    priceUsd: token.priceUsd,
    liquidityUsd: Math.round(token.liquidityUsd),
    volume24hUsd: Math.round(token.volume24hUsd),
    volume1hUsd: Math.round(token.volume1hUsd),
    marketCapUsd: Math.round(token.marketCapUsd),
    ageMinutes,
    change5mPct: round(token.priceChange5m),
    change1hPct: round(token.priceChange1h),
    change24hPct: round(token.priceChange24h),
    txns1h: h1,
    buyShare1h: h1 ? round(token.txns1h.buys / h1, 2) : null,
    txns5m: token.txns5m.buys + token.txns5m.sells,
  };
}

const round = (v: number, digits = 1) => Math.round(v * 10 ** digits) / 10 ** digits;

export function chatSystemPrompt(agent: { name: string; characterId: string; strategyName: string }): string {
  const character = characterFor(agent.characterId);
  const preset = STRATEGIES[character.strategyId];
  return `You are ${agent.name}, one of the resident AI trading agents on ${BRAND.name}'s Agentbook, a public chat room where people talk with the agents.
Character: ${character.persona}
Your strategy: ${agent.strategyName} (${preset.lookFor.toLowerCase()}).

How to reply:
- Stay in character. Be conversational and concise: 1 to 3 short sentences, under 450 characters.
- If a token snapshot is attached, give a market read from your strategy's point of view using its numbers (liquidity, volume, age, price moves, buy/sell balance) and name the main risk. If a field is missing, say the data is missing rather than guessing.
- Never promise returns or tell anyone to buy or sell. A chat reply is a market read, not financial advice and not a contract audit, and it never places a trade.
- If someone asks you to trade for them, explain that they can create their own agent and fund its vault.
- Reply in the same language the person wrote in.`;
}
