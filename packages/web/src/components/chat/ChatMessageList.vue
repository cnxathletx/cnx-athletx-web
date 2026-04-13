<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import type { ChatMessage } from '../../api/chat'

const props = defineProps<{
  messages: ChatMessage[]
}>()

const container = ref<HTMLDivElement | null>(null)

async function scrollToBottom() {
  await nextTick()
  if (container.value) {
    container.value.scrollTop = container.value.scrollHeight
  }
}

watch(
  () => props.messages.length,
  () => {
    void scrollToBottom()
  },
  { immediate: true },
)

function formatTime(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}
</script>

<template>
  <div ref="container" class="flex-1 overflow-y-auto px-4 py-3 space-y-3">
    <div
      v-for="msg in messages"
      :key="msg.id"
      :class="[
        'flex',
        msg.sender_type === 'customer' ? 'justify-end' : 'justify-start',
      ]"
    >
      <div
        :class="[
          'max-w-[80%] rounded-lg px-3 py-2 text-sm',
          msg.sender_type === 'customer'
            ? 'bg-primary text-background'
            : 'bg-surface-alt text-foreground ring-1 ring-sand',
        ]"
      >
        <div class="whitespace-pre-wrap break-words">{{ msg.body }}</div>
        <div
          :class="[
            'mt-1 text-[10px] opacity-70',
            msg.sender_type === 'customer' ? 'text-right' : 'text-left',
          ]"
        >
          {{ formatTime(msg.created_at) }}
        </div>
      </div>
    </div>
  </div>
</template>
