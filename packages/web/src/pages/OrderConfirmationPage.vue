<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { fetchOrder, type ApiOrder } from '../api/checkout'
import { AuthApiErrorResponse, requestMagicLink } from '../api/auth'
import PrimaryButton from '../components/ui/PrimaryButton.vue'
import SecondaryButton from '../components/ui/SecondaryButton.vue'
import CheckoutStepper from '../components/ui/CheckoutStepper.vue'
import { useAuthStore } from '../stores/auth'
import { formatMoney } from '../utils/money'

const { t } = useI18n({ useScope: 'global' })

const route = useRoute()
const orderId = route.params.id as string

const order = ref<ApiOrder | null>(null)
const loading = ref(true)
const error = ref('')
const auth = useAuthStore()
const checkoutEmail = ref('')
const accountPromptError = ref('')
const accountPromptSuccess = ref('')
const sendingAccountLink = ref(false)

onMounted(async () => {
  try {
    if (!auth.initialized) {
      await auth.init()
    }

    order.value = await fetchOrder(orderId)
    checkoutEmail.value = sessionStorage.getItem('cnx-last-checkout-email') ?? ''

    // Clear checkout order payload from sessionStorage.
    sessionStorage.removeItem('cnx-last-order')
  } catch {
    error.value = 'Order not found.'
  } finally {
    loading.value = false
  }
})

async function sendAccountLink() {
  accountPromptError.value = ''
  accountPromptSuccess.value = ''

  const email = checkoutEmail.value.trim().toLowerCase()
  if (!email) {
    accountPromptError.value = 'Checkout email not available for this order.'
    return
  }

  sendingAccountLink.value = true
  try {
    const result = await requestMagicLink(email)
    accountPromptSuccess.value = result.message
  } catch (err) {
    if (err instanceof AuthApiErrorResponse) {
      accountPromptError.value = err.message
    } else {
      accountPromptError.value = 'Unable to send login link right now.'
    }
  } finally {
    sendingAccountLink.value = false
  }
}
</script>

