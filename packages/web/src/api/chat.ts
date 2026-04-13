import { apiUrl } from './client'

export type ChatSenderType = 'customer' | 'admin' | 'system'
export type ChatConversationStatus = 'open' | 'closed'

export interface ChatMessage {
  id: number
  sender_type: ChatSenderType
  body: string
  created_at: string
}

export interface ChatConversation {
  id: string
  status: ChatConversationStatus
  guest_name: string | null
  guest_email: string | null
  last_message_at: string
  unread_count: number
  messages: ChatMessage[]
}

interface ChatApiError {
  error: string
  details?: { field: string; message: string }[]
}

export class ChatApiErrorResponse extends Error {
  status: number
  details?: { field: string; message: string }[]

  constructor(message: string, status: number, details?: { field: string; message: string }[]) {
    super(message)
    this.status = status
    this.details = details
  }
}

async function parseChatError(res: Response): Promise<never> {
  let payload: ChatApiError = { error: 'Request failed' }
  try {
    payload = (await res.json()) as ChatApiError
  } catch {
    // ignore
  }
  throw new ChatApiErrorResponse(payload.error || 'Request failed', res.status, payload.details)
}

export interface CreateConversationInput {
  visitor_id: string
  guest_name?: string
  guest_email?: string
  initial_message: string
}

export async function createConversation(input: CreateConversationInput): Promise<ChatConversation> {
  const res = await fetch(apiUrl('/api/chat/conversations'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!res.ok) await parseChatError(res)
  const data = (await res.json()) as { conversation: ChatConversation }
  return data.conversation
}

export async function fetchConversation(id: string, visitorId: string): Promise<ChatConversation> {
  const res = await fetch(
    apiUrl(`/api/chat/conversations/${encodeURIComponent(id)}?visitor_id=${encodeURIComponent(visitorId)}`),
    { credentials: 'include' },
  )
  if (!res.ok) await parseChatError(res)
  const data = (await res.json()) as { conversation: ChatConversation }
  return data.conversation
}

export async function sendMessage(
  id: string,
  visitorId: string,
  body: string,
): Promise<ChatConversation> {
  const res = await fetch(apiUrl(`/api/chat/conversations/${encodeURIComponent(id)}/messages`), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ visitor_id: visitorId, body }),
  })
  if (!res.ok) await parseChatError(res)
  const data = (await res.json()) as { conversation: ChatConversation }
  return data.conversation
}

export async function markRead(id: string, visitorId: string): Promise<void> {
  const res = await fetch(apiUrl(`/api/chat/conversations/${encodeURIComponent(id)}/read`), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ visitor_id: visitorId }),
  })
  if (!res.ok) await parseChatError(res)
}
