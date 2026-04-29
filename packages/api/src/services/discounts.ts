import type { DiscountCodeRow, Env, ValidationError } from '../lib/types'

export interface AppliedDiscount {
  ok: true
  discountThb: number
  discountCodeRow: DiscountCodeRow | null
  commit: D1PreparedStatement[]
  rollback: D1PreparedStatement[]
}

export interface DiscountApplyError {
  ok: false
  status: number
  detail: ValidationError
}

export type DiscountApplyResult = AppliedDiscount | DiscountApplyError

function validationError(message: string): DiscountApplyError {
  return {
    ok: false,
    status: 400,
    detail: { field: 'discount_code', message },
  }
}

function calculateDiscount(row: DiscountCodeRow, subtotal: number): number {
  const discount = row.type === 'fixed'
    ? row.value
    : Math.floor((subtotal * row.value) / 100)
  return Math.min(discount, subtotal)
}

export async function applyDiscountCode(
  env: Env,
  rawCode: string | undefined,
  subtotal: number,
  now = new Date(),
): Promise<DiscountApplyResult> {
  if (!rawCode || rawCode.trim() === '') {
    return { ok: true, discountThb: 0, discountCodeRow: null, commit: [], rollback: [] }
  }

  const code = rawCode.trim().toUpperCase()
  const row = await env.DB.prepare(
    `SELECT id, code, type, value, min_order_thb, max_uses, used_count, active, expires_at
     FROM discount_codes WHERE code = ? AND archived = 0 LIMIT 1`,
  )
    .bind(code)
    .first<DiscountCodeRow>()

  if (!row) return validationError('Discount code not found')
  if (!row.active) return validationError('Discount code is not active')
  if (row.expires_at && new Date(row.expires_at) < now) return validationError('Discount code has expired')
  if (row.max_uses !== null && row.used_count >= row.max_uses) {
    return validationError('Discount code has reached its maximum usage limit')
  }
  if (subtotal < row.min_order_thb) {
    return validationError(`Discount code requires a minimum order of ${row.min_order_thb / 100} THB`)
  }

  return {
    ok: true,
    discountThb: calculateDiscount(row, subtotal),
    discountCodeRow: row,
    commit: [
      env.DB.prepare(
        `UPDATE discount_codes SET used_count = used_count + 1
         WHERE id = ? AND (max_uses IS NULL OR used_count < max_uses)`,
      ).bind(row.id),
    ],
    rollback: [
      env.DB.prepare(`UPDATE discount_codes SET used_count = used_count - 1 WHERE id = ? AND used_count > 0`).bind(row.id),
    ],
  }
}
