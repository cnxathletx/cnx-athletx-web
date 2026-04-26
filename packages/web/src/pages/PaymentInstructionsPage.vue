<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { fetchOrder, submitPaymentProof, CheckoutError, type CheckoutResponse, type ApiOrder, type PaymentIntent } from '../api/checkout'
import { fetchOrderIntent } from '../api/paymentMethods'
import PrimaryButton from '../components/ui/PrimaryButton.vue'
import SecondaryButton from '../components/ui/SecondaryButton.vue'
import CheckoutStepper from '../components/ui/CheckoutStepper.vue'
import PromptPayInstructions from '../components/payment/PromptPayInstructions.vue'
import BankTransferInstructions from '../components/payment/BankTransferInstructions.vue'
import { formatMoney } from '../utils/money'

const { t } = useI18n({ useScope: 'global' })

const route = useRoute()
const router = useRouter()
const orderId = route.params.id as string

const order = ref<ApiOrder | null>(null)
const intent = ref<PaymentIntent | null>(null)
const loading = ref(true)
const error = ref('')
const copied = ref('')
const proofValue = ref('')
const proofSubmitting = ref(false)
const proofSuccess = ref('')
const proofError = ref('')

const statusLabelMap = computed<Record<string, string>>(() => ({
  pending_payment: t('orderStatus.statusLabels.pending_payment'),
  paid: t('orderStatus.statusLabels.paid'),
  packed: t('orderStatus.statusLabels.packed'),
  shipped: t('orderStatus.statusLabels.shipped'),
  delivered: t('orderStatus.statusLabels.delivered'),
  cancelled: t('orderStatus.statusLabels.cancelled'),
}))

async function loadOrder() {
  order.value = await fetchOrder(orderId)
}

onMounted(async () => {
  // Fast path: read cached checkout response if it matches this order
  const stored = sessionStorage.getItem('cnx-last-order')
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as CheckoutResponse
      if (parsed.order_id === orderId && parsed.intent) {
        intent.value = parsed.intent
      }
    } catch {
      // ignore parse errors
    }
  }

  // Always fetch fresh order data; rebuild intent from server if not cached
  try {
    await loadOrder()
    if (!intent.value) {
      try {
        const fresh = await fetchOrderIntent(orderId)
        intent.value = fresh.intent
      } catch {
        // Acceptable — page renders order without intent UI
      }
    }
  } catch {
    error.value = 'Order not found. Please check your order ID.'
  } finally {
    loading.value = false
  }
})

const amountDisplay = computed(() => order.value ? formatMoney(order.value.total_thb) : '')

async function copyToClipboard(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text)
    copied.value = label
    setTimeout(() => { copied.value = '' }, 2000)
  } catch {
    // fallback
  }
}

function goToConfirmation() {
  router.push(`/order/${orderId}/confirmation`)
}

const canSubmitProof = computed(() => order.value?.status === 'pending_payment')

const latestProofDateDisplay = computed(() => {
  if (!order.value?.latest_payment_proof) return ''
  return new Date(order.value.latest_payment_proof.submitted_at).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
})

const orderStatusLabel = computed(() => {
  if (!order.value) return ''
  return statusLabelMap.value[order.value.status] ?? order.value.status
})

async function handleSubmitProof() {
  proofError.value = ''
  proofSuccess.value = ''

  if (!canSubmitProof.value) {
    proofError.value = `Payment proof cannot be submitted once order is ${orderStatusLabel.value.toLowerCase()}.`
    return
  }

  const value = proofValue.value.trim()
  if (value.length < 5 || value.length > 100) {
    proofError.value = 'Reference must be between 5 and 100 characters.'
    return
  }

  proofSubmitting.value = true
  try {
    const result = await submitPaymentProof(orderId, value)
    proofSuccess.value = result.message
    proofValue.value = ''
    await loadOrder()
  } catch (err) {
    if (err instanceof CheckoutError) {
      proofError.value = err.message
    } else {
      proofError.value = 'Failed to submit payment proof. Please try again.'
    }
  } finally {
    proofSubmitting.value = false
  }
}
</script>

