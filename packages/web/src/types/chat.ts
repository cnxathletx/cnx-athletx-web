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

export interface CreateConversationInput {
  visitor_id: string
  guest_name?: string
  guest_email?: string
  initial_message: string
}
