import type { RouterType } from 'itty-router'
import type {
  Env,
  ChatConversationRow,
  ChatMessageRow,
  AdminChatConversationListRow,
} from '../../lib/types'
import { requireAdmin, parseJsonBody } from '../../middleware/auth'
import {
  parseAdminPagination,
  validatePostChatMessageBody,
  validateUpdateChatStatusBody,
} from '../../lib/validation'
import { nowIso } from '../../lib/utils'

function extractConversationId(pathname: string): string {
  const parts = pathname.split('/').filter(Boolean)
  const idx = parts.indexOf('conversations')
  return idx >= 0 && parts[idx + 1] ? parts[idx + 1] : ''
}

export function registerAdminChatRoutes(router: RouterType) {
  // GET /api/admin/chat/conversations — list
  router.get(
    '/api/admin/chat/conversations',
    requireAdmin(async (request, env) => {
      const url = new URL(request.url)
      const status = (url.searchParams.get('status') ?? '').trim()
      const q = (url.searchParams.get('q') ?? '').trim()
      const { page, limit, offset } = parseAdminPagination(url)

      const allowedStatuses = new Set(['open', 'closed'])
      if (status && !allowedStatuses.has(status)) {
        return Response.json({ error: 'Invalid status filter' }, { status: 400 })
      }

      const whereParts = ['1=1']
      const binds: Array<string | number> = []

      if (status) {
        whereParts.push('c.status = ?')
        binds.push(status)
      }
      if (q) {
        whereParts.push('(c.guest_name LIKE ? OR c.guest_email LIKE ?)')
        binds.push(`%${q}%`, `%${q}%`)
      }
      const whereClause = whereParts.join(' AND ')

      try {
        const totalRow = await env.DB.prepare(
          `SELECT COUNT(*) AS total FROM chat_conversations c WHERE ${whereClause}`,
        )
          .bind(...binds)
          .first<{ total: number }>()
        const total = totalRow?.total ?? 0

        const { results } = await env.DB.prepare(
          `SELECT c.id, c.visitor_id, c.user_id, c.guest_name, c.guest_email, c.status,
                  c.last_message_at, c.last_admin_read_at, c.created_at,
                  (SELECT COUNT(*) FROM chat_messages m WHERE m.conversation_id = c.id) AS message_count,
                  (SELECT COUNT(*) FROM chat_messages m
                   WHERE m.conversation_id = c.id
                     AND m.sender_type = 'customer'
                     AND (c.last_admin_read_at IS NULL OR julianday(m.created_at) > julianday(c.last_admin_read_at))
                  ) AS unread_count
           FROM chat_conversations c
           WHERE ${whereClause}
           ORDER BY c.last_message_at DESC
           LIMIT ? OFFSET ?`,
        )
          .bind(...binds, limit, offset)
          .all<AdminChatConversationListRow>()

        return Response.json({
          conversations: results,
          pagination: { page, limit, total },
        })
      } catch {
        return Response.json({ error: 'Database error' }, { status: 500 })
      }
    }),
  )

  // GET /api/admin/chat/unread-count — simple count for badge
  router.get(
    '/api/admin/chat/unread-count',
    requireAdmin(async (_request, env) => {
      try {
        const row = await env.DB.prepare(
          `SELECT COUNT(*) AS count FROM chat_conversations c
           WHERE c.status = 'open'
             AND EXISTS (
               SELECT 1 FROM chat_messages m
               WHERE m.conversation_id = c.id
                 AND m.sender_type = 'customer'
                 AND (c.last_admin_read_at IS NULL OR julianday(m.created_at) > julianday(c.last_admin_read_at))
             )`,
        ).first<{ count: number }>()
        return Response.json({ unread_count: row?.count ?? 0 })
      } catch {
        return Response.json({ error: 'Database error' }, { status: 500 })
      }
    }),
  )

  // GET /api/admin/chat/conversations/:id — detail + messages
  router.get(
    '/api/admin/chat/conversations/:id',
    requireAdmin(async (request, env) => {
      const url = new URL(request.url)
      const id = extractConversationId(url.pathname)
      if (!id) return Response.json({ error: 'Missing conversation id' }, { status: 400 })

      try {
        const conv = await env.DB.prepare(
          `SELECT id, visitor_id, user_id, guest_name, guest_email, status,
                  last_message_at, last_admin_read_at, last_customer_read_at, created_at, updated_at
           FROM chat_conversations WHERE id = ? LIMIT 1`,
        )
          .bind(id)
          .first<ChatConversationRow>()

        if (!conv) return Response.json({ error: 'Conversation not found' }, { status: 404 })

        const { results: messages } = await env.DB.prepare(
          `SELECT id, conversation_id, sender_type, sender_email, body, created_at
           FROM chat_messages WHERE conversation_id = ? ORDER BY created_at ASC, id ASC`,
        )
          .bind(id)
          .all<ChatMessageRow>()

        const lastRead = conv.last_admin_read_at ? Date.parse(conv.last_admin_read_at) : 0
        const unread = messages.filter(
          (m) => m.sender_type === 'customer' && Date.parse(m.created_at) > lastRead,
        ).length

        return Response.json({ conversation: { ...conv, messages, unread_count: unread } })
      } catch {
        return Response.json({ error: 'Database error' }, { status: 500 })
      }
    }),
  )

  // POST /api/admin/chat/conversations/:id/messages — admin reply
  router.post(
    '/api/admin/chat/conversations/:id/messages',
    requireAdmin(async (request, env, adminUser) => {
      const url = new URL(request.url)
      const id = extractConversationId(url.pathname)
      if (!id) return Response.json({ error: 'Missing conversation id' }, { status: 400 })

      const parsed = await parseJsonBody(request)
      if (!parsed.ok) return parsed.response
      const { errors, data } = validatePostChatMessageBody(parsed.data)
      if (errors.length > 0 || !data) {
        return Response.json({ error: 'Validation failed', details: errors }, { status: 400 })
      }

      try {
        const conv = await env.DB.prepare(
          `SELECT status FROM chat_conversations WHERE id = ? LIMIT 1`,
        )
          .bind(id)
          .first<{ status: string }>()
        if (!conv) return Response.json({ error: 'Conversation not found' }, { status: 404 })
        if (conv.status === 'closed') {
          return Response.json({ error: 'Conversation is closed' }, { status: 409 })
        }

        const now = nowIso()
        await env.DB.batch([
          env.DB.prepare(
            `INSERT INTO chat_messages (conversation_id, sender_type, sender_email, body, created_at)
             VALUES (?, 'admin', ?, ?, ?)`,
          ).bind(id, adminUser.email, data.body, now),
          env.DB.prepare(
            `UPDATE chat_conversations
             SET last_message_at = ?, last_admin_read_at = ?, updated_at = ?
             WHERE id = ?`,
          ).bind(now, now, now, id),
        ])

        return Response.json({ success: true })
      } catch {
        return Response.json({ error: 'Database error' }, { status: 500 })
      }
    }),
  )

  // POST /api/admin/chat/conversations/:id/read — mark admin read
  router.post(
    '/api/admin/chat/conversations/:id/read',
    requireAdmin(async (request, env) => {
      const url = new URL(request.url)
      const id = extractConversationId(url.pathname)
      if (!id) return Response.json({ error: 'Missing conversation id' }, { status: 400 })

      try {
        const now = nowIso()
        const res = await env.DB.prepare(
          `UPDATE chat_conversations SET last_admin_read_at = ?, updated_at = ? WHERE id = ?`,
        )
          .bind(now, now, id)
          .run()
        if (!res.meta.changes) {
          return Response.json({ error: 'Conversation not found' }, { status: 404 })
        }
        return Response.json({ success: true })
      } catch {
        return Response.json({ error: 'Database error' }, { status: 500 })
      }
    }),
  )

  // PATCH /api/admin/chat/conversations/:id — update status (close/reopen)
  router.patch(
    '/api/admin/chat/conversations/:id',
    requireAdmin(async (request, env, adminUser) => {
      const url = new URL(request.url)
      const id = extractConversationId(url.pathname)
      if (!id) return Response.json({ error: 'Missing conversation id' }, { status: 400 })

      const parsed = await parseJsonBody(request)
      if (!parsed.ok) return parsed.response
      const { errors, data } = validateUpdateChatStatusBody(parsed.data)
      if (errors.length > 0 || !data) {
        return Response.json({ error: 'Validation failed', details: errors }, { status: 400 })
      }

      try {
        const existing = await env.DB.prepare(
          `SELECT status FROM chat_conversations WHERE id = ? LIMIT 1`,
        )
          .bind(id)
          .first<{ status: string }>()
        if (!existing) return Response.json({ error: 'Conversation not found' }, { status: 404 })

        const now = nowIso()
        await env.DB.batch([
          env.DB.prepare(
            `UPDATE chat_conversations SET status = ?, updated_at = ? WHERE id = ?`,
          ).bind(data.status, now, id),
          env.DB.prepare(
            `INSERT INTO admin_audit_log (admin_email, action, order_id, details_json, created_at)
             VALUES (?, 'chat_status_change', NULL, ?, ?)`,
          ).bind(
            adminUser.email,
            JSON.stringify({ conversation_id: id, from: existing.status, to: data.status }),
            now,
          ),
        ])

        return Response.json({ success: true, status: data.status })
      } catch {
        return Response.json({ error: 'Database error' }, { status: 500 })
      }
    }),
  )
}
