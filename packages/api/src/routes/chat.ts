import type { RouterType } from 'itty-router'
import type {
  Env,
  ChatConversationRow,
  ChatMessageRow,
  ChatConversationPublicView,
  ChatMessagePublicView,
} from '../lib/types'
import { parseJsonBody, getSessionUser } from '../middleware/auth'
import {
  validateCreateChatConversationBody,
  validatePostChatMessageBody,
} from '../lib/validation'
import { generateULID } from '../lib/ulid'
import { sendAdminNewChatEmail } from '../services/email'

const MAX_CONVERSATIONS_PER_VISITOR_PER_DAY = 5
const MAX_MESSAGES_PER_CONVERSATION = 200

type AuthContext = {
  userId: string | null
  userEmail: string | null
  userName: string | null
}

async function resolveAuth(request: Request, env: Env): Promise<AuthContext> {
  const session = await getSessionUser(request, env)
  if (!session) return { userId: null, userEmail: null, userName: null }
  return { userId: session.id, userEmail: session.email, userName: session.name }
}

async function loadConversationForVisitor(
  env: Env,
  conversationId: string,
  visitorId: string,
  userId: string | null,
): Promise<ChatConversationRow | null> {
  const row = await env.DB.prepare(
    `SELECT id, visitor_id, user_id, guest_name, guest_email, status,
            last_message_at, last_admin_read_at, last_customer_read_at, created_at, updated_at
     FROM chat_conversations
     WHERE id = ?
     LIMIT 1`,
  )
    .bind(conversationId)
    .first<ChatConversationRow>()

  if (!row) return null

  const visitorMatch = row.visitor_id === visitorId
  const userMatch = userId !== null && row.user_id === userId
  if (!visitorMatch && !userMatch) return null

  return row
}

function toPublicView(conv: ChatConversationRow, messages: ChatMessageRow[]): ChatConversationPublicView {
  const lastRead = conv.last_customer_read_at ? Date.parse(conv.last_customer_read_at) : 0
  let unread = 0
  const publicMessages: ChatMessagePublicView[] = messages.map((m) => {
    if (m.sender_type === 'admin' && Date.parse(m.created_at) > lastRead) unread++
    return {
      id: m.id,
      sender_type: m.sender_type,
      body: m.body,
      created_at: m.created_at,
    }
  })

  return {
    id: conv.id,
    status: conv.status,
    guest_name: conv.guest_name,
    guest_email: conv.guest_email,
    last_message_at: conv.last_message_at,
    unread_count: unread,
    messages: publicMessages,
  }
}

