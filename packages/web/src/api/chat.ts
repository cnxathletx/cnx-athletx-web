import { ApiClientError, apiFetch, type ApiErrorDetails, type ApiErrorPayload } from './client'
import type { ChatConversation, CreateConversationInput } from '../types/chat'

export type {
  ChatConversation,
  ChatConversationStatus,
  ChatMessage,
  ChatSenderType,
  CreateConversationInput,
} from '../types/chat'

export class ChatApiErrorResponse extends ApiClientError {
  constructor(message: string, status: number, details?: ApiErrorDetails[]) {
    super(message, status, details)
    this.name = 'ChatApiErrorResponse'
  }
}

function chatError(payload: ApiErrorPayload, response: Response): ChatApiErrorResponse {
  return new ChatApiErrorResponse(payload.error || 'Request failed', response.status, payload.details)
}

export async function createConversation(input: CreateConversationInput): Promise<ChatConversation> {
  const data = await apiFetch<{ conversation: ChatConversation }>('/api/chat/conversations', {
    method: 'POST',
    body: input,
    parseError: chatError,
  })
  return data.conversation
}

export async function fetchConversation(
  id: string,
  visitorId: string,
  sinceMessageId?: number,
): Promise<ChatConversation> {
  const params = new URLSearchParams({ visitor_id: visitorId })
  if (typeof sinceMessageId === 'number' && sinceMessageId > 0) {
    params.set('since_message_id', String(sinceMessageId))
  }
  const data = await apiFetch<{ conversation: ChatConversation }>(
    `/api/chat/conversations/${encodeURIComponent(id)}?${params.toString()}`,
    { parseError: chatError },
  )
  return data.conversation
}

export async function sendMessage(
  id: string,
  visitorId: string,
  body: string,
  sinceMessageId?: number,
): Promise<ChatConversation> {
  const payload: Record<string, unknown> = { visitor_id: visitorId, body }
  if (typeof sinceMessageId === 'number' && sinceMessageId > 0) {
    payload.since_message_id = sinceMessageId
  }
  const data = await apiFetch<{ conversation: ChatConversation }>(
    `/api/chat/conversations/${encodeURIComponent(id)}/messages`,
    {
      method: 'POST',
      body: payload,
      parseError: chatError,
    },
  )
  return data.conversation
}

export async function markRead(id: string, visitorId: string): Promise<void> {
  await apiFetch<void>(`/api/chat/conversations/${encodeURIComponent(id)}/read`, {
    method: 'POST',
    body: { visitor_id: visitorId },
    parseError: chatError,
  })
}
