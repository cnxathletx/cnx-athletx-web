<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import AdminNav from '../components/admin/AdminNav.vue'
import {
  fetchAdminChatConversations,
  fetchAdminChatConversation,
  postAdminChatMessage,
  markAdminChatRead,
  updateAdminChatStatus,
  AdminApiErrorResponse,
  type AdminChatConversation,
  type AdminChatConversationDetail,
  type AdminChatStatus,
} from '../api/admin'

const LIST_POLL_MS = 10000
const DETAIL_POLL_MS = 5000

const loadingList = ref(true)
const listError = ref('')
const conversations = ref<AdminChatConversation[]>([])
const statusFilter = ref<AdminChatStatus | ''>('open')
const searchQuery = ref('')

const selectedId = ref<string | null>(null)
const detail = ref<AdminChatConversationDetail | null>(null)
const loadingDetail = ref(false)
const detailError = ref('')

const replyBody = ref('')
const sending = ref(false)
const updatingStatus = ref(false)

let listInterval: number | null = null
let detailInterval: number | null = null

const selectedConversation = computed(() =>
  conversations.value.find((c) => c.id === selectedId.value) ?? null,
)

async function loadConversations() {
  try {
    const res = await fetchAdminChatConversations({
      status: statusFilter.value || undefined,
      q: searchQuery.value.trim() || undefined,
      limit: 50,
    })
    conversations.value = res.conversations
    listError.value = ''
  } catch (err) {
    listError.value = err instanceof AdminApiErrorResponse ? err.message : 'Unable to load conversations.'
  } finally {
    loadingList.value = false
  }
}

async function selectConversation(id: string) {
  selectedId.value = id
  detail.value = null
  detailError.value = ''
  loadingDetail.value = true
  await loadDetail()
  loadingDetail.value = false
  startDetailPolling()
}

async function loadDetail() {
  if (!selectedId.value) return
  try {
    detail.value = await fetchAdminChatConversation(selectedId.value)
    if (detail.value.unread_count > 0) {
      await markAdminChatRead(selectedId.value)
      detail.value.unread_count = 0
      const item = conversations.value.find((c) => c.id === selectedId.value)
      if (item) item.unread_count = 0
    }
  } catch (err) {
    detailError.value = err instanceof AdminApiErrorResponse ? err.message : 'Unable to load conversation.'
  }
}

async function handleSend() {
  const body = replyBody.value.trim()
  if (!body || !selectedId.value) return
  sending.value = true
  try {
    await postAdminChatMessage(selectedId.value, body)
    replyBody.value = ''
    await loadDetail()
    await loadConversations()
  } catch (err) {
    detailError.value = err instanceof AdminApiErrorResponse ? err.message : 'Failed to send message.'
  } finally {
    sending.value = false
  }
}

async function toggleStatus() {
  if (!detail.value || !selectedId.value) return
  const nextStatus: AdminChatStatus = detail.value.status === 'open' ? 'closed' : 'open'
  updatingStatus.value = true
  try {
    await updateAdminChatStatus(selectedId.value, nextStatus)
    await loadDetail()
    await loadConversations()
  } catch (err) {
    detailError.value = err instanceof AdminApiErrorResponse ? err.message : 'Failed to update status.'
  } finally {
    updatingStatus.value = false
  }
}

function startListPolling() {
  stopListPolling()
  listInterval = window.setInterval(() => {
    void loadConversations()
  }, LIST_POLL_MS)
}

function stopListPolling() {
  if (listInterval !== null) {
    window.clearInterval(listInterval)
    listInterval = null
  }
}

function startDetailPolling() {
  stopDetailPolling()
  detailInterval = window.setInterval(() => {
    void loadDetail()
  }, DETAIL_POLL_MS)
}

function stopDetailPolling() {
  if (detailInterval !== null) {
    window.clearInterval(detailInterval)
    detailInterval = null
  }
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    void handleSend()
  }
}

watch([statusFilter, searchQuery], () => {
  loadingList.value = true
  void loadConversations()
})

onMounted(async () => {
  await loadConversations()
  startListPolling()
})

onBeforeUnmount(() => {
  stopListPolling()
  stopDetailPolling()
})
</script>

