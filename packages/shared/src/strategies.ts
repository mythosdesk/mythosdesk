export const STRATEGY_IDS = [
  "anchor",
  "quickdraw",
  "breakout",
  "bounceback",
  "signal-hunter",
  "fresh-hunt",
] as const;

export type PresetStrategyId = (typeof STRATEGY_IDS)[number];
export type StrategyId = PresetStrategyId | "custom";

/** Rules the worker enforces regardless of what the AI decides. */
export interface StrategyConfig {
  /** Percent of available cash committed per entry. */
  sizePercent: number;
  takeProfitPercent: number;
  stopLossPercent: number;
  /** Trails the recorded position peak once it rises above cost. null = off. */
  trailingStopPercent: number | null;
  /** null = no fixed limit. */
  maxHoldMinutes: number | null;
  maxPositions: number;
  cooldownMinutes: number;
}

/** Market screen applied before any candidate reaches the AI. */
export interface ScreenRules {
  minLiquidityUsd: number;
  minVolume24hUsd: number;
  minAgeMinutes: number;
  maxAgeMinutes: number | null;
  /** Inclusive band for the 5 minute price change, in percent. */
  change5m: [number, number];
  /** Inclusive band for the 1 hour price change, in percent. */
  change1h: [number, number];
  minTxns1h: number;
  /** Buys / (buys + sells) over the last hour. */
  minBuyRatio: number;
  /**
   * Upper bound on the same ratio. Pools where almost nobody sells are a
   * classic honeypot pattern, so a cap proves that sells go through.
   */
  maxBuyRatio?: number;
}

export interface StrategyPreset {
  id: PresetStrategyId;
  name: string;
  tagline: string;
  description: string;
  lookFor: string;
  risk: "Low" | "Medium" | "High";
  config: StrategyConfig;
  screen: ScreenRules;
}

