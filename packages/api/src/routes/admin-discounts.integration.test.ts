import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { startWorker, stopWorker, resetDb, workerFetch } from '../test/helpers'

beforeAll(async () => { await startWorker() })
afterAll(async () => { await stopWorker() })

describe('Admin Discount Codes API', () => {
  beforeEach(async () => { await resetDb() })

  // --- GET /api/admin/discount-codes ---

  describe('GET /api/admin/discount-codes', () => {
    it('returns all seeded discount codes', async () => {
      const res = await workerFetch('/api/admin/discount-codes', { admin: true })
      expect(res.status).toBe(200)
      const data = await res.json() as { discount_codes: Array<{ code: string; type: string; active: boolean }> }
      expect(data.discount_codes.length).toBeGreaterThanOrEqual(6) // 6 seeded codes
      const codes = data.discount_codes.map((d) => d.code)
      expect(codes).toContain('SAVE100')
      expect(codes).toContain('PERCENT20')
      expect(codes).toContain('INACTIVE')
    })

  })

  // --- POST /api/admin/discount-codes ---

  describe('POST /api/admin/discount-codes', () => {
    it('creates a fixed discount code', async () => {
      const res = await workerFetch('/api/admin/discount-codes', {
        admin: true,
        body: {
          code: 'NEWCODE',
          type: 'fixed',
          value: 5000,
          min_order_thb: 0,
          max_uses: null,
          active: true,
          expires_at: null,
        },
      })
      expect(res.status).toBe(201)
      const data = await res.json() as { success: boolean; discount_code: { code: string; type: string; value: number } }
      expect(data.success).toBe(true)
      expect(data.discount_code.code).toBe('NEWCODE')
      expect(data.discount_code.type).toBe('fixed')
      expect(data.discount_code.value).toBe(5000)
    })

    it('creates a percent discount code', async () => {
      const res = await workerFetch('/api/admin/discount-codes', {
        admin: true,
        body: {
          code: 'HALF-OFF',
          type: 'percent',
          value: 50,
          min_order_thb: 100000,
          max_uses: 10,
          active: true,
          expires_at: '2027-12-31T23:59:59.000Z',
        },
      })
      expect(res.status).toBe(201)
      const data = await res.json() as { discount_code: { code: string; type: string; value: number; max_uses: number; min_order_thb: number } }
      expect(data.discount_code.code).toBe('HALF-OFF')
      expect(data.discount_code.type).toBe('percent')
      expect(data.discount_code.value).toBe(50)
      expect(data.discount_code.max_uses).toBe(10)
      expect(data.discount_code.min_order_thb).toBe(100000)
    })

    it('uppercases the code', async () => {
      const res = await workerFetch('/api/admin/discount-codes', {
        admin: true,
        body: { code: 'lowercase', type: 'fixed', value: 1000 },
      })
      expect(res.status).toBe(201)
      const data = await res.json() as { discount_code: { code: string } }
      expect(data.discount_code.code).toBe('LOWERCASE')
    })

    it('rejects duplicate code', async () => {
      const res = await workerFetch('/api/admin/discount-codes', {
        admin: true,
        body: { code: 'SAVE100', type: 'fixed', value: 1000 },
      })
      expect(res.status).toBe(409)
    })

    it('rejects invalid type', async () => {
      const res = await workerFetch('/api/admin/discount-codes', {
        admin: true,
        body: { code: 'BADTYPE', type: 'bogus', value: 1000 },
      })
      expect(res.status).toBe(400)
    })

    it('rejects percent value over 100', async () => {
      const res = await workerFetch('/api/admin/discount-codes', {
        admin: true,
        body: { code: 'TOOMUCH', type: 'percent', value: 150 },
      })
      expect(res.status).toBe(400)
    })

    it('rejects missing code', async () => {
      const res = await workerFetch('/api/admin/discount-codes', {
        admin: true,
        body: { type: 'fixed', value: 1000 },
      })
      expect(res.status).toBe(400)
    })

  })

  // --- PATCH /api/admin/discount-codes/:id ---

  describe('PATCH /api/admin/discount-codes/:id', () => {
    it('deactivates a discount code', async () => {
      // Get the ID of SAVE100
      const listRes = await workerFetch('/api/admin/discount-codes', { admin: true })
      const list = await listRes.json() as { discount_codes: Array<{ id: number; code: string }> }
      const save100 = list.discount_codes.find((d) => d.code === 'SAVE100')!

      const res = await workerFetch(`/api/admin/discount-codes/${save100.id}`, {
        admin: true,
        method: 'PATCH',
        body: { active: false },
      })
      expect(res.status).toBe(200)
      const data = await res.json() as { discount_code: { active: boolean } }
      expect(data.discount_code.active).toBe(false)
    })

    it('updates value and max_uses', async () => {
      const listRes = await workerFetch('/api/admin/discount-codes', { admin: true })
      const list = await listRes.json() as { discount_codes: Array<{ id: number; code: string }> }
      const save100 = list.discount_codes.find((d) => d.code === 'SAVE100')!

      const res = await workerFetch(`/api/admin/discount-codes/${save100.id}`, {
        admin: true,
        method: 'PATCH',
        body: { value: 20000, max_uses: 50 },
      })
      expect(res.status).toBe(200)
      const data = await res.json() as { discount_code: { value: number; max_uses: number } }
      expect(data.discount_code.value).toBe(20000)
      expect(data.discount_code.max_uses).toBe(50)
    })

    it('sets max_uses to null (unlimited)', async () => {
      const listRes = await workerFetch('/api/admin/discount-codes', { admin: true })
      const list = await listRes.json() as { discount_codes: Array<{ id: number; code: string }> }
      const maxedout = list.discount_codes.find((d) => d.code === 'MAXEDOUT')!

      const res = await workerFetch(`/api/admin/discount-codes/${maxedout.id}`, {
        admin: true,
        method: 'PATCH',
        body: { max_uses: null },
      })
      expect(res.status).toBe(200)
      const data = await res.json() as { discount_code: { max_uses: number | null } }
      expect(data.discount_code.max_uses).toBeNull()
    })

    it('returns 404 for non-existent code', async () => {
      const res = await workerFetch('/api/admin/discount-codes/99999', {
        admin: true,
        method: 'PATCH',
        body: { active: false },
      })
      expect(res.status).toBe(404)
    })

    it('returns 400 for invalid ID', async () => {
      const res = await workerFetch('/api/admin/discount-codes/abc', {
        admin: true,
        method: 'PATCH',
        body: { active: false },
      })
      expect(res.status).toBe(400)
    })

    it('rejects empty update body', async () => {
      const listRes = await workerFetch('/api/admin/discount-codes', { admin: true })
      const list = await listRes.json() as { discount_codes: Array<{ id: number }> }
      const id = list.discount_codes[0].id

      const res = await workerFetch(`/api/admin/discount-codes/${id}`, {
        admin: true,
        method: 'PATCH',
        body: {},
      })
      expect(res.status).toBe(400)
    })

  })
})
