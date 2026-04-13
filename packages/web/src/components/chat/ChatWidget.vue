<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { useChatStore } from '../../stores/chat'
import { useAuthStore } from '../../stores/auth'
import ChatMessageList from './ChatMessageList.vue'
import ChatComposer from './ChatComposer.vue'
import ChatPreForm from './ChatPreForm.vue'

const { t } = useI18n({ useScope: 'global' })
const route = useRoute()
const chat = useChatStore()
const auth = useAuthStore()

const isAdminRoute = computed(() => route.path.startsWith('/admin'))
const showWidget = computed(() => !isAdminRoute.value)

const hasConversation = computed(() => chat.conversation !== null)
const isOpen = computed(() => chat.isOpen)
const isClosed = computed(() => chat.conversation?.status === 'closed')

onMounted(async () => {
  await chat.loadExisting()
})

onBeforeUnmount(() => {
  chat.closeWidget()
})

watch(
  () => chat.conversation?.unread_count ?? 0,
  (count) => {
    if (isOpen.value && count > 0) {
      void chat.markAsRead()
    }
  },
)

function toggle() {
  if (isOpen.value) {
    chat.closeWidget()
  } else {
    void chat.openWidget()
  }
}

async function handlePreFormSubmit(payload: { name: string; email: string; message: string }) {
  await chat.startConversation({
    initial_message: payload.message,
    guest_name: payload.name,
    guest_email: payload.email,
  })
}

async function handleLoggedInStart(body: string) {
  await chat.startConversation({ initial_message: body })
}

async function handleSend(body: string) {
  if (!hasConversation.value) {
    await handleLoggedInStart(body)
  } else {
    await chat.postMessage(body)
  }
}
</script>

<template>
  <div v-if="showWidget" class="fixed bottom-4 right-4 z-50 pointer-events-none">
    <div class="pointer-events-auto flex flex-col items-end gap-3">
      <div
        v-if="isOpen"
        class="w-[min(360px,calc(100vw-2rem))] h-[min(520px,calc(100vh-6rem))] rounded-xl bg-surface shadow-2xl ring-1 ring-sand flex flex-col overflow-hidden"
        role="dialog"
        :aria-label="t('chat.title')"
      >
        <div class="flex items-center justify-between px-4 py-3 bg-primary text-background">
          <div>
            <p class="text-sm font-bold leading-tight">{{ t('chat.title') }}</p>
            <p class="text-[11px] opacity-90">{{ t('chat.emptyHint') }}</p>
          </div>
          <button
            type="button"
            class="p-1 rounded hover:bg-black/10 focus:outline-none"
            :aria-label="t('chat.closeLabel')"
            @click="toggle"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M4.29 4.29a1 1 0 011.42 0L10 8.59l4.29-4.3a1 1 0 111.42 1.42L11.41 10l4.3 4.29a1 1 0 01-1.42 1.42L10 11.41l-4.29 4.3a1 1 0 01-1.42-1.42L8.59 10l-4.3-4.29a1 1 0 010-1.42z" clip-rule="evenodd" />
            </svg>
          </button>
        </div>

        <template v-if="!hasConversation && !auth.isAuthenticated">
          <ChatPreForm
            :loading="chat.loading"
            :error="chat.error"
            @submit="handlePreFormSubmit"
          />
        </template>

        <template v-else-if="!hasConversation && auth.isAuthenticated">
          <div class="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            <p class="text-sm text-foreground/80">{{ t('chat.emptyHint') }}</p>
            <p v-if="chat.error" class="text-xs text-accent">{{ chat.error }}</p>
          </div>
          <ChatComposer :sending="chat.sending" @send="handleSend" />
        </template>

        <template v-else>
          <ChatMessageList :messages="chat.conversation?.messages ?? []" />
          <p v-if="isClosed" class="px-4 py-2 text-xs text-foreground/70 bg-surface-alt border-t border-sand">
            {{ t('chat.closedNotice') }}
          </p>
          <p v-if="chat.error" class="px-4 py-2 text-xs text-accent bg-surface-alt border-t border-sand">
            {{ chat.error }}
          </p>
          <ChatComposer
            :disabled="isClosed"
            :sending="chat.sending"
            @send="handleSend"
          />
        </template>
      </div>

      <button
        type="button"
        class="relative rounded-full bg-primary text-background shadow-lg h-14 w-14 flex items-center justify-center hover:scale-105 active:scale-95 transition-transform focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background"
        :aria-label="isOpen ? t('chat.closeLabel') : t('chat.openLabel')"
        @click="toggle"
      >
        <svg
          v-if="!isOpen"
          xmlns="http://www.w3.org/2000/svg"
          class="h-6 w-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="2"
        >
          <path stroke-linecap="round" stroke-linejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.77 9.77 0 01-4-.85L3 20l1.4-4.2A7.94 7.94 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        <svg
          v-else
          xmlns="http://www.w3.org/2000/svg"
          class="h-6 w-6"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path fill-rule="evenodd" d="M4.29 4.29a1 1 0 011.42 0L10 8.59l4.29-4.3a1 1 0 111.42 1.42L11.41 10l4.3 4.29a1 1 0 01-1.42 1.42L10 11.41l-4.29 4.3a1 1 0 01-1.42-1.42L8.59 10l-4.3-4.29a1 1 0 010-1.42z" clip-rule="evenodd" />
        </svg>
        <span
          v-if="!isOpen && chat.unreadCount > 0"
          class="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-accent text-background text-[11px] font-bold flex items-center justify-center"
        >
          {{ chat.unreadCount > 9 ? '9+' : chat.unreadCount }}
        </span>
      </button>
    </div>
  </div>
</template>