<template>
  <div class="bg-background min-h-[60vh]">
    <CheckoutStepper :current-step="4" />

    <div class="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 pb-16">
      <!-- Loading -->
      <div v-if="loading" class="space-y-6 animate-pulse">
        <div class="h-10 bg-muted/10 rounded w-64 mx-auto" />
        <div class="h-48 bg-muted/10 rounded max-w-lg mx-auto" />
      </div>

      <!-- Error -->
      <div v-else-if="error" class="text-center py-16 space-y-4">
        <p class="text-xl font-semibold text-error">{{ error }}</p>
        <RouterLink to="/shop">
          <SecondaryButton>{{ t('common.backToShop') }}</SecondaryButton>
        </RouterLink>
      </div>

      <!-- Confirmation Content -->
      <div v-else-if="order" class="max-w-2xl mx-auto space-y-8">
        <!-- Success Header -->
        <div class="text-center space-y-4">
          <div class="w-20 h-20 bg-primary/15 rounded-full flex items-center justify-center mx-auto">
            <svg class="w-10 h-10 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 class="text-3xl sm:text-4xl font-bold text-foreground">{{ t('orderConfirmation.title') }}</h1>
          <p class="text-muted text-lg">
            {{ t('orderConfirmation.thankYou') }}
          </p>
        </div>

        <!-- Order Details Card -->
        <div class="bg-surface rounded-lg ring-1 ring-[var(--card-ring)] p-6 space-y-4">
          <div class="flex items-center justify-between">
            <h2 class="text-xl font-bold text-foreground">{{ t('orderConfirmation.orderDetails') }}</h2>
            <span class="text-xs font-mono bg-surface-alt px-3 py-1 rounded text-muted">
              {{ orderId }}
            </span>
          </div>

          <!-- Items -->
          <div class="space-y-3 divide-y divide-sand">
            <div
              v-for="item in order.items"
              :key="item.product_name"
              class="flex justify-between pt-3 first:pt-0"
            >
              <div>
                <p class="text-sm font-medium text-foreground">{{ item.product_name }}</p>
                <p class="text-xs text-muted">{{ t('orderConfirmation.qty', { qty: item.quantity }) }}</p>
              </div>
              <p class="text-sm font-semibold text-foreground">
                {{ formatMoney(item.line_total_thb) }}
              </p>
            </div>
          </div>

          <!-- Totals -->
          <div class="border-t border-sand pt-4 space-y-2 text-sm">
            <div class="flex justify-between">
              <span class="text-muted">{{ t('orderConfirmation.subtotal') }}</span>
              <span class="font-semibold text-foreground">{{ formatMoney(order.subtotal_thb) }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-muted">{{ t('orderConfirmation.shipping') }}</span>
              <span class="font-semibold text-foreground">{{ formatMoney(order.shipping_thb) }}</span>
            </div>
            <div v-if="order.discount_thb > 0" class="flex justify-between">
              <span class="text-muted">{{ t('orderConfirmation.discount') }}</span>
              <span class="font-semibold text-primary">-{{ formatMoney(order.discount_thb) }}</span>
            </div>
          </div>

          <div class="border-t border-sand pt-4">
            <div class="flex justify-between">
              <span class="text-lg font-bold text-foreground">{{ t('orderConfirmation.total') }}</span>
              <span class="text-lg font-bold text-foreground">
                {{ formatMoney(order.total_thb) }}
              </span>
            </div>
          </div>
        </div>

        <!-- What's Next -->
        <div class="bg-surface rounded-lg ring-1 ring-[var(--card-ring)] p-6 space-y-4">
          <h2 class="text-xl font-bold text-foreground">{{ t('orderConfirmation.whatsNext') }}</h2>
          <ol class="space-y-4">
            <li class="flex gap-4">
              <span class="shrink-0 w-8 h-8 bg-primary/15 rounded-full flex items-center justify-center text-sm font-bold text-primary">1</span>
              <div>
                <p class="font-semibold text-foreground">{{ t('orderConfirmation.step1Title') }}</p>
                <p class="text-sm text-muted">{{ t('orderConfirmation.step1Desc') }}</p>
              </div>
            </li>
            <li class="flex gap-4">
              <span class="shrink-0 w-8 h-8 bg-primary/15 rounded-full flex items-center justify-center text-sm font-bold text-primary">2</span>
              <div>
                <p class="font-semibold text-foreground">{{ t('orderConfirmation.step2Title') }}</p>
                <p class="text-sm text-muted">{{ t('orderConfirmation.step2Desc') }}</p>
              </div>
            </li>
            <li class="flex gap-4">
              <span class="shrink-0 w-8 h-8 bg-primary/15 rounded-full flex items-center justify-center text-sm font-bold text-primary">3</span>
              <div>
                <p class="font-semibold text-foreground">{{ t('orderConfirmation.step3Title') }}</p>
                <p class="text-sm text-muted">{{ t('orderConfirmation.step3Desc') }}</p>
              </div>
            </li>
          </ol>
        </div>

        <div
          v-if="!auth.user && checkoutEmail"
          class="bg-primary/10 border border-primary/30 rounded-lg p-6 space-y-3"
        >
          <h2 class="text-xl font-bold text-foreground">{{ t('orderConfirmation.createAccountTitle') }}</h2>
          <p class="text-sm text-muted">
            {{ t('orderConfirmation.createAccountWithEmail', { email: checkoutEmail }) }}
          </p>
          <p v-if="accountPromptError" class="text-sm text-error">{{ accountPromptError }}</p>
          <p v-if="accountPromptSuccess" class="text-sm text-primary">{{ accountPromptSuccess }}</p>
          <PrimaryButton size="sm" :disabled="sendingAccountLink" @click="sendAccountLink">
            {{ sendingAccountLink ? t('orderConfirmation.sendingLink') : t('orderConfirmation.sendLoginLink') }}
          </PrimaryButton>
        </div>

        <!-- Actions -->
        <div class="flex flex-col sm:flex-row gap-4 justify-center">
          <RouterLink :to="`/order/${orderId}`">
            <PrimaryButton size="lg">{{ t('orderConfirmation.trackMyOrder') }}</PrimaryButton>
          </RouterLink>
          <RouterLink to="/shop">
            <SecondaryButton size="lg">{{ t('common.continueShopping') }}</SecondaryButton>
          </RouterLink>
        </div>
      </div>
    </div>
  </div>
</template>
