import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchCloudflareVisitors } from './reports'
import type { Env } from '../../lib/types'

describe('fetchCloudflareVisitors', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns visitor totals from Cloudflare analytics aliases', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        data: {
          viewer: {
            zones: [{
              today: [{ sum: { visits: 8 } }],
              week: [{ sum: { visits: 40 } }],
              month: [{ sum: { visits: 120 } }],
            }],
          },
        },
      }), { status: 200 }),
    ))

    const env = {
      CLOUDFLARE_API_TOKEN: 'token',
      CLOUDFLARE_ZONE_ID: 'zone',
    } as Env

    const visitors = await fetchCloudflareVisitors(env, {
      today: new Date('2026-05-06T17:00:00.000Z'),
      week: new Date('2026-05-03T17:00:00.000Z'),
      month: new Date('2026-04-30T17:00:00.000Z'),
      nextDay: new Date('2026-05-07T17:00:00.000Z'),
    })

    expect(visitors).toEqual({
      status: 'ok',
      today: 8,
      week: 40,
      month: 120,
    })
    expect(fetch).toHaveBeenCalledWith(
      'https://api.cloudflare.com/client/v4/graphql',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer token' }),
      }),
    )
  })
})
