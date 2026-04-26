<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import PromptPayQR from '../ui/PromptPayQR.vue'

const props = defineProps<{
  promptpayNumber: string
  amountThb: string
}>()

const { t } = useI18n({ useScope: 'global' })
const copied = ref(false)

async function copy() {
  try {
    await navigator.clipboard.writeText(props.promptpayNumber)
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
            d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      </div>
      <div>
        <h2 class="text-xl font-bold text-foreground">{{ t('payment.promptpay') }}</h2>
        <p class="text-sm text-muted">{{ t('payment.scanQRDesc') }}</p>
      </div>
    </div>

    <div class="flex justify-center py-4">
      <div class="bg-white rounded-lg p-4">
        <PromptPayQR :promptpay-id="promptpayNumber" :amount="parseFloat(amountThb)" :size="192" />
      </div>
    </div>

    <div class="flex items-center justify-between bg-surface-alt rounded-md px-4 py-3">
      <div>
        <p class="text-xs text-muted">{{ t('payment.promptpayNumber') }}</p>
        <p class="font-mono text-foreground">{{ promptpayNumber }}</p>
      </div>
      <button @click="copy" class="text-primary text-sm font-semibold hover:underline underline-offset-4">
        {{ copied ? t('payment.copied') : t('payment.copy') }}
      </button>
    </div>
  </div>
</template>
