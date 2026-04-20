export interface PriceTier {
  min_quantity: number
  unit_price_thb: number
}

/**
 * Pick the best (lowest) unit price for a given quantity, given the base price
 * and an unordered list of volume tiers. A tier applies when qty >= min_quantity.
 * Defensive against misconfigured tiers (tier price higher than base is ignored).
 */
export function pickUnitPrice(basePrice: number, tiers: PriceTier[], quantity: number): number {
  let best = basePrice
  for (const t of tiers) {
    if (quantity >= t.min_quantity && t.unit_price_thb < best) {
      best = t.unit_price_thb
    }
  }
  return best
}

export function sortTiers<T extends PriceTier>(tiers: T[]): T[] {
  return [...tiers].sort((a, b) => a.min_quantity - b.min_quantity)
}
