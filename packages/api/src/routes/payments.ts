import type { RouterType } from 'itty-router'
import type { Env, WebhookOutcome } from '../lib/types'
import { getProvider } from '../services/payments/registry'
import { nowIso } from '../lib/utils'
import {
  allowedWebhookTransitionSources,
  mapWebhookOutcomeToOrderStatus,
  orderStatusSqlList,
} from '../lib/orderStatus'

export function mapWebhookToOrderStatus(outcome: WebhookOutcome): 'paid' | 'failed' | 'refunded' {
  return mapWebhookOutcomeToOrderStatus(outcome)
}

export function allowedFromStates(outcome: WebhookOutcome) {
  return allowedWebhookTransitionSources(outcome)
}

function isUniqueViolation(err: unknown): boolean {
  const msg = String(err instanceof Error ? err.message : err).toLowerCase()
  return msg.includes('unique') || msg.includes('constraint failed')
}

export function registerPaymentsRoutes(router: RouterType) {
  router.post('/api/payments/:provider/webhook', async (request: Request, env: Env) => {
    const url = new URL(request.url)
    const providerId = url.pathname.split('/')[3] || ''
    const provider = getProvider(providerId)
    if (!provider || !provider.verifyWebhook) {
      return Response.json({ error: 'Provider has no webhook' }, { status: 404 })
    }

    const result = await provider.verifyWebhook(request, env)
    if (!result.ok) {
      return Response.json({ error: result.reason }, { status: 400 })
    }

    const newStatus = mapWebhookToOrderStatus(result.status)
    const allowed = allowedFromStates(result.status)
    const now = nowIso()

    try {
      await env.DB.batch([
        env.DB.prepare(
          `INSERT INTO payments (order_id, method, provider, provider_txn_id, status, payload_json, amount_thb, created_at)
           VALUES (?, ?, ?, ?, ?, ?, (SELECT total_thb FROM orders WHERE id = ?), ?)`
        ).bind(
          result.order_id,
          provider.id,
          provider.id,
          result.provider_txn_id,
          result.status,
          JSON.stringify(result.raw),
          result.order_id,
          now,
        ),
        env.DB.prepare(
          `UPDATE orders SET status = ?, updated_at = ?
           WHERE id = ? AND status IN ${orderStatusSqlList(allowed)}`
        ).bind(newStatus, now, result.order_id),
      ])
    } catch (e) {
      if (isUniqueViolation(e)) {
        return Response.json({ ok: true, replayed: true })
      }
      console.error('webhook DB error:', e)
      return Response.json({ error: 'DB error' }, { status: 500 })
    }

    return Response.json({ ok: true })
  })
}
