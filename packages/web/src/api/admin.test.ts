import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchAdminAnalyticsReport } from './admin'

describe('admin API', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('fetches the analytics report', async () => {
    const payload = {
      visitors: { status: 'ok', today: 12, week: 45, month: 100 },
      orders: { today: 1, week: 4, month: 9 },
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify(payload), { status: 200 }),
    ))

    await expect(fetchAdminAnalyticsReport()).resolves.toEqual(payload)
    expect(fetch).toHaveBeenCalledWith('/api/admin/reports/analytics', {
      credentials: 'include',
    })
  })
})
