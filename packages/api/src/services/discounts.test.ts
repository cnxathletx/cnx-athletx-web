import { describe, expect, it } from 'vitest'
import type { DiscountCodeRow, Env } from '../lib/types'
import { applyDiscountCode } from './discounts'

interface PreparedStatementStub {
  sql: string
  bindings: unknown[]
  bind: (...values: unknown[]) => PreparedStatementStub
  first: <T>() => Promise<T | null>
}

function discountRow(overrides: Partial<DiscountCodeRow> = {}): DiscountCodeRow {
  return {
    id: 1,
    code: 'SAVE100',
    type: 'fixed',
    value: 10000,
    min_order_thb: 0,
    max_uses: null,
    used_count: 0,
    active: 1,
    expires_at: null,
    ...overrides,
  }
}

function envWithDiscount(row: DiscountCodeRow | null): Env {
  return {
    DB: {
      prepare(sql: string): PreparedStatementStub {
        return {
          sql,
          bindings: [],
          bind(...values: unknown[]) {
            this.bindings = values
            return this
          },
          async first<T>() {
            return row as T | null
          },
        }
      },
    },
  } as unknown as Env
}

describe('discount service', () => {
  it('returns no discount for blank codes', async () => {
    await expect(applyDiscountCode(envWithDiscount(null), '', 89900)).resolves.toMatchObject({
      ok: true,
      discountThb: 0,
      discountCodeRow: null,
      commit: [],
      rollback: [],
    })
  })

  it('rejects missing, inactive, expired, maxed, and below-minimum codes', async () => {
    await expect(applyDiscountCode(envWithDiscount(null), 'NOPE', 89900)).resolves.toMatchObject({
      ok: false,
      detail: { field: 'discount_code', message: 'Discount code not found' },
    })
    await expect(applyDiscountCode(envWithDiscount(discountRow({ active: 0 })), 'SAVE100', 89900)).resolves.toMatchObject({
      ok: false,
      detail: { field: 'discount_code', message: 'Discount code is not active' },
    })
    await expect(applyDiscountCode(envWithDiscount(discountRow({ expires_at: '2020-01-01T00:00:00.000Z' })), 'SAVE100', 89900, new Date('2026-04-29T00:00:00.000Z'))).resolves.toMatchObject({
      ok: false,
      detail: { field: 'discount_code', message: 'Discount code has expired' },
    })
    await expect(applyDiscountCode(envWithDiscount(discountRow({ max_uses: 1, used_count: 1 })), 'SAVE100', 89900)).resolves.toMatchObject({
      ok: false,
      detail: { field: 'discount_code', message: 'Discount code has reached its maximum usage limit' },
    })
    await expect(applyDiscountCode(envWithDiscount(discountRow({ min_order_thb: 200000 })), 'SAVE100', 89900)).resolves.toMatchObject({
      ok: false,
      detail: { field: 'discount_code', message: 'Discount code requires a minimum order of 2000 THB' },
    })
  })

  it('applies fixed and percent discounts capped to subtotal', async () => {
    await expect(applyDiscountCode(envWithDiscount(discountRow({ type: 'fixed', value: 10000 })), 'SAVE100', 89900)).resolves.toMatchObject({
      ok: true,
      discountThb: 10000,
    })
    await expect(applyDiscountCode(envWithDiscount(discountRow({ code: 'PERCENT20', type: 'percent', value: 20 })), 'PERCENT20', 89900)).resolves.toMatchObject({
      ok: true,
      discountThb: 17980,
    })
    await expect(applyDiscountCode(envWithDiscount(discountRow({ type: 'fixed', value: 999999 })), 'SAVE100', 89900)).resolves.toMatchObject({
      ok: true,
      discountThb: 89900,
    })
  })

  it('returns commit and rollback statements for successful discount reservations', async () => {
    const result = await applyDiscountCode(envWithDiscount(discountRow()), 'save100', 89900)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.discountCodeRow?.code).toBe('SAVE100')
    expect(result.commit).toHaveLength(1)
    expect(result.rollback).toHaveLength(1)
    expect((result.commit[0] as unknown as PreparedStatementStub).bindings).toEqual([1])
    expect((result.rollback[0] as unknown as PreparedStatementStub).bindings).toEqual([1])
  })
})
