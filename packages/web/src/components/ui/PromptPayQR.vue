<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import generatePayload from 'promptpay-qr'
import QRCode from 'qrcode'

const props = defineProps<{
  promptpayId: string
  amount?: number
  size?: number
}>()

const dataUrl = ref('')
const error = ref(false)

async function generate() {
  error.value = false
  dataUrl.value = ''

  if (!props.promptpayId) {
    error.value = true
    return
  }

  try {
    const payload = generatePayload(props.promptpayId, {
      amount: props.amount,
    })

    dataUrl.value = await QRCode.toDataURL(payload, {
      width: props.size ?? 200,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
      errorCorrectionLevel: 'M',
    })
  } catch {
    error.value = true
  }
}

onMounted(generate)
watch(() => [props.promptpayId, props.amount, props.size], generate)
</script>

<template>
  <div class="inline-flex items-center justify-center">
    <img
      v-if="dataUrl"
      :src="dataUrl"
      alt="PromptPay QR Code"
      :width="size ?? 200"
      :height="size ?? 200"
      class="rounded-md"
    />
    <div
      v-else-if="error"
      class="flex items-center justify-center text-sm text-muted bg-surface-alt rounded-md"
      :style="{ width: `${size ?? 200}px`, height: `${size ?? 200}px` }"
    >
      QR unavailable
    </div>
    <div
      v-else
      class="animate-pulse bg-surface-alt rounded-md"
      :style="{ width: `${size ?? 200}px`, height: `${size ?? 200}px` }"
    />
  </div>
</template>