export const STRATEGIES: Record<PresetStrategyId, StrategyPreset> = {
  anchor: {
    id: "anchor",
    name: "Liquidity",
    tagline: "Deep liquidity. Measured entries. Wider stops.",
    description:
      "Only trades the deepest, most seasoned pools on Robinhood Chain. Gives positions room to develop with a wider exit range and no time limit.",
    lookFor: "Measured entries in deep, older pools",
    risk: "Low",
    config: {
      sizePercent: 10,
      takeProfitPercent: 40,
      stopLossPercent: 20,
      trailingStopPercent: null,
      maxHoldMinutes: null,
      maxPositions: 3,
      cooldownMinutes: 0,
    },
    screen: {
      minLiquidityUsd: 60_000,
      minVolume24hUsd: 30_000,
      minAgeMinutes: 24 * 60,
      maxAgeMinutes: null,
      change5m: [-3, 6],
      change1h: [-10, 15],
      minTxns1h: 10,
      minBuyRatio: 0.4,
    },
  },
  quickdraw: {
    id: "quickdraw",
    name: "Scalp",
    tagline: "Quick momentum scalps. Tight exits.",
    description:
      "Scalps short momentum windows with tight exits and a ten minute clock on every position.",
    lookFor: "Short momentum windows with active trading",
    risk: "High",
    config: {
      sizePercent: 10,
      takeProfitPercent: 6,
      stopLossPercent: 3,
      trailingStopPercent: 2,
      maxHoldMinutes: 10,
      maxPositions: 2,
      cooldownMinutes: 10,
    },
    screen: {
      minLiquidityUsd: 12_000,
      minVolume24hUsd: 20_000,
      minAgeMinutes: 30,
      maxAgeMinutes: null,
      change5m: [0.2, 15],
      change1h: [-2, 80],
      minTxns1h: 25,
      minBuyRatio: 0.45,
    },
  },
  breakout: {
    id: "breakout",
    name: "Breakout",
    tagline: "Rides breakouts with volume confirmation.",
    description:
      "Looks for positive momentum that is backed by real transactions, then trails the move.",
    lookFor: "Positive momentum with transaction confirmation",
    risk: "Medium",
    config: {
      sizePercent: 15,
      takeProfitPercent: 15,
      stopLossPercent: 6,
      trailingStopPercent: 5,
      maxHoldMinutes: 60,
      maxPositions: 2,
      cooldownMinutes: 0,
    },
    screen: {
      minLiquidityUsd: 15_000,
      minVolume24hUsd: 25_000,
      minAgeMinutes: 90,
      maxAgeMinutes: null,
      change5m: [0, 15],
      change1h: [2, 120],
      minTxns1h: 30,
      minBuyRatio: 0.45,
    },
  },
  bounceback: {
    id: "bounceback",
    name: "Buy Dip",
    tagline: "Buys controlled dips once they turn.",
    description:
      "Waits for a controlled pullback, then buys the dip when the five minute candle turns back up.",
    lookFor: "Dips that start to recover after a controlled pullback",
    risk: "Medium",
    config: {
      sizePercent: 12,
      takeProfitPercent: 10,
      stopLossPercent: 5,
      trailingStopPercent: 3,
      maxHoldMinutes: 30,
      maxPositions: 2,
      cooldownMinutes: 0,
    },
    screen: {
      minLiquidityUsd: 15_000,
      minVolume24hUsd: 20_000,
      minAgeMinutes: 180,
      maxAgeMinutes: null,
      change5m: [0, 6],
      change1h: [-25, -1],
      minTxns1h: 10,
      minBuyRatio: 0.42,
    },
  },
  "signal-hunter": {
    id: "signal-hunter",
    name: "Signal Hunter",
    tagline: "Hunts the busiest coins when the signals align.",
    description:
      "Watches the busiest coins on Robinhood Chain, but only fires when liquidity, volume, activity and momentum line up at once. One position at a time, with a cooldown.",
    lookFor: "Busy coins where liquidity, volume, activity and momentum align",
    risk: "Medium",
    config: {
      sizePercent: 20,
      takeProfitPercent: 12,
      stopLossPercent: 5,
      trailingStopPercent: 5,
      maxHoldMinutes: 45,
      maxPositions: 1,
      cooldownMinutes: 20,
    },
    screen: {
      minLiquidityUsd: 25_000,
      minVolume24hUsd: 50_000,
      minAgeMinutes: 60,
      maxAgeMinutes: null,
      change5m: [0, 10],
      change1h: [-1, 40],
      minTxns1h: 40,
      minBuyRatio: 0.45,
    },
  },
  "fresh-hunt": {
    id: "fresh-hunt",
    name: "Fresh Pools",
    tagline: "New pools, safety checks first. Tiny size.",
    description:
      "Scouts pools that are only minutes or hours old and screens them for safety first: real liquidity, real activity and sells that actually go through. Tiny size, wide target, short clock.",
    lookFor: "New pools with early participation that pass basic safety checks",
    risk: "High",
    config: {
      sizePercent: 4,
      takeProfitPercent: 35,
      stopLossPercent: 15,
      trailingStopPercent: null,
      maxHoldMinutes: 8,
      maxPositions: 1,
      cooldownMinutes: 15,
    },
    screen: {
      minLiquidityUsd: 5_000,
      minVolume24hUsd: 3_000,
      minAgeMinutes: 5,
      maxAgeMinutes: 6 * 60,
      change5m: [-8, 30],
      change1h: [-30, 300],
      minTxns1h: 15,
      minBuyRatio: 0.5,
      maxBuyRatio: 0.85,
    },
  },
};

export const PRESET_LIST: StrategyPreset[] = STRATEGY_IDS.map((id) => STRATEGIES[id]);

/** Screen used by custom playbooks: a balanced middle ground. */
export const CUSTOM_SCREEN: ScreenRules = {
  minLiquidityUsd: 50_000,
  minVolume24hUsd: 75_000,
  minAgeMinutes: 60,
  maxAgeMinutes: null,
  change5m: [-3, 12],
  change1h: [-10, 50],
  minTxns1h: 40,
  minBuyRatio: 0.48,
};

export const STRATEGY_LIMITS = {
  sizePercent: [1, 50],
  takeProfitPercent: [1, 500],
  stopLossPercent: [1, 90],
  trailingStopPercent: [1, 50],
  maxHoldMinutes: [1, 7 * 24 * 60],
  maxPositions: [1, 10],
  cooldownMinutes: [0, 24 * 60],
  instructionsMaxChars: 2000,
} as const;

export function strategyName(id: string, customName?: string | null): string {
  if (id === "custom") return customName?.trim() || "My Playbook";
  return STRATEGIES[id as PresetStrategyId]?.name ?? id;
}
