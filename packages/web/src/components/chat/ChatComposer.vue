<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n({ useScope: 'global' })

const props = defineProps<{
  disabled?: boolean
  sending?: boolean
}>()

const emit = defineEmits<{
  (event: 'send', body: string): void
}>()

const text = ref('')

function handleSubmit() {
  const trimmed = text.value.trim()
  if (!trimmed || props.disabled || props.sending) return
  emit('send', trimmed)
  text.value = ''
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    handleSubmit()
  }
}
</script>

<template>
  <form
    class="flex-shrink-0 border-t border-sand bg-surface px-3 py-2 flex items-end gap-2"
    @submit.prevent="handleSubmit"
  >
    <textarea
      v-model="text"
      :disabled="disabled"
      rows="1"
      :placeholder="t('chat.messagePlaceholder')"
      class="flex-1 resize-none rounded-md bg-surface-alt text-foreground text-sm px-3 py-2 ring-1 ring-sand focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60 max-h-24"
      @keydown="handleKeydown"
    />
    <button
      type="submit"
      :disabled="disabled || sending || !text.trim()"
      class="rounded-md bg-primary text-background font-semibold px-3 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.97] transition-all"
    >
      {{ sending ? t('chat.sending') : t('chat.sendLabel') }}
    </button>
  </form>
</template>
