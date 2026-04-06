<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import {
  AdminApiErrorResponse,
  cancelOrder,
  fetchAdminOrder,
  markOrderPaid,
  packOrder,
  shipOrder,
  type AdminOrderDetail,
} from '../api/admin'
import PrimaryButton from '../components/ui/PrimaryButton.vue'
import SecondaryButton from '../components/ui/SecondaryButton.vue'
import AdminNav from '../components/admin/AdminNav.vue'

const route = useRoute()
const orderId = route.params.id as string

const loading = ref(true)
const error = ref('')
const order = ref<AdminOrderDetail | null>(null)

const actionLoading = ref(false)
const actionError = ref('')
const actionSuccess = ref('')

const shippingCarrier = ref('')
const shippingTracking = ref('')

const statusLabels: Record<string, string> = {
  pending_payment: 'Awaiting Payment',
  paid: 'Paid',
  packed: 'Packed',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
}

const statusClasses: Record<string, string> = {
  pending_payment: 'bg-accent/15 text-accent',
  paid: 'bg-primary/15 text-primary',
  packed: 'bg-primary/15 text-primary',
  shipped: 'bg-primary/15 text-primary',
  delivered: 'bg-primary/15 text-primary',
  cancelled: 'bg-error/15 text-error',
}

const statusLabel = computed(() => (order.value ? statusLabels[order.value.status] || order.value.status : ''))
const statusClass = computed(() => (order.value ? statusClasses[order.value.status] || 'bg-muted/15 text-muted' : ''))

async function loadOrder() {
  loading.value = true
  error.value = ''
  try {
    order.value = await fetchAdminOrder(orderId)
  } catch (err) {
    if (err instanceof AdminApiErrorResponse) {
      error.value = err.message
    } else {
      error.value = 'Order not found or unavailable.'
    }
  } finally {
    loading.value = false
  }
}

async function runAction(action: () => Promise<void>, successMessage: string) {
  actionError.value = ''
  actionSuccess.value = ''
  actionLoading.value = true

  try {
    await action()
    actionSuccess.value = successMessage
    await loadOrder()
  } catch (err) {
    if (err instanceof AdminApiErrorResponse) {
      actionError.value = err.currentStatus
        ? `${err.message}. Current status: ${statusLabels[err.currentStatus] || err.currentStatus}.`
        : err.message
    } else {
      actionError.value = 'Action failed. Please try again.'
    }
  } finally {
    actionLoading.value = false
  }
}

async function handleMarkPaid() {
  await runAction(() => markOrderPaid(orderId), 'Order marked as paid.')
}

async function handlePack() {
  await runAction(() => packOrder(orderId), 'Order marked as packed.')
}

async function handleShip() {
  const carrier = shippingCarrier.value.trim()
  const tracking = shippingTracking.value.trim()
  if (carrier.length < 2 || tracking.length < 3) {
    actionError.value = 'Carrier and tracking number are required before shipping.'
    return
  }

  await runAction(
    () =>
      shipOrder(orderId, {
        carrier,
        tracking_number: tracking,
      }),
    'Order marked as shipped.'
  )

  if (!actionError.value) {
    shippingCarrier.value = ''
    shippingTracking.value = ''
  }
}

