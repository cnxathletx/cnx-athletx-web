<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { fetchOrder, type ApiOrder } from '../api/checkout'
import SecondaryButton from '../components/ui/SecondaryButton.vue'

const route = useRoute()
const orderId = route.params.id as string

const order = ref<ApiOrder | null>(null)
const loading = ref(true)
const error = ref('')

onMounted(async () => {
  try {
    order.value = await fetchOrder(orderId)
  } catch {
    error.value = 'Order not found. Please check your order ID.'
  } finally {
    loading.value = false
  }
})

const statusSteps = computed(() => {
  if (!order.value) return []

  const steps = [
    { key: 'pending_payment', label: 'Order Placed', description: 'Awaiting payment and verification' },
    { key: 'paid', label: 'Payment Confirmed', description: 'Your payment has been verified' },
    { key: 'packed', label: 'Packed', description: 'Your order is packed and ready for shipment' },
    { key: 'shipped', label: 'Shipped', description: 'Your order is on its way' },
    { key: 'delivered', label: 'Delivered', description: 'Your order has been delivered' },
  ]

  const statusOrder = ['pending_payment', 'paid', 'packed', 'shipped', 'delivered']
  const currentIndex = statusOrder.indexOf(order.value.status)

  if (currentIndex === -1) {
    return steps.map((step, index) => ({
      ...step,
      completed: index === 0,
      current: false,
      upcoming: index > 0,
    }))
  }

  return steps.map((step, index) => ({
    ...step,
    completed: index < currentIndex,
    current: index === currentIndex,
    upcoming: index > currentIndex,
  }))
})

const formattedDate = computed(() => {
  if (!order.value) return ''
  return new Date(order.value.created_at).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
})

const statusLabel = computed(() => {
  if (!order.value) return ''
  const labels: Record<string, string> = {
    pending_payment: 'Awaiting Payment',
    paid: 'Payment Confirmed',
    packed: 'Packed',
    shipped: 'Shipped',
    delivered: 'Delivered',
    cancelled: 'Cancelled',
  }
  return labels[order.value.status] || order.value.status
})

const statusColor = computed(() => {
  if (!order.value) return ''
  const colors: Record<string, string> = {
    pending_payment: 'bg-accent/15 text-accent',
    paid: 'bg-primary/15 text-primary',
    packed: 'bg-primary/15 text-primary',
    shipped: 'bg-primary/15 text-primary',
    delivered: 'bg-primary/15 text-primary',
    cancelled: 'bg-error/15 text-error',
  }
  return colors[order.value.status] || 'bg-muted/15 text-muted'
})

const paymentProofDate = computed(() => {
  if (!order.value?.latest_payment_proof) return ''
  return new Date(order.value.latest_payment_proof.submitted_at).toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
})
</script>

