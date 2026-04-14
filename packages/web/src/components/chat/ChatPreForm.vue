<script setup lang="ts">
import { reactive } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n({ useScope: 'global' })

const props = defineProps<{
  loading?: boolean
  error?: string
}>()

const emit = defineEmits<{
  (event: 'submit', payload: { name: string; email: string; message: string }): void
}>()

const form = reactive({
  name: '',
  email: '',
  message: '',
})

function handleSubmit() {
  if (props.loading) return
  emit('submit', {
    name: form.name.trim(),
    email: form.email.trim().toLowerCase(),
    message: form.message.trim(),
  })
}
</script>

<template>
  <form class="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3" @submit.prevent="handleSubmit">
    <p class="text-sm text-foreground/80">{{ t('chat.preFormHint') }}</p>

    <div>
      <label class="block text-xs font-semibold text-foreground mb-1">
        {{ t('chat.nameLabel') }}
      </label>
      <input
        v-model="form.name"
        type="text"
        required
        minlength="2"
        maxlength="100"
        :placeholder="t('chat.namePlaceholder')"
        class="w-full rounded-md bg-surface-alt text-foreground text-sm px-3 py-2 ring-1 ring-sand focus:outline-none focus:ring-2 focus:ring-primary"
      />
    </div>

    <div>
      <label class="block text-xs font-semibold text-foreground mb-1">
        {{ t('chat.emailLabel') }}
      </label>
      <input
        v-model="form.email"
        type="email"
        required
        :placeholder="t('chat.emailPlaceholder')"
        class="w-full rounded-md bg-surface-alt text-foreground text-sm px-3 py-2 ring-1 ring-sand focus:outline-none focus:ring-2 focus:ring-primary"
      />
    </div>

    <div>
      <label class="block text-xs font-semibold text-foreground mb-1">
        {{ t('chat.messageLabel') }}
      </label>
      <textarea
        v-model="form.message"
        required
        minlength="1"
        maxlength="2000"
        rows="3"
        :placeholder="t('chat.messagePlaceholder')"
        class="w-full resize-none rounded-md bg-surface-alt text-foreground text-sm px-3 py-2 ring-1 ring-sand focus:outline-none focus:ring-2 focus:ring-primary"
      />
    </div>

    <p v-if="error" class="text-xs text-accent">{{ error }}</p>

    <button
      type="submit"
      :disabled="loading"
      class="w-full rounded-md bg-primary text-background font-semibold px-4 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.97] transition-all"
    >
      {{ loading ? t('chat.starting') : t('chat.startLabel') }}
    </button>
  </form>
</template>