<template>
  <div class="bg-background min-h-[60vh]">
    <CheckoutStepper :current-step="3" />

    <div class="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 pb-16">
      <!-- Loading -->
      <div v-if="loading" class="space-y-6 animate-pulse">
        <div class="h-10 bg-muted/10 rounded w-64" />
        <div class="h-64 bg-muted/10 rounded" />
      </div>

      <!-- Error -->
      <div v-else-if="error" class="text-center py-16 space-y-4">
        <p class="text-xl font-semibold text-error">{{ error }}</p>
        <RouterLink to="/shop">
          <SecondaryButton>{{ t('common.backToShop') }}</SecondaryButton>
        </RouterLink>
      </div>

      <!-- Payment Instructions -->
      <div v-else-if="order" class="space-y-8">
        <div>
          <h1 class="text-3xl sm:text-4xl font-bold text-foreground">{{ t('payment.title') }}</h1>
          <p class="mt-2 text-muted">
            {{ t('payment.completePayment') }}
            <span class="font-mono text-foreground">{{ orderId }}</span>
          </p>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <!-- Payment Methods -->
          <div class="lg:col-span-2 space-y-6">
            <!-- Amount Due -->
            <div class="bg-primary/10 border border-primary/30 rounded-lg p-6 text-center">
              <p class="text-sm text-muted mb-1">{{ t('payment.amountDue') }}</p>
              <p class="text-4xl font-bold text-primary">{{ amountDisplay }}</p>
            </div>

            <!-- Provider-specific instructions -->
            <template v-if="intent && intent.kind === 'instructions'">
              <PromptPayInstructions
                v-if="intent.provider === 'promptpay'"
                :promptpay-number="String(intent.instructions.promptpay_number)"
                :amount-thb="String(intent.instructions.amount_thb)"
              />
              <BankTransferInstructions
                v-else-if="intent.provider === 'bank_transfer'"
                :bank-name="String(intent.instructions.bank_name)"
                :account-name="String(intent.instructions.account_name)"
                :account-number="String(intent.instructions.account_number)"
              />
            </template>

            <!-- Fallback when no intent available -->
            <div
              v-else
              class="bg-surface rounded-lg ring-1 ring-[var(--card-ring)] p-6 space-y-4"
            >
              <h2 class="text-xl font-bold text-foreground">{{ t('payment.paymentDetails') }}</h2>
              <p class="text-muted">{{ t('payment.paymentDetailsFallback') }}</p>
            </div>

            <!-- Payment Proof -->
            <div class="bg-surface rounded-lg ring-1 ring-[var(--card-ring)] p-6 space-y-4">
              <div>
                <h2 class="text-xl font-bold text-foreground">{{ t('payment.submitProof') }}</h2>
                <p class="text-sm text-muted mt-1">
                  {{ t('payment.submitProofDesc') }}
                </p>
              </div>

              <div
                v-if="order.payment_submitted && order.latest_payment_proof"
                class="rounded-md border border-primary/30 bg-primary/10 px-4 py-3 text-sm"
              >
                <p class="font-semibold text-foreground">{{ t('payment.latestProof') }}</p>
                <p class="text-muted mt-1">
                  {{ t('payment.reference') }}
                  <span class="font-mono text-foreground">{{ order.latest_payment_proof.proof_value }}</span>
                </p>
                <p class="text-muted">{{ t('payment.submitted') }} {{ latestProofDateDisplay }}</p>
              </div>

              <div
                v-if="!canSubmitProof"
                class="rounded-md border border-muted/30 bg-surface-alt px-4 py-3 text-sm text-muted"
              >
                {{ t('payment.proofUnavailable') }}
                <span class="font-semibold text-foreground">{{ orderStatusLabel }}</span>.
              </div>

              <form v-else class="space-y-3" @submit.prevent="handleSubmitProof">
                <div>
                  <label for="proof-value" class="block text-sm font-medium text-foreground mb-1">
                    {{ t('payment.transferReference') }}
                  </label>
                  <input
                    id="proof-value"
                    v-model="proofValue"
                    type="text"
                    maxlength="100"
                    placeholder="TXN20260211083045"
                    class="w-full rounded-md border border-sand px-4 py-3 text-sm bg-surface-alt text-foreground placeholder:text-muted transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  />
                </div>

                <p v-if="proofError" class="text-sm text-error">{{ proofError }}</p>
                <p v-if="proofSuccess" class="text-sm text-primary">{{ proofSuccess }}</p>

                <PrimaryButton :disabled="proofSubmitting" size="md">
                  {{ proofSubmitting ? t('payment.submitting') : (order.payment_submitted ? t('payment.submitUpdatedRef') : t('payment.submitProof')) }}
                </PrimaryButton>
              </form>
            </div>
          </div>

          <!-- Order Summary Sidebar -->
          <div class="lg:col-span-1">
            <div class="bg-surface rounded-lg ring-1 ring-[var(--card-ring)] p-6 space-y-4 sticky top-20">
              <h2 class="text-xl font-bold text-foreground">{{ t('payment.orderSummary') }}</h2>

              <div class="space-y-3 divide-y divide-sand">
                <div
                  v-for="item in order.items"
                  :key="item.product_name"
                  class="flex justify-between pt-3 first:pt-0"
                >
                  <div>
                    <p class="text-sm font-medium text-foreground">{{ item.product_name }}</p>
                    <p class="text-xs text-muted">{{ t('payment.qty', { qty: item.quantity }) }}</p>
                  </div>
                  <p class="text-sm font-semibold text-foreground">
                    {{ formatMoney(item.line_total_thb) }}
                  </p>
                </div>
              </div>

              <div class="border-t border-sand pt-4 space-y-2 text-sm">
                <div class="flex justify-between">
                  <span class="text-muted">{{ t('payment.subtotal') }}</span>
                  <span class="font-semibold text-foreground">{{ formatMoney(order.subtotal_thb) }}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-muted">{{ t('payment.shipping') }}</span>
                  <span class="font-semibold text-foreground">{{ formatMoney(order.shipping_thb) }}</span>
                </div>
                <div v-if="order.discount_thb > 0" class="flex justify-between">
                  <span class="text-muted">{{ t('payment.discount') }}</span>
                  <span class="font-semibold text-primary">-{{ formatMoney(order.discount_thb) }}</span>
                </div>
              </div>

              <div class="border-t border-sand pt-4">
                <div class="flex justify-between">
                  <span class="text-lg font-bold text-foreground">{{ t('payment.total') }}</span>
                  <span class="text-lg font-bold text-foreground">{{ amountDisplay }}</span>
                </div>
              </div>

              <div class="space-y-3 pt-2">
                <PrimaryButton full-width size="lg" @click="goToConfirmation">
                  {{ t('payment.madePayment') }}
                </PrimaryButton>
                <RouterLink :to="`/order/${orderId}`" class="block text-center">
                  <button class="text-primary font-semibold text-sm hover:underline underline-offset-4">
                    {{ t('payment.trackOrderStatus') }}
                  </button>
                </RouterLink>
              </div>
            </div>
          </div>
        </div>

        <!-- Important Notes -->
        <div class="bg-accent/10 border border-accent/30 rounded-lg p-6 space-y-2">
          <h3 class="font-bold text-foreground flex items-center gap-2">
            <svg class="w-5 h-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {{ t('payment.important') }}
          </h3>
          <ul class="text-sm text-muted space-y-1 list-disc list-inside">
            <li>{{ t('payment.note1') }}</li>
            <li>{{ t('payment.note2', { orderId }) }}</li>
            <li>{{ t('payment.note3') }}</li>
            <li>{{ t('payment.note4') }}</li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>
