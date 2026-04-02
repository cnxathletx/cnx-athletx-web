<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import {
  fetchAdminDiscountCodes,
  createAdminDiscountCode,
  updateAdminDiscountCode,
  type AdminDiscountCode,
  type CreateDiscountPayload,
  type UpdateDiscountPayload,
  AdminApiErrorResponse,
} from '../api/admin'
import { RouterLink } from 'vue-router'
import PrimaryButton from '../components/ui/PrimaryButton.vue'
import SecondaryButton from '../components/ui/SecondaryButton.vue'

const loading = ref(true)
const error = ref('')
const codes = ref<AdminDiscountCode[]>([])

const showCreate = ref(false)
const createLoading = ref(false)
const createError = ref('')
const createSuccess = ref('')

const editingId = ref<number | null>(null)
const editLoading = ref(false)
const editError = ref('')
const editSuccess = ref('')

const createForm = reactive<CreateDiscountPayload>({
  code: '',
  type: 'fixed',
  value: 10000,
  min_order_thb: 0,
  max_uses: null,
  active: true,
  expires_at: null,
})

const editForm = reactive<Required<UpdateDiscountPayload>>({
  code: '',
  type: 'fixed',
  value: 0,
  min_order_thb: 0,
  max_uses: null,
  active: true,
  expires_at: null,
})

