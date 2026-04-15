import { apiUrl } from './client'

export interface PublicSettings {
  shipping_flat_rate: number
  shipping_free_threshold: number
}

let cache: PublicSettings | null = null
let inflight: Promise<PublicSettings> | null = null

export async function fetchPublicSettings(): Promise<PublicSettings> {
  if (cache) return cache
  if (inflight) return inflight

  inflight = (async () => {
    const res = await fetch(apiUrl('/api/settings'))
    if (!res.ok) throw new Error('Failed to fetch settings')
    const data = (await res.json()) as { settings: PublicSettings }
    cache = data.settings
    return data.settings
  })()

  try {
    return await inflight
  } finally {
    inflight = null
  }
}
