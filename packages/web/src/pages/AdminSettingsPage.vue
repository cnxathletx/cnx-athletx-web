<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import {
  fetchAdminSettings,
  updateAdminSettings,
  previewR2Orphans,
  deleteR2Orphans,
  AdminApiErrorResponse,
  type R2Orphan,
} from '../api/admin'
import PrimaryButton from '../components/ui/PrimaryButton.vue'
import SecondaryButton from '../components/ui/SecondaryButton.vue'
import AdminNav from '../components/admin/AdminNav.vue'
import { fromSatang, toSatang } from '../utils/money'

const loading = ref(true)
const error = ref('')
const saving = ref(false)
const saveError = ref('')
const saveSuccess = ref('')

const form = reactive({
  shipping_flat_rate: '',
  shipping_free_threshold: '',
  promptpay_number: '',
  bank_name: '',
  bank_account_name: '',
  bank_account_number: '',
  payment_deadline_hours: '',
})

const ALL_METHODS = [
  { id: 'promptpay', label: 'PromptPay' },
  { id: 'bank_transfer', label: 'Bank transfer' },
] as const

const enabledMethods = ref<string[]>([])

function parseEnabledMethods(raw: string | undefined): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((x: unknown): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

// Display helpers — convert satang to THB for the form
function satangToThb(val: string): string {
  const n = parseInt(val, 10)
  if (isNaN(n)) return ''
  return String(fromSatang(n))
}

function thbToSatang(val: string): string {
  const n = parseFloat(val)
  if (isNaN(n)) return '0'
  return String(toSatang(n))
}

async function loadSettings() {
  loading.value = true
  error.value = ''
  try {
    const settings = await fetchAdminSettings()
    form.shipping_flat_rate = satangToThb(settings.shipping_flat_rate ?? '10000')
    form.shipping_free_threshold = satangToThb(settings.shipping_free_threshold ?? '0')
    form.promptpay_number = settings.promptpay_number ?? ''
    form.bank_name = settings.bank_name ?? ''
    form.bank_account_name = settings.bank_account_name ?? ''
    form.bank_account_number = settings.bank_account_number ?? ''
    form.payment_deadline_hours = settings.payment_deadline_hours ?? '24'
    enabledMethods.value = parseEnabledMethods(settings.payment_methods_enabled)
  } catch (err) {
    error.value = err instanceof AdminApiErrorResponse ? err.message : 'Unable to load settings.'
  } finally {
    loading.value = false
  }
}

async function handleSave() {
  saveError.value = ''
  saveSuccess.value = ''
  saving.value = true

  try {
    const settings = await updateAdminSettings({
      shipping_flat_rate: thbToSatang(form.shipping_flat_rate),
      shipping_free_threshold: thbToSatang(form.shipping_free_threshold),
      promptpay_number: form.promptpay_number.trim(),
      bank_name: form.bank_name.trim(),
      bank_account_name: form.bank_account_name.trim(),
      bank_account_number: form.bank_account_number.trim(),
      payment_deadline_hours: form.payment_deadline_hours.trim() || '24',
      payment_methods_enabled: JSON.stringify(enabledMethods.value),
    })

    // Refresh form with saved values
    form.shipping_flat_rate = satangToThb(settings.shipping_flat_rate ?? '10000')
    form.shipping_free_threshold = satangToThb(settings.shipping_free_threshold ?? '0')
    form.promptpay_number = settings.promptpay_number ?? ''
    form.bank_name = settings.bank_name ?? ''
    form.bank_account_name = settings.bank_account_name ?? ''
    form.bank_account_number = settings.bank_account_number ?? ''
    form.payment_deadline_hours = settings.payment_deadline_hours ?? '24'
    enabledMethods.value = parseEnabledMethods(settings.payment_methods_enabled)

    saveSuccess.value = 'Settings saved.'
  } catch (err) {
    saveError.value = err instanceof AdminApiErrorResponse ? err.message : 'Failed to save settings.'
  } finally {
    saving.value = false
  }
}

// --- R2 orphan cleanup ---

const cleanupBusy = ref(false)
const cleanupError = ref('')
const cleanupSummary = ref<{ scanned: number; orphan_count: number; truncated: boolean; deleted_count?: number; error_count?: number } | null>(null)
const cleanupOrphans = ref<R2Orphan[] | null>(null)
const cleanupMinAgeMin = ref(60)
const cleanupMinAgeSeconds = computed(() => Math.max(0, Math.round(cleanupMinAgeMin.value * 60)))

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(2)} MB`
}

async function previewCleanup() {
  cleanupBusy.value = true
  cleanupError.value = ''
  try {
    const res = await previewR2Orphans(cleanupMinAgeSeconds.value)
    cleanupSummary.value = { scanned: res.scanned, orphan_count: res.orphan_count, truncated: res.truncated }
    cleanupOrphans.value = res.orphans
  } catch (err) {
    cleanupError.value = err instanceof AdminApiErrorResponse ? err.message : 'Preview failed'
  } finally {
    cleanupBusy.value = false
  }
}

async function runCleanup() {
  if (!cleanupOrphans.value || cleanupOrphans.value.length === 0) return
  if (!confirm(`Permanently delete ${cleanupOrphans.value.length} orphaned R2 object(s)? This cannot be undone.`)) return
  cleanupBusy.value = true
  cleanupError.value = ''
  try {
    const res = await deleteR2Orphans(cleanupMinAgeSeconds.value)
    cleanupSummary.value = {
      scanned: res.scanned,
      orphan_count: res.orphan_count,
      truncated: res.truncated,
      deleted_count: res.deleted.length,
      error_count: res.errors.length,
    }
    cleanupOrphans.value = []
  } catch (err) {
    cleanupError.value = err instanceof AdminApiErrorResponse ? err.message : 'Cleanup failed'
  } finally {
    cleanupBusy.value = false
  }
}

onMounted(async () => {
  await loadSettings()
})
</script>

<template>
  <div class="bg-background min-h-[60vh]">
    <div class="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 py-8 sm:py-12 pb-16 space-y-6">
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <RouterLink to="/admin" class="text-sm text-muted hover:text-primary transition-colors mb-1 inline-block">&larr; Dashboard</RouterLink>
          <h1 class="text-3xl sm:text-4xl font-bold text-foreground">Settings</h1>
          <p class="text-sm text-muted mt-1">Manage shipping rates, payment details, and store configuration.</p>
        </div>
        <AdminNav />
      </div>

      <div v-if="loading" class="space-y-3 animate-pulse">
        <div class="h-40 bg-muted/10 rounded" />
        <div class="h-40 bg-muted/10 rounded" />
      </div>
      <div v-else-if="error" class="bg-error/10 border border-error/30 rounded-md p-4 text-sm text-error">{{ error }}</div>
      <template v-else>
        <div v-if="saveError" class="bg-error/10 border border-error/30 rounded-md p-3 text-sm text-error">{{ saveError }}</div>
        <div v-if="saveSuccess" class="bg-primary/10 border border-primary/30 rounded-md p-3 text-sm text-primary">{{ saveSuccess }}</div>

        <!-- Shipping -->
        <div class="bg-surface rounded-lg ring-1 ring-[var(--card-ring)] p-4 sm:p-6 space-y-4">
          <h2 class="text-xl font-bold text-foreground">Shipping</h2>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="space-y-1">
              <label class="block text-sm font-medium text-foreground">Flat Rate (THB)</label>
              <input
                v-model="form.shipping_flat_rate"
                type="number"
                min="0"
                step="1"
                class="w-full rounded-md border border-sand px-4 py-3 text-sm bg-surface-alt text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
              <p class="text-xs text-muted">Applied to every order unless free shipping threshold is met.</p>
            </div>
            <div class="space-y-1">
              <label class="block text-sm font-medium text-foreground">Free Shipping Threshold (THB)</label>
              <input
                v-model="form.shipping_free_threshold"
                type="number"
                min="0"
                step="1"
                class="w-full rounded-md border border-sand px-4 py-3 text-sm bg-surface-alt text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
              <p class="text-xs text-muted">Orders above this subtotal get free shipping. Set to 0 to disable.</p>
            </div>
          </div>
        </div>

        <!-- Payment Details -->
        <div class="bg-surface rounded-lg ring-1 ring-[var(--card-ring)] p-4 sm:p-6 space-y-4">
          <h2 class="text-xl font-bold text-foreground">Payment Details</h2>
          <p class="text-sm text-muted">Shown to customers on the payment instructions page and in order confirmation emails.</p>

          <div class="space-y-4">
            <div class="space-y-1">
              <label class="block text-sm font-medium text-foreground">Enabled methods</label>
              <div class="space-y-1">
                <label v-for="m in ALL_METHODS" :key="m.id" class="flex items-center gap-2 text-sm">
                  <input type="checkbox" :value="m.id" v-model="enabledMethods" />
                  <span class="text-foreground">{{ m.label }}</span>
                </label>
              </div>
              <p class="text-xs text-muted">Customers see only enabled methods at checkout.</p>
            </div>

            <div class="space-y-1">
              <label class="block text-sm font-medium text-foreground">PromptPay Number</label>
              <input
                v-model="form.promptpay_number"
                type="text"
                placeholder="e.g. 0812345678"
                class="w-full rounded-md border border-sand px-4 py-3 text-sm bg-surface-alt text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
              <p class="text-xs text-muted">Used to generate the PromptPay QR code. Leave empty to hide PromptPay option.</p>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div class="space-y-1">
                <label class="block text-sm font-medium text-foreground">Bank Name</label>
                <input
                  v-model="form.bank_name"
                  type="text"
                  placeholder="e.g. Kasikorn Bank"
                  class="w-full rounded-md border border-sand px-4 py-3 text-sm bg-surface-alt text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>
              <div class="space-y-1">
                <label class="block text-sm font-medium text-foreground">Account Name</label>
                <input
                  v-model="form.bank_account_name"
                  type="text"
                  placeholder="e.g. CNX AthletX Co., Ltd."
                  class="w-full rounded-md border border-sand px-4 py-3 text-sm bg-surface-alt text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>
              <div class="space-y-1">
                <label class="block text-sm font-medium text-foreground">Account Number</label>
                <input
                  v-model="form.bank_account_number"
                  type="text"
                  placeholder="e.g. 123-4-56789-0"
                  class="w-full rounded-md border border-sand px-4 py-3 text-sm bg-surface-alt text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- Order Settings -->
        <div class="bg-surface rounded-lg ring-1 ring-[var(--card-ring)] p-4 sm:p-6 space-y-4">
          <h2 class="text-xl font-bold text-foreground">Orders</h2>

          <div class="max-w-xs space-y-1">
            <label class="block text-sm font-medium text-foreground">Payment Deadline (hours)</label>
            <input
              v-model="form.payment_deadline_hours"
              type="number"
              min="1"
              step="1"
              class="w-full rounded-md border border-sand px-4 py-3 text-sm bg-surface-alt text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
            <p class="text-xs text-muted">How long customers have to complete payment before the order expires.</p>
          </div>
        </div>

        <PrimaryButton :disabled="saving" @click="handleSave">
          {{ saving ? 'Saving...' : 'Save Settings' }}
        </PrimaryButton>

        <!-- R2 Orphan Cleanup -->
        <div class="bg-surface rounded-lg ring-1 ring-[var(--card-ring)] p-4 sm:p-6 space-y-4">
          <div>
            <h2 class="text-xl font-bold text-foreground">Storage Cleanup</h2>
            <p class="text-sm text-muted mt-1">
              Find and delete files in R2 that are no longer referenced by any product, product image, or lab test record. Use the preview first to verify the list.
            </p>
          </div>

          <div v-if="cleanupError" class="bg-error/10 border border-error/30 rounded-md p-3 text-sm text-error">{{ cleanupError }}</div>

          <div class="flex flex-wrap items-end gap-3">
            <div class="space-y-1">
              <label class="block text-sm font-medium text-foreground">Skip files newer than (minutes)</label>
              <input
                v-model.number="cleanupMinAgeMin"
                type="number"
                min="0"
                step="1"
                class="w-32 rounded-md border border-sand px-3 py-2 text-sm bg-surface-alt text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
              <p class="text-xs text-muted">Avoids deleting in-flight uploads. Default 60.</p>
            </div>
            <SecondaryButton :disabled="cleanupBusy" @click="previewCleanup">
              {{ cleanupBusy ? 'Working...' : 'Preview orphans' }}
            </SecondaryButton>
            <PrimaryButton
              :disabled="cleanupBusy || !cleanupOrphans || cleanupOrphans.length === 0"
              @click="runCleanup"
            >
              Delete listed orphans
            </PrimaryButton>
          </div>

          <div v-if="cleanupSummary" class="text-sm text-muted">
            Scanned <span class="text-foreground font-medium">{{ cleanupSummary.scanned }}</span> object(s);
            <span class="text-foreground font-medium">{{ cleanupSummary.orphan_count }}</span> orphan(s).
            <span v-if="cleanupSummary.truncated" class="text-accent">Scan was truncated — re-run after deletion to see more.</span>
            <span v-if="typeof cleanupSummary.deleted_count === 'number'">
              Deleted <span class="text-foreground font-medium">{{ cleanupSummary.deleted_count }}</span>;
              errors <span class="text-foreground font-medium">{{ cleanupSummary.error_count }}</span>.
            </span>
          </div>

          <div v-if="cleanupOrphans && cleanupOrphans.length > 0" class="overflow-x-auto">
            <table class="w-full text-xs">
              <thead>
                <tr class="text-muted text-left border-b border-sand/60">
                  <th class="py-2 pr-4 font-medium">Key</th>
                  <th class="py-2 pr-4 font-medium">Uploaded</th>
                  <th class="py-2 pr-4 font-medium">Size</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="o in cleanupOrphans" :key="o.key" class="border-b border-sand/30">
                  <td class="py-1.5 pr-4 font-mono break-all">{{ o.key }}</td>
                  <td class="py-1.5 pr-4 whitespace-nowrap">{{ new Date(o.uploaded).toLocaleString() }}</td>
                  <td class="py-1.5 pr-4 whitespace-nowrap">{{ formatBytes(o.size) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-else-if="cleanupOrphans" class="text-xs text-muted italic">No orphans found.</p>
        </div>
      </template>
    </div>
  </div>
</template>
