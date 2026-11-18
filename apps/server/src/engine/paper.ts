/**
 * Showcase fill model. One credit is referenced to one US dollar. Fills use the live quote and the
 * cost measured by simulating the real route (see route.ts). That cost includes pool fees, hook fees
 * and price impact at a small size, so only the extra impact of a larger trade is added. If the route
 * could not be measured, they fall back to a swap fee of 1%, the usual fee on pons pools.
 */
const SWAP_FEE = 0.01;
/** The trade size route.ts simulates. */
const MEASURED_USD = 20;

export function priceImpact(tradeUsd: number, liquidityUsd: number): number {
  if (liquidityUsd <= 0) return 0.05;
  const reserve = liquidityUsd / 2;
  return tradeUsd / (reserve + tradeUsd);
}

function sideCost(tradeUsd: number, liquidityUsd: number, measuredPct: number | null): number {
  const impact = priceImpact(tradeUsd, liquidityUsd);
  if (measuredPct === null) return 1 - (1 - impact) * (1 - SWAP_FEE);
  const extra = Math.max(0, impact - priceImpact(MEASURED_USD, liquidityUsd));
  return 1 - (1 - extra) * (1 - measuredPct / 100);
}

export function paperBuy(spend: number, priceUsd: number, liquidityUsd: number, measuredCostPct: number | null = null) {
  const cost = sideCost(spend, liquidityUsd, measuredCostPct);
  const quantity = (spend * (1 - cost)) / priceUsd;
  return { quantity, effectivePrice: priceUsd / (1 - cost), cost };
}

export function paperSell(quantity: number, priceUsd: number, liquidityUsd: number, measuredCostPct: number | null = null) {
  const gross = quantity * priceUsd;
  const cost = sideCost(gross, liquidityUsd, measuredCostPct);
  return { proceeds: gross * (1 - cost), cost };
}
