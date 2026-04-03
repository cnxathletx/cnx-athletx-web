<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { fetchAdminOrders, type AdminOrderListItem, AdminApiErrorResponse } from '../api/admin'
import PrimaryButton from '../components/ui/PrimaryButton.vue'
import SecondaryButton from '../components/ui/SecondaryButton.vue'

const loading = ref(true)
const error = ref('')
const orders = ref<AdminOrderListItem[]>([])

const search = ref('')
const status = ref('')

const page = ref(1)
const limit = 20
const total = ref(0)

const statusOptions = [
  { value: '', label: 'All' },
  { value: 'pending_payment', label: 'Pending Payment' },
  { value: 'paid', label: 'Paid' },
  { value: 'packed', label: 'Packed' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
]

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

function totalPages(): number {
  return Math.max(1, Math.ceil(total.value / limit))
}

async function loadOrders() {
  error.value = ''
  loading.value = true
  try {
    const result = await fetchAdminOrders({
      page: page.value,
      limit,
      status: status.value || undefined,
      q: search.value.trim() || undefined,
    })
    orders.value = result.orders
    total.value = result.pagination.total
  } catch (err) {
    if (err instanceof AdminApiErrorResponse) {
      error.value = err.message
    } else {
      error.value = 'Unable to load admin orders.'
    }
  } finally {
    loading.value = false
  }
}

async function applyFilters() {
  page.value = 1
  await loadOrders()
}

async function goNext() {
  if (page.value >= totalPages()) return
  page.value += 1
  await loadOrders()
}

async function goPrev() {
  if (page.value <= 1) return
  page.value -= 1
  await loadOrders()
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

onMounted(async () => {
  await loadOrders()
})
</script>

<template>
  <div class="bg-background min-h-[60vh]">
    <div class="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 py-8 sm:py-12 pb-16 space-y-6">
      <div class="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <RouterLink to="/admin" class="text-sm text-muted hover:text-primary transition-colors mb-1 inline-block">&larr; Dashboard</RouterLink>
          <h1 class="text-3xl sm:text-4xl font-bold text-foreground">Admin Orders</h1>
          <p class="text-sm text-muted mt-1">Manage order fulfillment workflow.</p>
        </div>
        <div class="flex items-center gap-2">
          <RouterLink to="/admin/inventory">
            <SecondaryButton size="sm">Inventory</SecondaryButton>
          </RouterLink>
          <RouterLink to="/admin/products">
            <SecondaryButton size="sm">Products</SecondaryButton>
          </RouterLink>
          <RouterLink to="/admin/discounts">
            <SecondaryButton size="sm">Discounts</SecondaryButton>
          </RouterLink>
        </div>
      </div>

      <form class="bg-surface rounded-lg ring-1 ring-[var(--card-ring)] p-4 sm:p-6 grid grid-cols-1 sm:grid-cols-4 gap-3" @submit.prevent="applyFilters">
        <input
          v-model="search"
          type="text"
          placeholder="Search by order ID or customer name"
          class="sm:col-span-2 rounded-md border border-sand px-4 py-3 text-sm bg-surface-alt text-foreground placeholder:text-muted transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
        />
        <select
          v-model="status"
          class="rounded-md border border-sand px-4 py-3 text-sm bg-surface-alt text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
        >
          <option v-for="opt in statusOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
        <PrimaryButton size="md">Apply</PrimaryButton>
      </form>

      <div v-if="loading" class="space-y-3 animate-pulse">
        <div class="h-12 bg-muted/10 rounded" />
        <div class="h-12 bg-muted/10 rounded" />
        <div class="h-12 bg-muted/10 rounded" />
      </div>

      <div v-else-if="error" class="bg-error/10 border border-error/30 rounded-md p-4 text-error text-sm">
        {{ error }}
      </div>

      <div v-else class="bg-surface rounded-lg ring-1 ring-[var(--card-ring)] overflow-x-auto">
        <div v-if="orders.length === 0" class="p-6 text-sm text-muted text-center">No orders found.</div>

        <table v-else class="w-full text-sm whitespace-nowrap">
          <thead class="bg-surface-alt text-muted">
            <tr>
              <th class="text-left px-4 py-3 font-medium">Order</th>
              <th class="text-left px-4 py-3 font-medium">Customer</th>
              <th class="text-left px-4 py-3 font-medium">Status</th>
              <th class="text-right px-4 py-3 font-medium">Total</th>
              <th class="text-left px-4 py-3 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in orders"
              :key="row.id"
              class="border-t border-sand/60 hover:bg-surface-alt/60 transition-colors"
            >
              <td class="px-4 py-3">
                <RouterLink :to="`/admin/orders/${row.id}`" class="font-mono text-primary hover:underline underline-offset-4">
                  {{ row.id }}
                </RouterLink>
                <p class="text-xs text-muted mt-1">{{ row.items_count }} item(s)</p>
              </td>
              <td class="px-4 py-3 text-foreground">{{ row.customer_name }}</td>
              <td class="px-4 py-3">
                <span :class="['px-3 py-1 rounded-full text-xs font-semibold', statusClasses[row.status] || 'bg-muted/15 text-muted']">
                  {{ statusLabels[row.status] || row.status }}
                </span>
              </td>
              <td class="px-4 py-3 text-right font-semibold text-foreground">฿{{ row.total_thb.toLocaleString() }}</td>
              <td class="px-4 py-3 text-muted">{{ formatDate(row.created_at) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="flex items-center justify-between">
        <SecondaryButton size="sm" :disabled="page <= 1" @click="goPrev">Previous</SecondaryButton>
        <p class="text-xs text-muted">Page {{ page }} of {{ totalPages() }}</p>
        <SecondaryButton size="sm" :disabled="page >= totalPages()" @click="goNext">Next</SecondaryButton>
      </div>
    </div>
  </div>
</template>
