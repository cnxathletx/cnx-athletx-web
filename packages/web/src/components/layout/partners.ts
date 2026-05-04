export const PARTNER_TILE_COUNT = 6

export type Partner = {
  name: string
  image: string
  href: string
}

export type PartnerPlaceholder = {
  placeholderIndex: number
}

export type PartnerTile = Partner | PartnerPlaceholder

export const partners: Partner[] = [
  {
    name: 'CNX Sports Recovery',
    image: '/images/partners/cnx-sports-recovery.png',
    href: 'https://cnxsportsrecovery.com',
  },
  {
    name: 'Rx Cafe',
    image: '/images/partners/rx-cafe.png',
    href: 'https://www.rxcafechiangmai.com',
  },
  {
    name: 'Bike Zone',
    image: '/images/partners/bike-zone.png',
    href: 'https://www.facebook.com/bikezonecm/',
  },
  {
    name: 'PADEL.CNX',
    image: '/images/partners/padel-cnx.png',
    href: 'https://www.instagram.com/padel.cnx',
  },
  {
    name: 'The Green Athlete in Chiang Mai',
    image: '/images/partners/the-green-athlete-chiang-mai.png',
    href: 'https://www.instagram.com/thegreenathletecnx',
  },
]

function shuffled<T>(items: T[], random: () => number): T[] {
  const shuffledItems = [...items]

  for (let i = shuffledItems.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    const item = shuffledItems[i]
    shuffledItems[i] = shuffledItems[j]
    shuffledItems[j] = item
  }

  return shuffledItems
}

export function buildStaticPartnerTiles(
  realPartners: Partner[],
  tileCount = PARTNER_TILE_COUNT,
  random = Math.random,
): PartnerTile[] {
  const placeholders = Array.from(
    { length: Math.max(0, tileCount - realPartners.length) },
    (_, i) => ({ placeholderIndex: realPartners.length + i + 1 }),
  )

  return shuffled([...realPartners, ...placeholders], random)
}

export function buildInitialPartnerSlots(
  partnerCount: number,
  tileCount = PARTNER_TILE_COUNT,
  random = Math.random,
): number[] {
  const slots = Array.from({ length: partnerCount }, (_, i) => i)
  return shuffled(slots, random).slice(0, Math.min(tileCount, partnerCount))
}

export function rotatePartnerSlot(
  slots: number[],
  slot: number,
  partnerCount: number,
  random = Math.random,
): number[] {
  if (partnerCount <= slots.length) return slots

  const taken = new Set(slots)
  const pool: number[] = []

  for (let i = 0; i < partnerCount; i += 1) {
    if (!taken.has(i)) pool.push(i)
  }

  if (pool.length === 0) return slots

  const next = pool[Math.floor(random() * pool.length)]
  const updated = [...slots]
  updated[slot] = next
  return updated
}