async function handleCancel() {
  await runAction(() => cancelOrder(orderId), 'Order cancelled.')
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatMoney(value: number): string {
  return `฿${(value / 100).toLocaleString()}`
}

function prettyAuditDetails(raw: string | null): string {
  if (!raw) return '-'
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}

onMounted(async () => {
  await loadOrder()
})
</script>

<template>
  <div class="bg-background min-h-[60vh]">
    <div class="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 py-8 sm:py-12 pb-16 space-y-6">
      <div class="flex items-center justify-between gap-3">
        <RouterLink to="/admin/orders" class="text-sm font-semibold text-primary hover:underline underline-offset-4">
          ← Back to Orders
        </RouterLink>
        <AdminNav />
      </div>

      <div v-if="loading" class="space-y-4 animate-pulse">
        <div class="h-10 bg-muted/10 rounded w-64" />
        <div class="h-56 bg-muted/10 rounded" />
      </div>

      <div v-else-if="error" class="bg-error/10 border border-error/30 rounded-md p-4 text-sm text-error">
        {{ error }}
      </div>

      <div v-else-if="order" class="space-y-6">
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 class="text-3xl sm:text-4xl font-bold text-foreground">Admin Order Detail</h1>
            <p class="mt-1 text-muted">
              Order <span class="font-mono text-foreground">{{ order.id }}</span>
            </p>
          </div>
          <span :class="['px-4 py-2 rounded-full text-sm font-semibold', statusClass]">
            {{ statusLabel }}
          </span>
        </div>

        <div class="bg-surface rounded-lg ring-1 ring-[var(--card-ring)] p-6 space-y-4">
          <h2 class="text-xl font-bold text-foreground">Actions</h2>

          <div v-if="actionError" class="bg-error/10 border border-error/30 rounded-md p-3 text-sm text-error">
            {{ actionError }}
          </div>
          <div v-if="actionSuccess" class="bg-primary/10 border border-primary/30 rounded-md p-3 text-sm text-primary">
            {{ actionSuccess }}
          </div>

          <div v-if="order.status === 'pending_payment'" class="flex flex-wrap gap-3">
            <PrimaryButton :disabled="actionLoading" @click="handleMarkPaid">Mark Paid</PrimaryButton>
            <SecondaryButton :disabled="actionLoading" @click="handleCancel">Cancel Order</SecondaryButton>
          </div>

          <div v-else-if="order.status === 'paid'" class="flex flex-wrap gap-3">
            <PrimaryButton :disabled="actionLoading" @click="handlePack">Mark Packed</PrimaryButton>
            <SecondaryButton :disabled="actionLoading" @click="handleCancel">Cancel Order</SecondaryButton>
          </div>

          <div v-else-if="order.status === 'packed'" class="space-y-3">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                v-model="shippingCarrier"
                type="text"
                placeholder="Carrier (e.g. Thailand Post)"
                class="rounded-md border border-sand px-4 py-3 text-sm bg-surface-alt text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
              <input
                v-model="shippingTracking"
                type="text"
                placeholder="Tracking Number"
                class="rounded-md border border-sand px-4 py-3 text-sm bg-surface-alt text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>
            <div class="flex flex-wrap gap-3">
              <PrimaryButton :disabled="actionLoading" @click="handleShip">Mark Shipped</PrimaryButton>
              <SecondaryButton :disabled="actionLoading" @click="handleCancel">Cancel Order</SecondaryButton>
              <a href="https://www.flashexpress.com/fle/activity/printer" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1.5 rounded-md border border-sand px-4 py-2 text-sm font-medium text-muted hover:text-foreground hover:border-primary transition-colors">
                Flash Express Label ↗
              </a>
            </div>
          </div>

          <p v-else class="text-sm text-muted">No further transition actions are available for this status.</p>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div class="bg-surface rounded-lg ring-1 ring-[var(--card-ring)] p-6 space-y-2">
            <h2 class="text-xl font-bold text-foreground">Customer</h2>
            <p class="text-sm text-muted">Name: <span class="text-foreground">{{ order.customer.name }}</span></p>
            <p class="text-sm text-muted">Email: <span class="text-foreground">{{ order.customer.email }}</span></p>
            <p class="text-sm text-muted">Phone: <span class="text-foreground">{{ order.customer.phone }}</span></p>
          </div>

          <div class="bg-surface rounded-lg ring-1 ring-[var(--card-ring)] p-6 space-y-2">
            <h2 class="text-xl font-bold text-foreground">Shipping Address</h2>
            <p class="text-sm text-muted">{{ order.shipping_address.line1 }}</p>
            <p v-if="order.shipping_address.line2" class="text-sm text-muted">{{ order.shipping_address.line2 }}</p>
            <p class="text-sm text-muted">
              {{ order.shipping_address.district }}, {{ order.shipping_address.province }} {{ order.shipping_address.postal_code }}
            </p>
          </div>
        </div>

        <div class="bg-surface rounded-lg ring-1 ring-[var(--card-ring)] p-6 space-y-4">
          <h2 class="text-xl font-bold text-foreground">Items & Totals</h2>
          <div class="space-y-3 divide-y divide-sand/60">
            <div v-for="item in order.items" :key="`${item.product_name}-${item.quantity}`" class="flex justify-between pt-3 first:pt-0">
              <div>
                <p class="text-sm font-medium text-foreground">{{ item.product_name }}</p>
                <p class="text-xs text-muted">Qty: {{ item.quantity }}</p>
              </div>
              <p class="text-sm font-semibold text-foreground">{{ formatMoney(item.line_total_thb) }}</p>
            </div>
          </div>
          <div class="border-t border-sand/60 pt-4 space-y-1 text-sm">
            <div class="flex justify-between text-muted"><span>Subtotal</span><span>{{ formatMoney(order.subtotal_thb) }}</span></div>
            <div class="flex justify-between text-muted"><span>Shipping</span><span>{{ formatMoney(order.shipping_thb) }}</span></div>
            <div v-if="order.discount_thb > 0" class="flex justify-between text-muted"><span>Discount</span><span>-{{ formatMoney(order.discount_thb) }}</span></div>
            <div class="flex justify-between text-foreground font-bold pt-1"><span>Total</span><span>{{ formatMoney(order.total_thb) }}</span></div>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div class="bg-surface rounded-lg ring-1 ring-[var(--card-ring)] p-6 space-y-4">
            <h2 class="text-xl font-bold text-foreground">Payment Proofs</h2>
            <p v-if="order.payment_proofs.length === 0" class="text-sm text-muted">No proofs submitted yet.</p>
            <div v-else class="space-y-3">
              <div
                v-for="proof in order.payment_proofs"
                :key="proof.id"
                class="bg-surface-alt rounded-md px-4 py-3"
              >
                <p class="text-xs text-muted uppercase tracking-wide">{{ proof.proof_type }}</p>
                <p class="font-mono text-foreground mt-1 break-all">{{ proof.proof_value }}</p>
                <p class="text-xs text-muted mt-1">Submitted: {{ formatDate(proof.submitted_at) }}</p>
              </div>
            </div>
          </div>

          <div class="bg-surface rounded-lg ring-1 ring-[var(--card-ring)] p-6 space-y-3">
            <h2 class="text-xl font-bold text-foreground">Shipment</h2>
            <p v-if="!order.shipment" class="text-sm text-muted">Not shipped yet.</p>
            <template v-else>
              <p class="text-sm text-muted">Carrier: <span class="text-foreground">{{ order.shipment.carrier }}</span></p>
              <p class="text-sm text-muted">Tracking: <span class="font-mono text-foreground">{{ order.shipment.tracking_number }}</span></p>
              <p class="text-sm text-muted">Shipped: <span class="text-foreground">{{ formatDate(order.shipment.shipped_at) }}</span></p>
            </template>
          </div>
        </div>

        <div class="bg-surface rounded-lg ring-1 ring-[var(--card-ring)] p-6 space-y-4">
          <h2 class="text-xl font-bold text-foreground">Audit Log</h2>
          <p v-if="order.audit_logs.length === 0" class="text-sm text-muted">No admin actions logged yet.</p>
          <div v-else class="space-y-3">
            <div
              v-for="entry in order.audit_logs"
              :key="entry.id"
              class="bg-surface-alt rounded-md p-4 space-y-2"
            >
              <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs text-muted">
                <p>Action: <span class="text-foreground font-semibold">{{ entry.action }}</span></p>
                <p>{{ formatDate(entry.created_at) }}</p>
              </div>
              <p class="text-xs text-muted">By: <span class="font-mono text-foreground">{{ entry.admin_email }}</span></p>
              <pre class="text-xs text-muted whitespace-pre-wrap break-words">{{ prettyAuditDetails(entry.details_json) }}</pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