function formatThb(satang: number): string {
  return `฿${(satang / 100).toLocaleString('en-US', { minimumFractionDigits: 0 })}`
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatExpiry(iso: string | null): string {
  if (!iso) return 'Never'
  const d = new Date(iso)
  return d < new Date() ? `Expired ${formatDate(iso)}` : formatDate(iso)
}

function isExpired(iso: string | null): boolean {
  return iso !== null && new Date(iso) < new Date()
}

async function loadCodes() {
  loading.value = true
  error.value = ''
  try {
    codes.value = await fetchAdminDiscountCodes()
  } catch (err) {
    error.value = err instanceof AdminApiErrorResponse ? err.message : 'Unable to load discount codes.'
  } finally {
    loading.value = false
  }
}

function resetCreateForm() {
  createForm.code = ''
  createForm.type = 'fixed'
  createForm.value = 10000
  createForm.min_order_thb = 0
  createForm.max_uses = null
  createForm.active = true
  createForm.expires_at = null
}

async function handleCreate() {
  createLoading.value = true
  createError.value = ''
  createSuccess.value = ''
  try {
    await createAdminDiscountCode(createForm)
    createSuccess.value = `Discount code "${createForm.code}" created.`
    resetCreateForm()
    showCreate.value = false
    await loadCodes()
  } catch (err) {
    createError.value = err instanceof AdminApiErrorResponse
      ? (err.details?.map((d) => d.message).join(', ') || err.message)
      : 'Failed to create discount code.'
  } finally {
    createLoading.value = false
  }
}

function startEdit(code: AdminDiscountCode) {
  editingId.value = code.id
  editForm.code = code.code
  editForm.type = code.type
  editForm.value = code.value
  editForm.min_order_thb = code.min_order_thb
  editForm.max_uses = code.max_uses
  editForm.active = code.active
  editForm.expires_at = code.expires_at
  editError.value = ''
  editSuccess.value = ''
}

function cancelEdit() {
  editingId.value = null
}

async function handleUpdate() {
  if (editingId.value === null) return
  editLoading.value = true
  editError.value = ''
  editSuccess.value = ''
  try {
    const payload: UpdateDiscountPayload = {
      code: editForm.code,
      type: editForm.type,
      value: editForm.value,
      min_order_thb: editForm.min_order_thb,
      max_uses: editForm.max_uses,
      active: editForm.active,
      expires_at: editForm.expires_at,
    }
    await updateAdminDiscountCode(editingId.value, payload)
    editSuccess.value = 'Updated.'
    editingId.value = null
    await loadCodes()
  } catch (err) {
    editError.value = err instanceof AdminApiErrorResponse
      ? (err.details?.map((d) => d.message).join(', ') || err.message)
      : 'Failed to update discount code.'
  } finally {
    editLoading.value = false
  }
}

async function toggleActive(code: AdminDiscountCode) {
  try {
    await updateAdminDiscountCode(code.id, { active: !code.active })
    await loadCodes()
  } catch {
    error.value = 'Failed to toggle status.'
  }
}

onMounted(loadCodes)
</script>

<template>
  <div class="bg-background min-h-[60vh]">
    <div class="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 py-8">
      <!-- Header -->
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <RouterLink to="/admin" class="text-sm text-muted hover:text-primary transition-colors mb-1 inline-block">&larr; Dashboard</RouterLink>
          <h1 class="text-2xl font-bold text-foreground">Discount Codes</h1>
        </div>
        <div class="flex items-center gap-2">
          <RouterLink to="/admin/orders"><SecondaryButton size="sm">Orders</SecondaryButton></RouterLink>
          <RouterLink to="/admin/products"><SecondaryButton size="sm">Products</SecondaryButton></RouterLink>
          <RouterLink to="/admin/inventory"><SecondaryButton size="sm">Inventory</SecondaryButton></RouterLink>
        </div>
      </div>
      <div class="flex justify-end mb-4">
        <PrimaryButton size="sm" @click="showCreate = !showCreate">
          {{ showCreate ? 'Cancel' : 'New Discount Code' }}
        </PrimaryButton>
      </div>

      <!-- Status messages -->
      <div v-if="createSuccess" class="mb-4 rounded-lg bg-status-success/10 p-3 text-sm text-status-success">{{ createSuccess }}</div>
      <div v-if="editSuccess" class="mb-4 rounded-lg bg-status-success/10 p-3 text-sm text-status-success">{{ editSuccess }}</div>
      <div v-if="error" class="mb-4 rounded-lg bg-accent/10 p-3 text-sm text-accent">{{ error }}</div>

      <!-- Create Form -->
      <div v-if="showCreate" class="mb-8 bg-surface rounded-lg ring-1 ring-[var(--card-ring)] p-6 space-y-4">
        <h2 class="text-lg font-semibold text-foreground">Create Discount Code</h2>
        <div v-if="createError" class="rounded-lg bg-accent/10 p-3 text-sm text-accent">{{ createError }}</div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-muted mb-1">Code</label>
            <input v-model="createForm.code" type="text" placeholder="e.g. SUMMER20" class="w-full rounded-md bg-surface-alt border border-sand px-3 py-2 text-foreground text-sm uppercase" />
          </div>
          <div>
            <label class="block text-sm font-medium text-muted mb-1">Type</label>
            <select v-model="createForm.type" class="w-full rounded-md bg-surface-alt border border-sand px-3 py-2 text-foreground text-sm">
              <option value="fixed">Fixed (satang)</option>
              <option value="percent">Percent (%)</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-muted mb-1">
              Value {{ createForm.type === 'percent' ? '(%)' : '(satang)' }}
            </label>
            <input v-model.number="createForm.value" type="number" min="1" class="w-full rounded-md bg-surface-alt border border-sand px-3 py-2 text-foreground text-sm" />
          </div>
          <div>
            <label class="block text-sm font-medium text-muted mb-1">Min Order (satang, 0 = none)</label>
            <input v-model.number="createForm.min_order_thb" type="number" min="0" class="w-full rounded-md bg-surface-alt border border-sand px-3 py-2 text-foreground text-sm" />
          </div>
          <div>
            <label class="block text-sm font-medium text-muted mb-1">Max Uses (blank = unlimited)</label>
            <input :value="createForm.max_uses ?? ''" @input="createForm.max_uses = ($event.target as HTMLInputElement).value === '' ? null : Number(($event.target as HTMLInputElement).value)" type="number" min="1" class="w-full rounded-md bg-surface-alt border border-sand px-3 py-2 text-foreground text-sm" />
          </div>
          <div>
            <label class="block text-sm font-medium text-muted mb-1">Expires At (blank = never)</label>
            <input :value="createForm.expires_at?.slice(0, 10) ?? ''" @input="createForm.expires_at = ($event.target as HTMLInputElement).value ? new Date(($event.target as HTMLInputElement).value).toISOString() : null" type="date" class="w-full rounded-md bg-surface-alt border border-sand px-3 py-2 text-foreground text-sm" />
          </div>
        </div>

        <label class="flex items-center gap-2 text-sm text-foreground">
          <input v-model="createForm.active" type="checkbox" class="rounded" />
          Active
        </label>

        <div class="flex gap-3 pt-2">
          <PrimaryButton size="sm" :disabled="createLoading" @click="handleCreate">
            {{ createLoading ? 'Creating...' : 'Create' }}
          </PrimaryButton>
          <SecondaryButton size="sm" @click="showCreate = false; resetCreateForm()">Cancel</SecondaryButton>
        </div>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="text-center py-12 text-muted">Loading discount codes...</div>

      <!-- Table -->
      <div v-else-if="codes.length > 0" class="bg-surface rounded-lg ring-1 ring-[var(--card-ring)] overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-sand text-left text-xs uppercase text-muted">
              <th class="px-4 py-3">Code</th>
              <th class="px-4 py-3">Type</th>
              <th class="px-4 py-3">Value</th>
              <th class="px-4 py-3">Min Order</th>
              <th class="px-4 py-3">Usage</th>
              <th class="px-4 py-3">Expires</th>
              <th class="px-4 py-3">Status</th>
              <th class="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="code in codes" :key="code.id" class="border-b border-sand/50 last:border-0">
              <!-- View Mode -->
              <template v-if="editingId !== code.id">
                <td class="px-4 py-3 font-mono font-semibold text-foreground">{{ code.code }}</td>
                <td class="px-4 py-3 text-muted capitalize">{{ code.type }}</td>
                <td class="px-4 py-3 text-foreground">
                  {{ code.type === 'percent' ? `${code.value}%` : formatThb(code.value) }}
                </td>
                <td class="px-4 py-3 text-muted">
                  {{ code.min_order_thb > 0 ? formatThb(code.min_order_thb) : '—' }}
                </td>
                <td class="px-4 py-3 text-muted">
                  {{ code.used_count }}{{ code.max_uses !== null ? ` / ${code.max_uses}` : '' }}
                </td>
                <td class="px-4 py-3 text-muted" :class="{ 'text-accent': isExpired(code.expires_at) }">
                  {{ formatExpiry(code.expires_at) }}
                </td>
                <td class="px-4 py-3">
                  <button
                    @click="toggleActive(code)"
                    class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors"
                    :class="code.active
                      ? 'bg-status-success/15 text-status-success hover:bg-status-success/25'
                      : 'bg-muted/15 text-muted hover:bg-muted/25'"
                  >
                    {{ code.active ? 'Active' : 'Inactive' }}
                  </button>
                </td>
                <td class="px-4 py-3">
                  <button @click="startEdit(code)" class="text-primary hover:text-primary/80 text-sm font-medium">
                    Edit
                  </button>
                </td>
              </template>

              <!-- Edit Mode -->
              <template v-else>
                <td colspan="8" class="px-4 py-4">
                  <div class="space-y-4">
                    <div v-if="editError" class="rounded-lg bg-accent/10 p-3 text-sm text-accent">{{ editError }}</div>
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label class="block text-xs text-muted mb-1">Code</label>
                        <input v-model="editForm.code" type="text" class="w-full rounded-md bg-surface-alt border border-sand px-3 py-2 text-foreground text-sm uppercase" />
                      </div>
                      <div>
                        <label class="block text-xs text-muted mb-1">Type</label>
                        <select v-model="editForm.type" class="w-full rounded-md bg-surface-alt border border-sand px-3 py-2 text-foreground text-sm">
                          <option value="fixed">Fixed (satang)</option>
                          <option value="percent">Percent (%)</option>
                        </select>
                      </div>
                      <div>
                        <label class="block text-xs text-muted mb-1">Value</label>
                        <input v-model.number="editForm.value" type="number" min="1" class="w-full rounded-md bg-surface-alt border border-sand px-3 py-2 text-foreground text-sm" />
                      </div>
                      <div>
                        <label class="block text-xs text-muted mb-1">Min Order (satang)</label>
                        <input v-model.number="editForm.min_order_thb" type="number" min="0" class="w-full rounded-md bg-surface-alt border border-sand px-3 py-2 text-foreground text-sm" />
                      </div>
                      <div>
                        <label class="block text-xs text-muted mb-1">Max Uses</label>
                        <input :value="editForm.max_uses ?? ''" @input="editForm.max_uses = ($event.target as HTMLInputElement).value === '' ? null : Number(($event.target as HTMLInputElement).value)" type="number" min="1" class="w-full rounded-md bg-surface-alt border border-sand px-3 py-2 text-foreground text-sm" />
                      </div>
                      <div>
                        <label class="block text-xs text-muted mb-1">Expires At</label>
                        <input :value="editForm.expires_at?.slice(0, 10) ?? ''" @input="editForm.expires_at = ($event.target as HTMLInputElement).value ? new Date(($event.target as HTMLInputElement).value).toISOString() : null" type="date" class="w-full rounded-md bg-surface-alt border border-sand px-3 py-2 text-foreground text-sm" />
                      </div>
                    </div>
                    <label class="flex items-center gap-2 text-sm text-foreground">
                      <input v-model="editForm.active" type="checkbox" class="rounded" />
                      Active
                    </label>
                    <div class="flex gap-3">
                      <PrimaryButton size="sm" :disabled="editLoading" @click="handleUpdate">
                        {{ editLoading ? 'Saving...' : 'Save' }}
                      </PrimaryButton>
                      <SecondaryButton size="sm" @click="cancelEdit">Cancel</SecondaryButton>
                    </div>
                  </div>
                </td>
              </template>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Empty state -->
      <div v-else class="text-center py-12 text-muted">No discount codes found.</div>
    </div>
  </div>
</template>
