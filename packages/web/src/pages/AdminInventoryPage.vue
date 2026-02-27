<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { adjustInventory, fetchInventory, type AdminInventoryItem, AdminApiErrorResponse } from '../api/admin'
import PrimaryButton from '../components/ui/PrimaryButton.vue'
import SecondaryButton from '../components/ui/SecondaryButton.vue'

const loading = ref(true)
const error = ref('')
const inventory = ref<AdminInventoryItem[]>([])

const adjustments = reactive<Record<number, string>>({})
const notes = reactive<Record<number, string>>({})
const rowLoading = reactive<Record<number, boolean>>({})
const rowError = reactive<Record<number, string>>({})
const rowSuccess = reactive<Record<number, string>>({})

async function loadInventory() {
  loading.value = true
  error.value = ''
  try {
    inventory.value = await fetchInventory()
  } catch (err) {
    if (err instanceof AdminApiErrorResponse) {
      error.value = err.message
    } else {
      error.value = 'Unable to load inventory.'
    }
  } finally {
    loading.value = false
  }
}

async function applyAdjustment(item: AdminInventoryItem) {
  const raw = adjustments[item.product_id]?.trim() ?? ''
  const amount = Number(raw)

  rowError[item.product_id] = ''
  rowSuccess[item.product_id] = ''

  if (!raw || !Number.isInteger(amount) || amount === 0) {
    rowError[item.product_id] = 'Enter a non-zero integer adjustment.'
    return
  }

  rowLoading[item.product_id] = true
  try {
    const updated = await adjustInventory(item.product_id, {
      adjustment: amount,
      notes: notes[item.product_id]?.trim() || undefined,
    })

    inventory.value = inventory.value.map((entry) =>
      entry.product_id === item.product_id
        ? {
            ...entry,
            stock_count: updated.stock_count,
            reserved_count: updated.reserved_count,
            available_count: updated.available_count,
          }
        : entry
    )

    adjustments[item.product_id] = ''
    notes[item.product_id] = ''
    rowSuccess[item.product_id] = 'Stock updated.'
  } catch (err) {
    if (err instanceof AdminApiErrorResponse) {
      rowError[item.product_id] = err.message
    } else {
      rowError[item.product_id] = 'Failed to update stock.'
    }
  } finally {
    rowLoading[item.product_id] = false
  }
}

function statusClass(active: boolean): string {
  return active ? 'bg-primary/15 text-primary' : 'bg-muted/15 text-muted'
}

onMounted(async () => {
  await loadInventory()
})
</script>

<template>
  <div class="bg-background min-h-[60vh]">
    <div class="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 py-8 sm:py-12 pb-16 space-y-6">
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 class="text-3xl sm:text-4xl font-bold text-foreground">Admin Inventory</h1>
          <p class="text-sm text-muted mt-1">Adjust stock counts and monitor available units.</p>
        </div>
        <div class="flex items-center gap-2">
          <RouterLink to="/admin/orders"><SecondaryButton size="sm">Orders</SecondaryButton></RouterLink>
          <RouterLink to="/admin/products"><SecondaryButton size="sm">Products</SecondaryButton></RouterLink>
        </div>
      </div>

      <div v-if="loading" class="space-y-3 animate-pulse">
        <div class="h-12 bg-muted/10 rounded" />
        <div class="h-12 bg-muted/10 rounded" />
        <div class="h-12 bg-muted/10 rounded" />
      </div>

      <div v-else-if="error" class="bg-error/10 border border-error/30 rounded-md p-4 text-sm text-error">
        {{ error }}
      </div>

      <div v-else class="space-y-4">
        <div
          v-for="item in inventory"
          :key="item.product_id"
          class="bg-surface rounded-lg ring-1 ring-[var(--card-ring)] p-4 sm:p-6 space-y-4"
        >
          <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 class="text-lg font-semibold text-foreground">{{ item.name }}</h2>
              <p class="text-xs text-muted font-mono">{{ item.slug }}</p>
            </div>
            <span :class="['px-3 py-1 rounded-full text-xs font-semibold', statusClass(item.active)]">
              {{ item.active ? 'Active' : 'Inactive' }}
            </span>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <div class="bg-surface-alt rounded-md p-3">
              <p class="text-muted">Stock</p>
              <p class="text-foreground text-xl font-bold">{{ item.stock_count }}</p>
            </div>
            <div class="bg-surface-alt rounded-md p-3">
              <p class="text-muted">Reserved</p>
              <p class="text-foreground text-xl font-bold">{{ item.reserved_count }}</p>
            </div>
            <div class="bg-surface-alt rounded-md p-3">
              <p class="text-muted">Available</p>
              <p class="text-foreground text-xl font-bold">{{ item.available_count }}</p>
            </div>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-4 gap-3 items-start">
            <input
              v-model="adjustments[item.product_id]"
              type="number"
              step="1"
              placeholder="Adjustment (+10 / -3)"
              class="rounded-md border border-sand px-4 py-3 text-sm bg-surface-alt text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
            <input
              v-model="notes[item.product_id]"
              type="text"
              placeholder="Optional reason"
              class="lg:col-span-2 rounded-md border border-sand px-4 py-3 text-sm bg-surface-alt text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
            <PrimaryButton :disabled="rowLoading[item.product_id]" @click="applyAdjustment(item)">
              Apply
            </PrimaryButton>
          </div>

          <p v-if="rowError[item.product_id]" class="text-sm text-error">{{ rowError[item.product_id] }}</p>
          <p v-if="rowSuccess[item.product_id]" class="text-sm text-primary">{{ rowSuccess[item.product_id] }}</p>
        </div>
      </div>
    </div>
  </div>
</template>
