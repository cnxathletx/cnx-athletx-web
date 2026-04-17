import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  createConversation,
  fetchConversation,
  sendMessage,
  markRead,
  ChatApiErrorResponse,
  type ChatConversation,
  type ChatMessage,
} from '../api/chat'

const VISITOR_STORAGE_KEY = 'cnx-chat-visitor'
const CONVERSATION_STORAGE_KEY = 'cnx-chat-conversation'
const POLL_INTERVAL_MS = 4000

function loadVisitorId(): string {
  try {
    const raw = localStorage.getItem(VISITOR_STORAGE_KEY)
    if (raw && /^[a-zA-Z0-9_-]{8,64}$/.test(raw)) return raw
  } catch {
    // ignore
  }
  const id = generateVisitorId()
  try {
    localStorage.setItem(VISITOR_STORAGE_KEY, id)
  } catch {
    // ignore
  }
  return id
}

function generateVisitorId(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

function loadStoredConversationId(): string | null {
  try {
    return localStorage.getItem(CONVERSATION_STORAGE_KEY)
  } catch {
    return null
  }
}

function saveConversationId(id: string | null) {
  try {
    if (id) localStorage.setItem(CONVERSATION_STORAGE_KEY, id)
    else localStorage.removeItem(CONVERSATION_STORAGE_KEY)
  } catch {
    // ignore
  }
}

export const useChatStore = defineStore('chat', () => {
  const visitorId = ref<string>(loadVisitorId())
  const conversation = ref<ChatConversation | null>(null)
  const isOpen = ref(false)
  const loading = ref(false)
  const sending = ref(false)
  const error = ref('')
  let pollHandle: number | null = null

  const unreadCount = computed(() => conversation.value?.unread_count ?? 0)
  const hasConversation = computed(() => conversation.value !== null)

  function setError(err: unknown) {
    if (err instanceof ChatApiErrorResponse) {
      error.value = err.message
    } else {
      error.value = 'Something went wrong. Try again.'
    }
  }

  function lastMessageId(): number | undefined {
    const msgs = conversation.value?.messages
    if (!msgs || msgs.length === 0) return undefined
    let max = 0
    for (const m of msgs) if (m.id > max) max = m.id
    return max > 0 ? max : undefined
  }

  function mergeDelta(delta: ChatConversation) {
    const current = conversation.value
    if (!current) {
      conversation.value = delta
      return
    }
    const seen = new Set(current.messages.map((m) => m.id))
    const newMessages: ChatMessage[] = []
    for (const m of delta.messages) {
      if (!seen.has(m.id)) newMessages.push(m)
    }
    const merged = newMessages.length > 0 ? [...current.messages, ...newMessages] : current.messages
    conversation.value = {
      ...current,
      status: delta.status,
      guest_name: delta.guest_name,
      guest_email: delta.guest_email,
      last_message_at: delta.last_message_at,
      unread_count: delta.unread_count,
      messages: merged,
    }
  }

  async function loadExisting() {
    const storedId = loadStoredConversationId()
    if (!storedId) return
    loading.value = true
    try {
      conversation.value = await fetchConversation(storedId, visitorId.value)
    } catch (err) {
      if (err instanceof ChatApiErrorResponse && err.status === 404) {
        saveConversationId(null)
        conversation.value = null
      }
    } finally {
      loading.value = false
    }
  }

  async function startConversation(input: {
    initial_message: string
    guest_name?: string
    guest_email?: string
  }): Promise<boolean> {
    loading.value = true
    error.value = ''
    try {
      const conv = await createConversation({
        visitor_id: visitorId.value,
        initial_message: input.initial_message,
        guest_name: input.guest_name,
        guest_email: input.guest_email,
      })
      conversation.value = conv
      saveConversationId(conv.id)
      startPolling()
      return true
    } catch (err) {
      setError(err)
      return false
    } finally {
      loading.value = false
    }
  }

  async function postMessage(body: string): Promise<boolean> {
    if (!conversation.value) return false
    sending.value = true
    error.value = ''
    try {
      const delta = await sendMessage(
        conversation.value.id,
        visitorId.value,
        body,
        lastMessageId(),
      )
      mergeDelta(delta)
      return true
    } catch (err) {
      setError(err)
      return false
    } finally {
      sending.value = false
    }
  }

  async function poll() {
    if (!conversation.value) return
    try {
      const delta = await fetchConversation(
        conversation.value.id,
        visitorId.value,
        lastMessageId(),
      )
      mergeDelta(delta)
    } catch {
      // silent — next tick will retry
    }
  }

  function startPolling() {
    stopPolling()
    pollHandle = window.setInterval(poll, POLL_INTERVAL_MS)
  }

  function stopPolling() {
    if (pollHandle !== null) {
      window.clearInterval(pollHandle)
      pollHandle = null
    }
  }

  async function markAsRead() {
    if (!conversation.value) return
    try {
      await markRead(conversation.value.id, visitorId.value)
      if (conversation.value) conversation.value.unread_count = 0
    } catch {
      // ignore
    }
  }

  async function openWidget() {
    isOpen.value = true
    if (!conversation.value) {
      await loadExisting()
    }
    if (conversation.value) {
      startPolling()
      await markAsRead()
    }
  }

  function closeWidget() {
    isOpen.value = false
    stopPolling()
  }

  function resetConversation() {
    conversation.value = null
    saveConversationId(null)
    stopPolling()
  }

  return {
    visitorId,
    conversation,
    isOpen,
    loading,
    sending,
    error,
    unreadCount,
    hasConversation,
    openWidget,
    closeWidget,
    startConversation,
    postMessage,
    markAsRead,
    resetConversation,
    loadExisting,
  }
})