<template>
  <div class="min-h-screen bg-background">
    <div class="max-w-7xl mx-auto px-4 py-8">
      <div class="flex items-start justify-between flex-wrap gap-4 mb-6">
        <div>
          <h1 class="text-2xl font-bold text-foreground">Chat</h1>
          <p class="mt-1 text-sm text-muted">Customer support conversations</p>
        </div>
        <AdminNav />
      </div>

      <div class="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-4">
        <!-- List -->
        <div class="rounded-lg bg-surface ring-1 ring-sand flex flex-col h-[calc(100vh-220px)]">
          <div class="px-3 py-3 border-b border-sand space-y-2">
            <select
              v-model="statusFilter"
              class="w-full rounded-md bg-surface-alt text-foreground text-sm px-2 py-1.5 ring-1 ring-sand focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="open">Open</option>
              <option value="closed">Closed</option>
              <option value="">All</option>
            </select>
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Search name or email"
              class="w-full rounded-md bg-surface-alt text-foreground text-sm px-2 py-1.5 ring-1 ring-sand focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div class="flex-1 overflow-y-auto">
            <p v-if="loadingList" class="p-4 text-sm text-muted">Loading...</p>
            <p v-else-if="listError" class="p-4 text-sm text-accent">{{ listError }}</p>
            <p v-else-if="conversations.length === 0" class="p-4 text-sm text-muted">No conversations.</p>
            <ul v-else class="divide-y divide-sand">
              <li v-for="c in conversations" :key="c.id">
                <button
                  type="button"
                  class="w-full text-left px-3 py-3 hover:bg-surface-alt focus:outline-none focus:bg-surface-alt transition-colors"
                  :class="{ 'bg-surface-alt': c.id === selectedId }"
                  @click="selectConversation(c.id)"
                >
                  <div class="flex items-center justify-between gap-2">
                    <span class="text-sm font-semibold text-foreground truncate">
                      {{ c.guest_name || 'Anonymous' }}
                    </span>
                    <span
                      v-if="c.unread_count > 0"
                      class="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-accent text-background text-[10px] font-bold"
                    >
                      {{ c.unread_count > 9 ? '9+' : c.unread_count }}
                    </span>
                  </div>
                  <p class="mt-0.5 text-xs text-muted truncate">{{ c.guest_email || '—' }}</p>
                  <div class="mt-1 flex items-center gap-2">
                    <span
                      class="inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded"
                      :class="c.status === 'open' ? 'bg-primary/20 text-primary' : 'bg-surface ring-1 ring-sand text-muted'"
                    >
                      {{ c.status }}
                    </span>
                    <span class="text-[10px] text-muted">{{ formatDateTime(c.last_message_at) }}</span>
                  </div>
                </button>
              </li>
            </ul>
          </div>
        </div>

        <!-- Detail -->
        <div class="rounded-lg bg-surface ring-1 ring-sand flex flex-col h-[calc(100vh-220px)]">
          <template v-if="!selectedConversation">
            <div class="flex-1 flex items-center justify-center text-sm text-muted">
              Select a conversation to view messages.
            </div>
          </template>
          <template v-else>
            <div class="px-4 py-3 border-b border-sand flex items-start justify-between gap-3">
              <div>
                <p class="text-sm font-bold text-foreground">{{ selectedConversation.guest_name || 'Anonymous' }}</p>
                <p class="text-xs text-muted">{{ selectedConversation.guest_email || '—' }}</p>
                <p class="text-[11px] text-muted mt-1">Started {{ formatDateTime(selectedConversation.created_at) }}</p>
              </div>
              <button
                type="button"
                :disabled="updatingStatus || !detail"
                class="rounded-md px-3 py-1.5 text-xs font-semibold ring-1 transition-colors disabled:opacity-50"
                :class="detail?.status === 'open'
                  ? 'ring-accent text-accent hover:bg-accent hover:text-background'
                  : 'ring-primary text-primary hover:bg-primary hover:text-background'"
                @click="toggleStatus"
              >
                {{ detail?.status === 'open' ? 'Close' : 'Reopen' }}
              </button>
            </div>

            <div class="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              <p v-if="loadingDetail && !detail" class="text-sm text-muted">Loading...</p>
              <p v-if="detailError" class="text-sm text-accent">{{ detailError }}</p>
              <template v-if="detail">
                <div
                  v-for="msg in detail.messages"
                  :key="msg.id"
                  :class="['flex', msg.sender_type === 'admin' ? 'justify-end' : 'justify-start']"
                >
                  <div
                    :class="[
                      'max-w-[70%] rounded-lg px-3 py-2 text-sm',
                      msg.sender_type === 'admin'
                        ? 'bg-primary text-background'
                        : 'bg-surface-alt text-foreground ring-1 ring-sand',
                    ]"
                  >
                    <div class="whitespace-pre-wrap break-words">{{ msg.body }}</div>
                    <div class="mt-1 text-[10px] opacity-70">{{ formatDateTime(msg.created_at) }}</div>
                  </div>
                </div>
              </template>
            </div>

            <form
              class="border-t border-sand p-3 flex items-end gap-2"
              @submit.prevent="handleSend"
            >
              <textarea
                v-model="replyBody"
                rows="2"
                placeholder="Type a reply..."
                :disabled="detail?.status === 'closed' || sending"
                class="flex-1 resize-none rounded-md bg-surface-alt text-foreground text-sm px-3 py-2 ring-1 ring-sand focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60"
                @keydown="handleKeydown"
              />
              <button
                type="submit"
                :disabled="sending || !replyBody.trim() || detail?.status === 'closed'"
                class="rounded-md bg-primary text-background font-semibold px-4 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.97] transition-all"
              >
                {{ sending ? 'Sending...' : 'Send' }}
              </button>
            </form>
          </template>
        </div>
      </div>

      <div class="mt-6 text-center">
        <RouterLink to="/admin" class="text-sm text-muted hover:text-primary transition-colors underline underline-offset-4">
          Back to dashboard
        </RouterLink>
      </div>
    </div>
  </div>
</template>
