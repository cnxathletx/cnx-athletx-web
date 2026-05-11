import type { RouterType } from 'itty-router'
import type { Env, WebhookOutcome } from '../lib/types'
import { getProvider } from '../services/payments/registry'
import { nowIso } from '../lib/utils'
import {
  ORDER_STATUS,
  allowedWebhookTransitionSources,
  mapWebhookOutcomeToOrderStatus,
  orderStatusSqlList,
} from '../lib/orderStatus'
import { loyaltyStatementsForPaidOrder, loyaltyStatementsForTerminalReversal } from '../services/loyalty'

export function mapWebhookToOrderStatus(outcome: WebhookOutcome): 'paid' | 'failed' | 'refunded' {
  return mapWebhookOutcomeToOrderStatus(outcome)
}

export function allowedFromStates(outcome: WebhookOutcome) {
  return allowedWebhookTransitionSources(outcome)
}

export interface WebhookEnvelope {
  orderId: string
  status: WebhookOutcome
  idempotencyKey: string
  raw: unknown
}

export function webhookEnvelopeFromResult(result: {
  order_id: string
  provider_txn_id: string
  status: WebhookOutcome
  raw: unknown
}): WebhookEnvelope {
  return {
    orderId: result.order_id,
    status: result.status,
    idempotencyKey: result.provider_txn_id,
    raw: result.raw,
  }
}

function isUniqueViolation(err: unknown): boolean {
  const msg = String(err instanceof Error ? err.message : err).toLowerCase()
  return msg.includes('unique') || msg.includes('constraint failed')
}

export function registerPaymentsRoutes(router: RouterType) {
  async function dispatchWebhook(request: Request, env: Env, providerId: string): Promise<Response> {
    const provider = getProvider(providerId)
    if (!provider || !provider.verifyWebhook) {
      return Response.json({ error: 'Provider has no webhook' }, { status: 404 })
    }

    const result = await provider.verifyWebhook(request, env)
    if (!result.ok) {
      return Response.json({ error: result.reason }, { status: 400 })
    }

    const envelope = webhookEnvelopeFromResult(result)
    const newStatus = mapWebhookToOrderStatus(envelope.status)
    const allowed = allowedFromStates(envelope.status)
    const now = nowIso()

    try {
      const loyaltyStatements = newStatus === ORDER_STATUS.paid
        ? await loyaltyStatementsForPaidOrder(env, envelope.orderId, now)
        : newStatus === ORDER_STATUS.refunded
          ? await loyaltyStatementsForTerminalReversal(env, envelope.orderId, now)
          : []

      await env.DB.batch([
        env.DB.prepare(
          `INSERT INTO payments (order_id, method, provider, provider_txn_id, status, payload_json, amount_thb, created_at)
           VALUES (?, ?, ?, ?, ?, ?, (SELECT total_thb FROM orders WHERE id = ?), ?)`
        ).bind(
          envelope.orderId,
          provider.id,
          provider.id,
          envelope.idempotencyKey,
          envelope.status,
          JSON.stringify(envelope.raw),
          envelope.orderId,
          now,
        ),
        env.DB.prepare(
          `UPDATE orders SET status = ?, updated_at = ?
           WHERE id = ? AND status IN ${orderStatusSqlList(allowed)}`
        ).bind(newStatus, now, envelope.orderId),
        ...loyaltyStatements,
      ])
    } catch (e) {
      if (isUniqueViolation(e)) {
        return Response.json({ ok: true, replayed: true })
      }
      console.error('webhook DB error:', e)
      return Response.json({ error: 'DB error' }, { status: 500 })
    }

    return Response.json({ ok: true })
  }

  router.post('/api/payments/webhook/:providerId', async (request: Request, env: Env) => {
    const url = new URL(request.url)
    const providerId = url.pathname.split('/')[4] || ''
    return dispatchWebhook(request, env, providerId)
  })

  router.post('/api/payments/:provider/webhook', async (request: Request, env: Env) => {
    const url = new URL(request.url)
    const providerId = url.pathname.split('/')[3] || ''
    return dispatchWebhook(request, env, providerId)
  })
}
