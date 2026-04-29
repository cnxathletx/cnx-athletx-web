import type { Env, ValidationError } from '../lib/types'

export interface InventoryReservationItem {
  product_id: number
  quantity: number
}

export interface InventoryReservationFailure {
  index: number
  item: InventoryReservationItem
}

type D1BatchResultLike = {
  meta?: {
    changes?: number
  }
}

export function reserveInventory(
  env: Env,
  items: InventoryReservationItem[],
  now: string,
): D1PreparedStatement[] {
  return items.map((item) =>
    env.DB.prepare(
      `UPDATE inventory SET reserved_count = reserved_count + ?, updated_at = ?
       WHERE product_id = ? AND (stock_count - reserved_count) >= ?`,
    ).bind(item.quantity, now, item.product_id, item.quantity),
  )
}

export function releaseInventory(
  env: Env,
  items: InventoryReservationItem[],
  now: string,
): D1PreparedStatement[] {
  return items.map((item) =>
    env.DB.prepare(
      `UPDATE inventory SET reserved_count = reserved_count - ?, updated_at = ? WHERE product_id = ?`,
    ).bind(item.quantity, now, item.product_id),
  )
}

export function rollbackReservedInventory(
  env: Env,
  items: InventoryReservationItem[],
  now: string,
  results: D1BatchResultLike[],
  endIndex = items.length,
): D1PreparedStatement[] {
  const rollbacks: D1PreparedStatement[] = []
  for (let i = 0; i < Math.min(endIndex, items.length); i++) {
    if ((results[i]?.meta?.changes ?? 0) > 0) {
      rollbacks.push(...releaseInventory(env, [items[i]], now))
    }
  }
  return rollbacks
}

export function inventoryReservationFailure(
  items: InventoryReservationItem[],
  results: D1BatchResultLike[],
): InventoryReservationFailure | null {
  for (let i = 0; i < items.length; i++) {
    if ((results[i]?.meta?.changes ?? 0) === 0) {
      return { index: i, item: items[i] }
    }
  }
  return null
}

export function inventoryFailureDetail(failure: InventoryReservationFailure): ValidationError {
  return {
    field: 'items',
    message: `Product ${failure.item.product_id} is no longer available in the requested quantity`,
  }
}