<template>
  <div class="bg-background min-h-[60vh]">
    <div class="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 py-8 sm:py-12 pb-16">
      <!-- Loading -->
      <div v-if="loading" class="space-y-6 animate-pulse max-w-2xl mx-auto">
        <div class="h-10 bg-muted/10 rounded w-64" />
        <div class="h-48 bg-muted/10 rounded" />
        <div class="h-64 bg-muted/10 rounded" />
      </div>

      <!-- Error -->
      <div v-else-if="error" class="text-center py-16 space-y-4">
        <svg class="w-16 h-16 mx-auto text-muted/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
            d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p class="text-xl font-semibold text-foreground">{{ error }}</p>
        <RouterLink to="/shop">
          <SecondaryButton>Back to Shop</SecondaryButton>
        </RouterLink>
      </div>

      <!-- Order Status -->
      <div v-else-if="order" class="max-w-2xl mx-auto space-y-8">
        <!-- Header -->
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 class="text-3xl sm:text-4xl font-bold text-foreground">Order Status</h1>
            <p class="mt-1 text-muted">
              Order <span class="font-mono text-foreground">{{ orderId }}</span>
            </p>
          </div>
          <span :class="['px-4 py-2 rounded-full text-sm font-semibold', statusColor]">
            {{ statusLabel }}
          </span>
        </div>

        <!-- Timeline -->
        <div class="bg-surface rounded-lg ring-1 ring-[var(--card-ring)] p-6">
          <h2 class="text-xl font-bold text-foreground mb-6">Order Timeline</h2>
          <div class="space-y-0">
            <div
              v-for="(step, index) in statusSteps"
              :key="step.key"
              class="relative flex gap-4"
            >
              <!-- Line + Circle -->
              <div class="flex flex-col items-center">
                <div
                  :class="[
                    'w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors',
                    step.completed
                      ? 'bg-primary text-background'
                      : step.current
                        ? 'bg-primary text-background ring-4 ring-primary/30'
                        : 'bg-muted/20 text-muted',
                  ]"
                >
                  <svg v-if="step.completed" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" />
                  </svg>
                  <div v-else-if="step.current" class="w-2.5 h-2.5 bg-surface rounded-full" />
                  <div v-else class="w-2 h-2 bg-muted/40 rounded-full" />
                </div>
                <div
                  v-if="index < statusSteps.length - 1"
                  :class="[
                    'w-0.5 flex-1 min-h-[2rem] my-1',
                    step.completed ? 'bg-primary' : 'bg-muted/20',
                  ]"
                />
              </div>

              <!-- Content -->
              <div :class="['pb-6', index === statusSteps.length - 1 ? 'pb-0' : '']">
                <p
                  :class="[
                    'font-semibold',
                    step.completed || step.current ? 'text-foreground' : 'text-muted',
                  ]"
                >
                  {{ step.label }}
                </p>
                <p class="text-sm text-muted">{{ step.description }}</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Payment Proof Status -->
        <div
          v-if="order.payment_submitted"
          class="bg-primary/10 border border-primary/30 rounded-lg p-6 space-y-2"
        >
          <h2 class="text-xl font-bold text-foreground">Payment Proof Submitted</h2>
          <p class="text-sm text-muted">We received your payment proof and will verify it shortly.</p>
          <p
            v-if="order.latest_payment_proof"
            class="text-sm text-muted"
          >
            Reference:
            <span class="font-mono text-foreground">{{ order.latest_payment_proof.proof_value }}</span>
            on {{ paymentProofDate }}
          </p>
        </div>

        <div
          v-else-if="order.status === 'pending_payment'"
          class="bg-accent/10 border border-accent/30 rounded-lg p-6 space-y-3"
        >
          <h2 class="text-xl font-bold text-foreground">Payment Pending</h2>
          <p class="text-sm text-muted">Complete payment and submit your transfer reference to speed up verification.</p>
          <RouterLink :to="`/order/${orderId}/payment`" class="inline-block text-primary font-semibold hover:underline underline-offset-4">
            Go to Payment Instructions
          </RouterLink>
        </div>

        <!-- Shipment Info -->
        <div
          v-if="order.shipment"
          class="bg-surface rounded-lg ring-1 ring-[var(--card-ring)] p-6 space-y-3"
        >
          <h2 class="text-xl font-bold text-foreground">Shipping Details</h2>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="bg-surface-alt rounded-md px-4 py-3">
              <p class="text-xs text-muted">Carrier</p>
              <p class="font-medium text-foreground">{{ order.shipment.carrier }}</p>
            </div>
            <div class="bg-surface-alt rounded-md px-4 py-3">
              <p class="text-xs text-muted">Tracking Number</p>
              <p class="font-mono text-foreground">{{ order.shipment.tracking_number }}</p>
            </div>
          </div>
        </div>

        <!-- Order Items -->
        <div class="bg-surface rounded-lg ring-1 ring-[var(--card-ring)] p-6 space-y-4">
          <h2 class="text-xl font-bold text-foreground">Items</h2>
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

        <!-- Order Info -->
        <div class="text-center text-sm text-muted space-y-1">
          <p>Ordered on {{ formattedDate }}</p>
          <p>
            Questions? Contact us at
            <a href="mailto:hello@cnxathletx.com" class="text-primary hover:underline underline-offset-4">
              hello@cnxathletx.com
            </a>
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
