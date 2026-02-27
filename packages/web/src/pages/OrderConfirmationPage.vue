<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { fetchOrder, type ApiOrder } from '../api/checkout'
import { AuthApiErrorResponse, requestMagicLink } from '../api/auth'
import PrimaryButton from '../components/ui/PrimaryButton.vue'
import SecondaryButton from '../components/ui/SecondaryButton.vue'
import CheckoutStepper from '../components/ui/CheckoutStepper.vue'
import { useAuthStore } from '../stores/auth'

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
          <SecondaryButton>Back to Shop</SecondaryButton>
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
          <h1 class="text-3xl sm:text-4xl font-bold text-foreground">Order Placed!</h1>
          <p class="text-muted text-lg">
            Thank you for your order. We'll process it once payment is confirmed.
          </p>
        </div>

        <!-- Order Details Card -->
        <div class="bg-surface rounded-lg ring-1 ring-[var(--card-ring)] p-6 space-y-4">
          <div class="flex items-center justify-between">
            <h2 class="text-xl font-bold text-foreground">Order Details</h2>
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
                <p class="text-xs text-muted">Qty: {{ item.quantity }}</p>
              </div>
              <p class="text-sm font-semibold text-foreground">
                ฿{{ item.line_total_thb.toLocaleString() }}
              </p>
            </div>
          </div>

          <!-- Totals -->
          <div class="border-t border-sand pt-4 space-y-2 text-sm">
            <div class="flex justify-between">
              <span class="text-muted">Subtotal</span>
              <span class="font-semibold text-foreground">฿{{ order.subtotal_thb.toLocaleString() }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-muted">Shipping</span>
              <span class="font-semibold text-foreground">฿{{ order.shipping_thb.toLocaleString() }}</span>
            </div>
            <div v-if="order.discount_thb > 0" class="flex justify-between">
              <span class="text-muted">Discount</span>
              <span class="font-semibold text-primary">-฿{{ order.discount_thb.toLocaleString() }}</span>
            </div>
          </div>

          <div class="border-t border-sand pt-4">
            <div class="flex justify-between">
              <span class="text-lg font-bold text-foreground">Total</span>
              <span class="text-lg font-bold text-foreground">
                ฿{{ order.total_thb.toLocaleString() }}
              </span>
            </div>
          </div>
        </div>

        <!-- What's Next -->
        <div class="bg-surface rounded-lg ring-1 ring-[var(--card-ring)] p-6 space-y-4">
          <h2 class="text-xl font-bold text-foreground">What's Next?</h2>
          <ol class="space-y-4">
            <li class="flex gap-4">
              <span class="shrink-0 w-8 h-8 bg-primary/15 rounded-full flex items-center justify-center text-sm font-bold text-primary">1</span>
              <div>
                <p class="font-semibold text-foreground">Complete Payment</p>
                <p class="text-sm text-muted">Transfer the exact amount using the payment details provided.</p>
              </div>
            </li>
            <li class="flex gap-4">
              <span class="shrink-0 w-8 h-8 bg-primary/15 rounded-full flex items-center justify-center text-sm font-bold text-primary">2</span>
              <div>
                <p class="font-semibold text-foreground">Payment Verification</p>
                <p class="text-sm text-muted">We'll verify your payment within 1-2 business hours.</p>
              </div>
            </li>
            <li class="flex gap-4">
              <span class="shrink-0 w-8 h-8 bg-primary/15 rounded-full flex items-center justify-center text-sm font-bold text-primary">3</span>
              <div>
                <p class="font-semibold text-foreground">Order Shipped</p>
                <p class="text-sm text-muted">You'll receive an email with tracking information once shipped.</p>
              </div>
            </li>
          </ol>
        </div>

        <div
          v-if="!auth.user && checkoutEmail"
          class="bg-primary/10 border border-primary/30 rounded-lg p-6 space-y-3"
        >
          <h2 class="text-xl font-bold text-foreground">Create an Account to Track Orders</h2>
          <p class="text-sm text-muted">
            We can create your account with
            <span class="font-medium text-foreground">{{ checkoutEmail }}</span>
            and link your past guest orders automatically.
          </p>
          <p v-if="accountPromptError" class="text-sm text-error">{{ accountPromptError }}</p>
          <p v-if="accountPromptSuccess" class="text-sm text-primary">{{ accountPromptSuccess }}</p>
          <PrimaryButton size="sm" :disabled="sendingAccountLink" @click="sendAccountLink">
            {{ sendingAccountLink ? 'Sending...' : 'Send Account Login Link' }}
          </PrimaryButton>
        </div>

        <!-- Actions -->
        <div class="flex flex-col sm:flex-row gap-4 justify-center">
          <RouterLink :to="`/order/${orderId}`">
            <PrimaryButton size="lg">Track My Order</PrimaryButton>
          </RouterLink>
          <RouterLink to="/shop">
            <SecondaryButton size="lg">Continue Shopping</SecondaryButton>
          </RouterLink>
        </div>
      </div>
    </div>
  </div>
</template>
