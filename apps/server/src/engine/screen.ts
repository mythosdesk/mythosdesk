import {
  CUSTOM_SCREEN,
  STRATEGIES,
  type MarketToken,
  type PresetStrategyId,
  type ScreenRules,
} from "@elyagents/shared";
import { fmtPct, fmtUsd } from "../lib/util";

export function screenFor(strategyId: string): ScreenRules {
  return STRATEGIES[strategyId as PresetStrategyId]?.screen ?? CUSTOM_SCREEN;
}

const ageMinutes = (t: MarketToken, now: number) =>
  t.pairCreatedAt ? (now - t.pairCreatedAt) / 60_000 : Number.POSITIVE_INFINITY;

const buyShare = (t: MarketToken) => {
  const total = t.txns1h.buys + t.txns1h.sells;
  return total ? t.txns1h.buys / total : 0;
};

export function passesScreen(t: MarketToken, rules: ScreenRules, now = Date.now()): boolean {
  const age = ageMinutes(t, now);
  const txns = t.txns1h.buys + t.txns1h.sells;
  return (
    t.priceUsd > 0 &&
    t.liquidityUsd >= rules.minLiquidityUsd &&
    t.volume24hUsd >= rules.minVolume24hUsd &&
    age >= rules.minAgeMinutes &&
    (rules.maxAgeMinutes === null || age <= rules.maxAgeMinutes) &&
    t.priceChange5m >= rules.change5m[0] &&
    t.priceChange5m <= rules.change5m[1] &&
    t.priceChange1h >= rules.change1h[0] &&
    t.priceChange1h <= rules.change1h[1] &&
    txns >= rules.minTxns1h &&
    buyShare(t) >= rules.minBuyRatio &&
    (rules.maxBuyRatio === undefined || buyShare(t) <= rules.maxBuyRatio)
  );
}

const log10 = (v: number) => Math.log10(Math.max(1, v));

/** Strategy-flavoured ranking used for shortlists and the rules engine. */
export function scoreFor(strategyId: string, t: MarketToken, now = Date.now()): number {
  const age = Math.min(ageMinutes(t, now), 60 * 24 * 365);
  const share = buyShare(t);
  const txns5m = t.txns5m.buys + t.txns5m.sells;
  const txns1h = t.txns1h.buys + t.txns1h.sells;
  switch (strategyId) {
    case "anchor":
      return log10(t.liquidityUsd) * 2 + log10(age) - Math.abs(t.priceChange5m) / 3 - Math.abs(t.priceChange1h) / 8;
    case "quickdraw":
      return t.priceChange5m * 1.5 + log10(txns5m + 1) * 3 + share * 4;
    case "breakout":
      return t.priceChange1h / 6 + log10(txns1h) * 2 + share * 5 + log10(t.volume1hUsd);
    case "bounceback":
      return -t.priceChange1h / 3 + t.priceChange5m * 2 + share * 3 + log10(t.liquidityUsd) / 2;
    case "signal-hunter":
      return log10(t.liquidityUsd) + log10(t.volume24hUsd) + log10(txns1h) + t.priceChange5m / 2 + share * 4;
    case "fresh-hunt":
      return log10(txns5m + 1) * 3 + share * 5 - age / 90 + log10(t.liquidityUsd) / 2;
    default:
      return log10(t.liquidityUsd) + log10(t.volume24hUsd) + t.priceChange5m / 3 + share * 3;
  }
}

/** Plain-English justification used when the rules engine makes the call. */
export function rulesReason(strategyName: string, t: MarketToken, now = Date.now()): string {
  const age = ageMinutes(t, now);
  const ageText = !Number.isFinite(age)
    ? "unknown age"
    : age < 120
      ? `${Math.round(age)}m old`
      : age < 60 * 48
        ? `${Math.round(age / 60)}h old`
        : `${Math.round(age / 1440)}d old`;
  const share = Math.round(buyShare(t) * 100);
  const txns1h = t.txns1h.buys + t.txns1h.sells;
  return `${strategyName} · ${t.symbol}: ${fmtUsd(t.liquidityUsd)} liquidity, ${ageText}, ${fmtPct(
    t.priceChange5m,
  )} 5m / ${fmtPct(t.priceChange1h)} 1h with ${txns1h} txns last hour (${share}% buys).`;
}
