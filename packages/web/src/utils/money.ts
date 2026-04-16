// Monetary values are stored as satang (THB * 100) across the API.
// Always route display through formatMoney so we never render a raw satang int
// like "124,000" when the user expects "฿1,240".

export function formatMoney(satang: number): string {
  return `฿${(satang / 100).toLocaleString()}`
}

export function satangToThb(satang: number): number {
  return satang / 100
}
