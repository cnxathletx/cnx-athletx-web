<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { fetchAdminSettings, updateAdminSettings, AdminApiErrorResponse } from '../api/admin'
import PrimaryButton from '../components/ui/PrimaryButton.vue'
import AdminNav from '../components/admin/AdminNav.vue'

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

// Display helpers — convert satang to THB for the form
function satangToThb(val: string): string {
  const n = parseInt(val, 10)
  if (isNaN(n)) return ''
  return String(n / 100)
}

function thbToSatang(val: string): string {
  const n = parseFloat(val)
  if (isNaN(n)) return '0'
  return String(Math.round(n * 100))
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
    })

    // Refresh form with saved values
    form.shipping_flat_rate = satangToThb(settings.shipping_flat_rate ?? '10000')
    form.shipping_free_threshold = satangToThb(settings.shipping_free_threshold ?? '0')
    form.promptpay_number = settings.promptpay_number ?? ''
    form.bank_name = settings.bank_name ?? ''
    form.bank_account_name = settings.bank_account_name ?? ''
    form.bank_account_number = settings.bank_account_number ?? ''
    form.payment_deadline_hours = settings.payment_deadline_hours ?? '24'

    saveSuccess.value = 'Settings saved.'
  } catch (err) {
    saveError.value = err instanceof AdminApiErrorResponse ? err.message : 'Failed to save settings.'
  } finally {
    saving.value = false
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
      </template>
    </div>
  </div>
</template>