async function fetchMessages(env: Env, conversationId: string): Promise<ChatMessageRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT id, conversation_id, sender_type, sender_email, body, created_at
     FROM chat_messages
     WHERE conversation_id = ?
     ORDER BY created_at ASC, id ASC`,
  )
    .bind(conversationId)
    .all<ChatMessageRow>()
  return results
}

export function registerChatRoutes(router: RouterType) {
  // POST /api/chat/conversations — start new chat
  router.post('/api/chat/conversations', async (request: Request, env: Env, ctx: ExecutionContext) => {
    const parsed = await parseJsonBody(request)
    if (!parsed.ok) return parsed.response

    const auth = await resolveAuth(request, env)
    const hasSession = auth.userEmail !== null

    const { errors, data } = validateCreateChatConversationBody(parsed.data, hasSession)
    if (errors.length > 0 || !data) {
      return Response.json({ error: 'Validation failed', details: errors }, { status: 400 })
    }

    try {
      const recentCountRow = await env.DB.prepare(
        `SELECT COUNT(*) AS count FROM chat_conversations
         WHERE visitor_id = ? AND julianday('now') - julianday(created_at) < 1.0`,
      )
        .bind(data.visitor_id)
        .first<{ count: number }>()

      if (recentCountRow && recentCountRow.count >= MAX_CONVERSATIONS_PER_VISITOR_PER_DAY) {
        return Response.json(
          { error: 'Too many conversations. Try again later.' },
          { status: 429 },
        )
      }

      const conversationId = generateULID()
      const now = new Date().toISOString()

      const nameForEmail = hasSession ? auth.userName ?? '' : data.guest_name ?? ''
      const emailForRecord = hasSession ? auth.userEmail : data.guest_email ?? null

      await env.DB.batch([
        env.DB.prepare(
          `INSERT INTO chat_conversations
             (id, visitor_id, user_id, guest_name, guest_email, status, last_message_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?)`,
        ).bind(
          conversationId,
          data.visitor_id,
          auth.userId,
          hasSession ? null : data.guest_name ?? null,
          hasSession ? null : data.guest_email ?? null,
          now,
          now,
          now,
        ),
        env.DB.prepare(
          `INSERT INTO chat_messages (conversation_id, sender_type, sender_email, body, created_at)
           VALUES (?, 'customer', ?, ?, ?)`,
        ).bind(conversationId, emailForRecord, data.initial_message, now),
      ])

      ctx.waitUntil(
        sendAdminNewChatEmail(env, {
          conversation_id: conversationId,
          guest_name: nameForEmail || 'Anonymous visitor',
          guest_email: emailForRecord || 'unknown',
          initial_message: data.initial_message,
          created_at: now,
        }),
      )

      const conv = await loadConversationForVisitor(env, conversationId, data.visitor_id, auth.userId)
      if (!conv) {
        return Response.json({ error: 'Database error' }, { status: 500 })
      }
      const messages = await fetchMessages(env, conversationId)
      return Response.json({ success: true, conversation: toPublicView(conv, messages) }, { status: 201 })
    } catch {
      return Response.json({ error: 'Database error' }, { status: 500 })
    }
  })

  // GET /api/chat/conversations/:id — fetch conversation + messages
  router.get('/api/chat/conversations/:id', async (request: Request, env: Env) => {
    const url = new URL(request.url)
    const id = url.pathname.split('/').pop() || ''
    const visitorId = url.searchParams.get('visitor_id') || ''
    const auth = await resolveAuth(request, env)

    if (!id) {
      return Response.json({ error: 'Missing conversation id' }, { status: 400 })
    }

    try {
      const conv = await loadConversationForVisitor(env, id, visitorId, auth.userId)
      if (!conv) {
        return Response.json({ error: 'Conversation not found' }, { status: 404 })
      }
      const messages = await fetchMessages(env, id)
      return Response.json({ conversation: toPublicView(conv, messages) })
    } catch {
      return Response.json({ error: 'Database error' }, { status: 500 })
    }
  })

  // POST /api/chat/conversations/:id/messages — post customer message
  router.post('/api/chat/conversations/:id/messages', async (request: Request, env: Env) => {
    const url = new URL(request.url)
    const parts = url.pathname.split('/')
    const id = parts[parts.length - 2] || ''

    const parsed = await parseJsonBody(request)
    if (!parsed.ok) return parsed.response

    const body = parsed.data as { visitor_id?: string }
    const visitorId = typeof body.visitor_id === 'string' ? body.visitor_id.trim() : ''
    const auth = await resolveAuth(request, env)

    const { errors, data } = validatePostChatMessageBody(parsed.data)
    if (errors.length > 0 || !data) {
      return Response.json({ error: 'Validation failed', details: errors }, { status: 400 })
    }

    try {
      const conv = await loadConversationForVisitor(env, id, visitorId, auth.userId)
      if (!conv) {
        return Response.json({ error: 'Conversation not found' }, { status: 404 })
      }
      if (conv.status === 'closed') {
        return Response.json({ error: 'Conversation is closed' }, { status: 409 })
      }

      const countRow = await env.DB.prepare(
        `SELECT COUNT(*) AS count FROM chat_messages WHERE conversation_id = ?`,
      )
        .bind(id)
        .first<{ count: number }>()
      if (countRow && countRow.count >= MAX_MESSAGES_PER_CONVERSATION) {
        return Response.json({ error: 'Message limit reached' }, { status: 429 })
      }

      const now = new Date().toISOString()
      const senderEmail = auth.userEmail ?? conv.guest_email

      await env.DB.batch([
        env.DB.prepare(
          `INSERT INTO chat_messages (conversation_id, sender_type, sender_email, body, created_at)
           VALUES (?, 'customer', ?, ?, ?)`,
        ).bind(id, senderEmail, data.body, now),
        env.DB.prepare(
          `UPDATE chat_conversations SET last_message_at = ?, updated_at = ? WHERE id = ?`,
        ).bind(now, now, id),
      ])

      const messages = await fetchMessages(env, id)
      const latest = await loadConversationForVisitor(env, id, visitorId, auth.userId)
      if (!latest) {
        return Response.json({ error: 'Database error' }, { status: 500 })
      }
      return Response.json({ success: true, conversation: toPublicView(latest, messages) })
    } catch {
      return Response.json({ error: 'Database error' }, { status: 500 })
    }
  })

  // POST /api/chat/conversations/:id/read — mark customer read
  router.post('/api/chat/conversations/:id/read', async (request: Request, env: Env) => {
    const url = new URL(request.url)
    const parts = url.pathname.split('/')
    const id = parts[parts.length - 2] || ''

    const parsed = await parseJsonBody(request)
    if (!parsed.ok) return parsed.response
    const body = parsed.data as { visitor_id?: string }
    const visitorId = typeof body.visitor_id === 'string' ? body.visitor_id.trim() : ''
    const auth = await resolveAuth(request, env)

    try {
      const conv = await loadConversationForVisitor(env, id, visitorId, auth.userId)
      if (!conv) {
        return Response.json({ error: 'Conversation not found' }, { status: 404 })
      }
      const now = new Date().toISOString()
      await env.DB.prepare(
        `UPDATE chat_conversations SET last_customer_read_at = ?, updated_at = ? WHERE id = ?`,
      )
        .bind(now, now, id)
        .run()
      return Response.json({ success: true })
    } catch {
      return Response.json({ error: 'Database error' }, { status: 500 })
    }
  })
}
