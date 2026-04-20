export interface PriceTier {
  min_quantity: number
  unit_price_thb: number
}

/**
 * Pick best (lowest) unit price for a given quantity.
 * Mirror of packages/api/src/lib/pricing.ts — keep in sync.
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

export function nextTier(tiers: PriceTier[], quantity: number): PriceTier | null {
  const sorted = sortTiers(tiers)
  for (const t of sorted) {
    if (quantity < t.min_quantity) return t
  }
  return null
}

export function savingsPercent(basePrice: number, tierPrice: number): number {
  if (basePrice <= 0) return 0
  return Math.round(((basePrice - tierPrice) / basePrice) * 100)
}
