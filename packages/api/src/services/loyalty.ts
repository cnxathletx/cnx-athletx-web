import type { Env, LoyaltyBalanceRow, LoyaltyLedgerRow, LoyaltyOrderRow } from '../lib/types'
import { REVENUE_ORDER_STATUSES, orderStatusSqlList } from '../lib/orderStatus'

export const POINT_VALUE_SATANG = 100
export const EARN_SATANG_PER_POINT = 1000
export const MAX_REDEMPTION_BPS = 500

export function calculateEarnedPoints(input: { subtotalThb: number; discountThb: number }): number {
  const eligibleSatang = Math.max(0, input.subtotalThb - input.discountThb)
  return Math.floor(eligibleSatang / EARN_SATANG_PER_POINT)
}

export function maxRedeemablePointsForSubtotal(subtotalThb: number): number {
  const maxDiscountSatang = Math.floor((subtotalThb * MAX_REDEMPTION_BPS) / 10_000)
  return Math.floor(maxDiscountSatang / POINT_VALUE_SATANG)
}

export function normalizeRedeemPoints(input: {
  requestedPoints: number
  availablePoints: number
  subtotalThb: number
}): { points: number; discountThb: number } {
  if (!Number.isInteger(input.requestedPoints) || input.requestedPoints < 0) {
    throw new Error('redeem_points must be a non-negative integer')
  }

  const points = Math.min(
    input.requestedPoints,
    Math.max(0, input.availablePoints),
    maxRedeemablePointsForSubtotal(input.subtotalThb),
  )

  return { points, discountThb: points * POINT_VALUE_SATANG }
}

export async function getLoyaltyBalance(env: Env, userId: string): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COALESCE(SUM(points_delta), 0) AS balance
     FROM loyalty_point_ledger
     WHERE user_id = ?`,
  ).bind(userId).first<LoyaltyBalanceRow>()

  return Math.max(0, row?.balance ?? 0)
}

export async function listLoyaltyEntries(env: Env, userId: string, limit = 10): Promise<LoyaltyLedgerRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT id, order_id, points_delta, kind, reason, created_at
     FROM loyalty_point_ledger
     WHERE user_id = ?
     ORDER BY created_at DESC, id DESC
     LIMIT ?`,
  ).bind(userId, limit).all<LoyaltyLedgerRow>()

  return results
}

export function redeemPointsStatement(env: Env, input: {
  userId: string
  orderId: string
  points: number
  now: string
}): D1PreparedStatement | null {
  if (input.points <= 0) return null
  return env.DB.prepare(
    `INSERT INTO loyalty_point_ledger (user_id, order_id, points_delta, kind, reason, created_at)
     VALUES (?, ?, ?, 'redeem', 'Redeemed points at checkout', ?)`,
  ).bind(input.userId, input.orderId, -input.points, input.now)
}

export function restoreRedeemedPointsStatement(env: Env, input: {
  userId: string
  orderId: string
  points: number
  now: string
}): D1PreparedStatement | null {
  if (input.points <= 0) return null
  return env.DB.prepare(
    `INSERT OR IGNORE INTO loyalty_point_ledger (user_id, order_id, points_delta, kind, reason, created_at)
     VALUES (?, ?, ?, 'restore', 'Restored points after order cancellation or refund', ?)`,
  ).bind(input.userId, input.orderId, input.points, input.now)
}

export function earnPointsStatement(env: Env, input: {
  userId: string
  orderId: string
  points: number
  now: string
}): D1PreparedStatement | null {
  if (input.points <= 0) return null
  return env.DB.prepare(
    `INSERT OR IGNORE INTO loyalty_point_ledger (user_id, order_id, points_delta, kind, reason, created_at)
     VALUES (?, ?, ?, 'earn', 'Earned points from paid order', ?)`,
  ).bind(input.userId, input.orderId, input.points, input.now)
}

export function reverseEarnedPointsStatement(env: Env, input: {
  userId: string
  orderId: string
  points: number
  now: string
}): D1PreparedStatement | null {
  if (input.points <= 0) return null
  return env.DB.prepare(
    `INSERT OR IGNORE INTO loyalty_point_ledger (user_id, order_id, points_delta, kind, reason, created_at)
     VALUES (?, ?, ?, 'reverse_earn', 'Reversed earned points after cancellation or refund', ?)`,
  ).bind(input.userId, input.orderId, -input.points, input.now)
}

export async function loyaltyStatementsForPaidOrder(env: Env, orderId: string, now: string): Promise<D1PreparedStatement[]> {
  const order = await env.DB.prepare(
    `SELECT id, user_id, subtotal_thb, discount_thb, points_redeemed, points_earned, status
     FROM orders WHERE id = ? LIMIT 1`,
  ).bind(orderId).first<LoyaltyOrderRow>()

  if (!order?.user_id) return []

  const points = calculateEarnedPoints({ subtotalThb: order.subtotal_thb, discountThb: order.discount_thb })
  const earn = earnPointsStatement(env, { userId: order.user_id, orderId, points, now })
  const update = env.DB.prepare(`UPDATE orders SET points_earned = ? WHERE id = ? AND points_earned = 0`).bind(points, orderId)
  return earn ? [earn, update] : [update]
}

export async function loyaltyStatementsForTerminalReversal(env: Env, orderId: string, now: string): Promise<D1PreparedStatement[]> {
  const order = await env.DB.prepare(
    `SELECT id, user_id, subtotal_thb, discount_thb, points_redeemed, points_earned, status
     FROM orders WHERE id = ? LIMIT 1`,
  ).bind(orderId).first<LoyaltyOrderRow>()

  if (!order?.user_id) return []

  const statements: D1PreparedStatement[] = []
  const restore = restoreRedeemedPointsStatement(env, { userId: order.user_id, orderId, points: order.points_redeemed, now })
  const reverse = reverseEarnedPointsStatement(env, { userId: order.user_id, orderId, points: order.points_earned, now })
  if (restore) statements.push(restore)
  if (reverse) statements.push(reverse)
  return statements
}

export async function loyaltyStatementsForLinkedPaidOrders(env: Env, userId: string, now: string): Promise<D1PreparedStatement[]> {
  const { results } = await env.DB.prepare(
    `SELECT o.id, o.user_id, o.subtotal_thb, o.discount_thb, o.points_redeemed, o.points_earned, o.status
     FROM orders o
     LEFT JOIN loyalty_point_ledger l ON l.order_id = o.id AND l.kind = 'earn'
     WHERE o.user_id = ?
       AND o.status IN ${orderStatusSqlList(REVENUE_ORDER_STATUSES)}
       AND l.id IS NULL`,
  ).bind(userId).all<LoyaltyOrderRow>()

  const statements: D1PreparedStatement[] = []
  for (const order of results) {
    const points = calculateEarnedPoints({ subtotalThb: order.subtotal_thb, discountThb: order.discount_thb })
    const earn = earnPointsStatement(env, { userId, orderId: order.id, points, now })
    if (earn) statements.push(earn)
    statements.push(env.DB.prepare(`UPDATE orders SET points_earned = ? WHERE id = ? AND points_earned = 0`).bind(points, order.id))
  }
  return statements
}
