import { describe, expect, it } from 'vitest'
import type { Env } from '../lib/types'
import {
  inventoryReservationFailure,
  releaseInventory,
  reserveInventory,
  rollbackReservedInventory,
} from './inventory'

interface PreparedStatementStub {
  sql: string
  bindings: unknown[]
  bind: (...values: unknown[]) => PreparedStatementStub
}

function envStub(): Env {
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
        }
      },
    },
  } as unknown as Env
}

describe('inventory service', () => {
  it('builds conditional reservation statements for each item', () => {
    const statements = reserveInventory(envStub(), [
      { product_id: 1, quantity: 2 },
      { product_id: 2, quantity: 1 },
    ], '2026-04-29T00:00:00.000Z')

    expect(statements).toHaveLength(2)
    expect((statements[0] as unknown as PreparedStatementStub).sql).toContain('(stock_count - reserved_count) >= ?')
    expect((statements[0] as unknown as PreparedStatementStub).bindings).toEqual([2, '2026-04-29T00:00:00.000Z', 1, 2])
  })

  it('builds release statements for all supplied items', () => {
    const statements = releaseInventory(envStub(), [{ product_id: 1, quantity: 2 }], 'now')

    expect(statements).toHaveLength(1)
    expect((statements[0] as unknown as PreparedStatementStub).sql).toContain('reserved_count = reserved_count - ?')
    expect((statements[0] as unknown as PreparedStatementStub).bindings).toEqual([2, 'now', 1])
  })

  it('builds rollback statements only for successful prior reservations', () => {
    const statements = rollbackReservedInventory(
      envStub(),
      [
        { product_id: 1, quantity: 2 },
        { product_id: 2, quantity: 1 },
      ],
      'now',
      [{ meta: { changes: 1 } }, { meta: { changes: 0 } }],
      2,
    )

    expect(statements).toHaveLength(1)
    expect((statements[0] as unknown as PreparedStatementStub).bindings).toEqual([2, 'now', 1])
  })

  it('maps zero-change reservation results to the failed item', () => {
    expect(inventoryReservationFailure([
      { product_id: 1, quantity: 2 },
      { product_id: 2, quantity: 1 },
    ], [{ meta: { changes: 1 } }, { meta: { changes: 0 } }])).toEqual({
      index: 1,
      item: { product_id: 2, quantity: 1 },
    })
  })
})
