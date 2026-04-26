<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  bankName: string
  accountName: string
  accountNumber: string
}>()

const { t } = useI18n({ useScope: 'global' })
const copied = ref(false)

async function copy() {
  try {
    await navigator.clipboard.writeText(props.accountNumber)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch {
    // fallback ignored
  }
}
</script>

<template>
  <div class="bg-surface rounded-lg ring-1 ring-[var(--card-ring)] p-6 space-y-4">
    <div class="flex items-center gap-3">
      <div class="w-10 h-10 bg-primary/15 rounded-lg flex items-center justify-center">
        <svg class="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      </div>
      <div>
        <h2 class="text-xl font-bold text-foreground">{{ t('payment.bankTransfer') }}</h2>
        <p class="text-sm text-muted">{{ t('payment.transferToAccount') }}</p>
      </div>
    </div>

    <div class="space-y-3">
      <div class="bg-surface-alt rounded-md px-4 py-3">
        <p class="text-xs text-muted">{{ t('payment.bankName') }}</p>
        <p class="font-medium text-foreground">{{ bankName }}</p>
      </div>
      <div class="bg-surface-alt rounded-md px-4 py-3">
        <p class="text-xs text-muted">{{ t('payment.accountName') }}</p>
        <p class="font-medium text-foreground">{{ accountName }}</p>
      </div>
      <div class="flex items-center justify-between bg-surface-alt rounded-md px-4 py-3">
        <div>
          <p class="text-xs text-muted">{{ t('payment.accountNumber') }}</p>
          <p class="font-mono text-foreground">{{ accountNumber }}</p>
        </div>
        <button @click="copy" class="text-primary text-sm font-semibold hover:underline underline-offset-4">
          {{ copied ? t('payment.copied') : t('payment.copy') }}
        </button>
      </div>
    </div>
  </div>
</template>
