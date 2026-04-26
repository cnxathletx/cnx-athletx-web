<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useCartStore, lineTotalFor } from '../stores/cart'
import { formatPrice } from '../api/products'
import { submitCheckout, CheckoutError } from '../api/checkout'
import { fetchLastAddress } from '../api/auth'
import { fetchPaymentMethods, type PaymentMethod } from '../api/paymentMethods'
import PrimaryButton from '../components/ui/PrimaryButton.vue'
import CheckoutStepper from '../components/ui/CheckoutStepper.vue'
import PaymentMethodPicker from '../components/payment/PaymentMethodPicker.vue'
import { useAuthStore } from '../stores/auth'
import { useHead } from '../composables/useHead'
import { useThaiAddress } from '../composables/useThaiAddress'
import { useI18n } from 'vue-i18n'

const { t } = useI18n({ useScope: 'global' })

useHead({ title: 'Checkout', description: 'Complete your order with CNX AthletX.' })

const router = useRouter()
const cart = useCartStore()
const auth = useAuthStore()

// Redirect if cart is empty
if (cart.items.length === 0) {
  router.replace('/cart')
}

// Form state
const form = ref({
  name: '',
  email: '',
  line1: '',
  line2: '',
  district: '',
  province: '',
  postal_code: '',
  discount_code: '',
})

const phoneCountryCode = ref('+66')
const phoneLocalNumber = ref('')

const phoneCountryOptions = [
  { value: '+66', label: 'TH +66' },
  { value: '+1', label: 'US/CA +1' },
  { value: '+44', label: 'UK +44' },
  { value: '+61', label: 'AU +61' },
  { value: '+65', label: 'SG +65' },
  { value: '+60', label: 'MY +60' },
  { value: '+49', label: 'DE +49' },
  { value: '+33', label: 'FR +33' },
  { value: '+39', label: 'IT +39' },
  { value: '+81', label: 'JP +81' },
  { value: '+82', label: 'KR +82' },
  { value: '+84', label: 'VN +84' },
  { value: '+86', label: 'CN +86' },
  { value: '+91', label: 'IN +91' },
]

const thaiAddr = useThaiAddress()

// Sync Thai address composable → form fields
watch(thaiAddr.selectedProvince, (v) => { form.value.province = v })
watch(thaiAddr.selectedDistrict, (v) => { form.value.district = v })
watch(thaiAddr.postalCode, (v) => { form.value.postal_code = v })

const submitting = ref(false)
const apiError = ref('')
const fieldErrors = ref<Record<string, string>>({})

const paymentMethods = ref<PaymentMethod[]>([])
const selectedMethod = ref('')
const methodsError = ref('')

// Generate idempotency key once per page load
const idempotencyKey = crypto.randomUUID()

function digitsOnly(value: string): string {
  return value.replace(/\D+/g, '')
}

function normalizePhoneForSubmit(): string {
  const digits = digitsOnly(phoneLocalNumber.value)
  if (!digits) return ''

  if (phoneCountryCode.value === '+66') {
    const thaiLocal = digits.startsWith('0') ? digits.slice(1) : digits
    return `+66${thaiLocal}`
  }

  return `${phoneCountryCode.value}${digits}`
}

function setPhoneFromExisting(phone: string): void {
  const trimmed = phone.trim()
  if (!trimmed) {
    phoneCountryCode.value = '+66'
    phoneLocalNumber.value = ''
    return
  }

  if (trimmed.startsWith('0')) {
    phoneCountryCode.value = '+66'
    phoneLocalNumber.value = trimmed
    return
  }

  if (!trimmed.startsWith('+')) {
    phoneCountryCode.value = '+66'
    phoneLocalNumber.value = digitsOnly(trimmed)
    return
  }

  const optionsByPrefix = [...phoneCountryOptions].sort((a, b) => b.value.length - a.value.length)
  const matched = optionsByPrefix.find((option) => trimmed.startsWith(option.value))

  if (matched) {
    phoneCountryCode.value = matched.value
    phoneLocalNumber.value = digitsOnly(trimmed.slice(matched.value.length))
    return
  }

  phoneCountryCode.value = '+66'
  phoneLocalNumber.value = digitsOnly(trimmed)
}

function sanitizePhoneInput() {
  phoneLocalNumber.value = digitsOnly(phoneLocalNumber.value)
}

// Validation
function validate(): boolean {
  const errors: Record<string, string> = {}
  const normalizedPhone = normalizePhoneForSubmit()

  if (form.value.name.trim().length < 2) errors.name = 'Name must be at least 2 characters'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.value.email)) errors.email = 'Enter a valid email'
  if (!/^\+[1-9][0-9]{6,14}$/.test(normalizedPhone)) errors.phone = 'Enter a valid phone number'
  if (form.value.line1.trim().length < 5) errors.line1 = 'Address must be at least 5 characters'
  if (!form.value.district.trim()) errors.district = 'District is required'
  if (!form.value.province.trim()) errors.province = 'Province is required'
  if (!/^\d{5}$/.test(form.value.postal_code)) errors.postal_code = 'Enter a 5-digit postal code'

  fieldErrors.value = errors
  return Object.keys(errors).length === 0
}

const canSubmit = computed(() => cart.items.length > 0 && !submitting.value)

onMounted(async () => {
  try {
    paymentMethods.value = await fetchPaymentMethods()
    if (paymentMethods.value.length > 0) {
      selectedMethod.value = paymentMethods.value[0].id
    } else {
      methodsError.value = t('payment.noMethodsAvailable')
    }
  } catch {
    methodsError.value = t('payment.failedToLoadMethods')
  }

  if (!auth.initialized) {
    await auth.init()
  }

  if (!auth.user) return

  if (!form.value.name) form.value.name = auth.user.name ?? ''
  if (!form.value.email) form.value.email = auth.user.email
  if (auth.user.phone) setPhoneFromExisting(auth.user.phone)

  try {
    const address = await fetchLastAddress()
    if (!address) return

    if (!form.value.line1) form.value.line1 = address.line1
    if (!form.value.line2) form.value.line2 = address.line2 ?? ''
    if (!thaiAddr.selectedProvince.value && address.province) {
      thaiAddr.setAddress({
        province: address.province,
        district: address.district,
        subdistrict: address.subdistrict,
        postalCode: address.postal_code,
      })
    }
  } catch {
    // Ignore prefill failures.
  }
})

async function handleSubmit() {
  if (!validate() || !canSubmit.value) return
  if (!selectedMethod.value) {
    apiError.value = t('payment.selectMethod')
    return
  }

  submitting.value = true
  apiError.value = ''

  try {
    const normalizedPhone = normalizePhoneForSubmit()
    const result = await submitCheckout({
      items: cart.items.map((item) => ({
        product_id: item.productId,
        quantity: item.quantity,
      })),
      customer: {
        name: form.value.name.trim(),
        email: form.value.email.trim().toLowerCase(),
        phone: normalizedPhone,
        address: {
          line1: form.value.line1.trim(),
          line2: form.value.line2.trim(),
          district: form.value.district.trim(),
          province: form.value.province.trim(),
          postal_code: form.value.postal_code,
        },
      },
      idempotency_key: idempotencyKey,
      discount_code: form.value.discount_code.trim() || undefined,
      payment_method: selectedMethod.value,
    })

    // Store checkout result for payment page (intent included)
    sessionStorage.setItem('cnx-last-order', JSON.stringify(result))
    sessionStorage.setItem('cnx-last-checkout-email', form.value.email.trim().toLowerCase())

    // Clear cart
    cart.clearCart()

    // Dispatch by intent kind
    if (result.intent.kind === 'redirect') {
      window.location.href = result.intent.url
      return
    }

    // 'instructions' or 'sdk' → navigate to payment page
    router.push(`/order/${result.order_id}/payment`)
  } catch (e) {
    if (e instanceof CheckoutError) {
      if (e.details?.length) {
        // Map field errors
        const newErrors: Record<string, string> = {}
        for (const d of e.details) {
          const key = d.field.replace('customer.address.', '').replace('customer.', '')
          newErrors[key] = d.message
        }
        fieldErrors.value = newErrors
        apiError.value = e.message
      } else {
        apiError.value = e.message
      }
    } else {
      apiError.value = 'Something went wrong. Please try again.'
    }
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="bg-background min-h-[60vh]">
    <CheckoutStepper :current-step="2" />

    <div class="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 pb-16">
      <h1 class="text-3xl sm:text-4xl font-bold text-foreground mb-8">{{ t('checkout.title') }}</h1>

      <form @submit.prevent="handleSubmit" class="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <!-- Form Column -->
        <div class="lg:col-span-2 space-y-8">
          <!-- Contact Information -->
          <div class="space-y-4">
            <h2 class="text-xl font-bold text-foreground">{{ t('checkout.contactInfo') }}</h2>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-foreground mb-1">{{ t('checkout.name') }}</label>
                <input
                  v-model="form.name"
                  type="text"
                  :class="[
                    'w-full rounded-md border px-4 py-3 text-sm bg-surface-alt text-foreground placeholder:text-muted transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent',
                    fieldErrors.name ? 'border-error' : 'border-sand',
                  ]"
                  placeholder="Somchai Rattana"
                />
                <p v-if="fieldErrors.name" class="mt-1 text-xs text-error">{{ fieldErrors.name }}</p>
              </div>
              <div>
                <label class="block text-sm font-medium text-foreground mb-1">{{ t('checkout.email') }}</label>
                <input
                  v-model="form.email"
                  type="email"
                  :disabled="!!auth.user"
                  :class="[
                    'w-full rounded-md border px-4 py-3 text-sm bg-surface-alt text-foreground placeholder:text-muted transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:opacity-70 disabled:cursor-not-allowed',
                    fieldErrors.email ? 'border-error' : 'border-sand',
                  ]"
                  placeholder="you@example.com"
                />
                <p v-if="fieldErrors.email" class="mt-1 text-xs text-error">{{ fieldErrors.email }}</p>
                <p v-else-if="auth.user" class="mt-1 text-xs text-muted">{{ t('checkout.usingAccountEmail') }}</p>
              </div>
            </div>
            <div class="max-w-sm">
              <label class="block text-sm font-medium text-foreground mb-1">{{ t('checkout.phoneNumber') }}</label>
              <div class="flex gap-2">
                <select
                  v-model="phoneCountryCode"
                  class="rounded-md border border-sand px-3 py-3 text-sm bg-surface-alt text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                >
                  <option v-for="option in phoneCountryOptions" :key="option.value" :value="option.value">
                    {{ option.label }}
                  </option>
                </select>
                <input
                  v-model="phoneLocalNumber"
                  type="tel"
                  inputmode="numeric"
                  :class="[
                    'flex-1 rounded-md border px-4 py-3 text-sm bg-surface-alt text-foreground placeholder:text-muted transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent',
                    fieldErrors.phone ? 'border-error' : 'border-sand',
                  ]"
                  :placeholder="phoneCountryCode === '+66' ? '0812345678' : 'Phone number'"
                  @input="sanitizePhoneInput"
                />
              </div>
              <p v-if="fieldErrors.phone" class="mt-1 text-xs text-error">{{ fieldErrors.phone }}</p>
            </div>
          </div>

          <!-- Shipping Address -->
          <div class="space-y-4">
            <h2 class="text-xl font-bold text-foreground">{{ t('checkout.shippingAddress') }}</h2>
            <div>
              <label class="block text-sm font-medium text-foreground mb-1">{{ t('checkout.addressLine1') }}</label>
              <input
                v-model="form.line1"
                type="text"
                :class="[
                  'w-full rounded-md border px-4 py-3 text-sm bg-surface-alt text-foreground placeholder:text-muted transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent',
                  fieldErrors.line1 ? 'border-error' : 'border-sand',
                ]"
                placeholder="123 Nimmanhaemin Road"
              />
              <p v-if="fieldErrors.line1" class="mt-1 text-xs text-error">{{ fieldErrors.line1 }}</p>
            </div>
            <div>
              <label class="block text-sm font-medium text-foreground mb-1">{{ t('checkout.addressLine2') }}</label>
              <input
                v-model="form.line2"
                type="text"
                class="w-full rounded-md border border-sand px-4 py-3 text-sm bg-surface-alt text-foreground placeholder:text-muted transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                placeholder="Soi 5, Floor 2"
              />
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-foreground mb-1">{{ t('checkout.province') }}</label>
                <select
                  v-model="thaiAddr.selectedProvince.value"
                  :class="[
                    'w-full rounded-md border px-4 py-3 text-sm bg-surface-alt text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent',
                    fieldErrors.province ? 'border-error' : 'border-sand',
                  ]"
                >
                  <option value="">{{ t('checkout.selectProvince') }}</option>
                  <option v-for="p in thaiAddr.provinces" :key="p.code" :value="p.name">{{ p.name }}</option>
                </select>
                <p v-if="fieldErrors.province" class="mt-1 text-xs text-error">{{ fieldErrors.province }}</p>
              </div>
              <div>
                <label class="block text-sm font-medium text-foreground mb-1">{{ t('checkout.district') }}</label>
                <select
                  v-model="thaiAddr.selectedDistrict.value"
                  :disabled="!thaiAddr.selectedProvince.value"
                  :class="[
                    'w-full rounded-md border px-4 py-3 text-sm bg-surface-alt text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:opacity-50',
                    fieldErrors.district ? 'border-error' : 'border-sand',
                  ]"
                >
                  <option value="">{{ t('checkout.selectDistrict') }}</option>
                  <option v-for="d in thaiAddr.filteredDistricts.value" :key="d.code" :value="d.name">{{ d.name }}</option>
                </select>
                <p v-if="fieldErrors.district" class="mt-1 text-xs text-error">{{ fieldErrors.district }}</p>
              </div>
              <div>
                <label class="block text-sm font-medium text-foreground mb-1">{{ t('checkout.subdistrict') }}</label>
                <select
                  v-model="thaiAddr.selectedSubdistrict.value"
                  :disabled="!thaiAddr.selectedDistrict.value"
                  :class="[
                    'w-full rounded-md border px-4 py-3 text-sm bg-surface-alt text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:opacity-50',
                  ]"
                >
                  <option value="">{{ t('checkout.selectSubdistrict') }}</option>
                  <option v-for="s in thaiAddr.filteredSubdistricts.value" :key="s.name" :value="s.name">{{ s.name }}</option>
                </select>
              </div>
              <div>
                <label class="block text-sm font-medium text-foreground mb-1">{{ t('checkout.postalCode') }}</label>
                <input
                  v-model="thaiAddr.postalCode.value"
                  type="text"
                  inputmode="numeric"
                  maxlength="5"
                  readonly
                  :class="[
                    'w-full rounded-md border px-4 py-3 text-sm bg-surface-alt text-foreground placeholder:text-muted transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent',
                    fieldErrors.postal_code ? 'border-error' : 'border-sand',
                  ]"
                  placeholder="Auto-filled"
                />
                <p v-if="fieldErrors.postal_code" class="mt-1 text-xs text-error">{{ fieldErrors.postal_code }}</p>
              </div>
            </div>
          </div>

          <!-- Payment Method -->
          <div class="space-y-2">
            <div v-if="methodsError" class="text-sm text-error">{{ methodsError }}</div>
            <PaymentMethodPicker
              v-else-if="paymentMethods.length"
              v-model="selectedMethod"
              :methods="paymentMethods"
            />
          </div>

          <!-- Discount Code -->
          <div class="space-y-2">
            <label class="block text-sm font-medium text-foreground">{{ t('checkout.discountCode') }}</label>
            <div class="flex gap-2 max-w-sm">
              <input
                v-model="form.discount_code"
                type="text"
                :class="[
                  'flex-1 rounded-md border px-4 py-3 text-sm bg-surface-alt text-foreground placeholder:text-muted uppercase transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent',
                  fieldErrors.discount_code ? 'border-error' : 'border-sand',
                ]"
                placeholder="SAVE10"
              />
            </div>
            <p v-if="fieldErrors.discount_code" class="text-xs text-error">{{ fieldErrors.discount_code }}</p>
          </div>
        </div>

        <!-- Order Summary Sidebar -->
        <div class="lg:col-span-1">
          <div class="bg-surface rounded-lg ring-1 ring-[var(--card-ring)] p-6 space-y-4 sticky top-20">
            <h2 class="text-xl font-bold text-foreground">{{ t('checkout.orderSummary') }}</h2>

            <div class="space-y-3 divide-y divide-sand">
              <div
                v-for="item in cart.items"
                :key="item.productId"
                class="flex justify-between pt-3 first:pt-0"
              >
                <div>
                  <p class="text-sm font-medium text-foreground">{{ item.name }}</p>
                  <p class="text-xs text-muted">{{ item.weightLabel }} x {{ item.quantity }}</p>
                </div>
                <p class="text-sm font-semibold text-foreground">
                  {{ formatPrice(lineTotalFor(item)) }}
                </p>
              </div>
            </div>

            <div class="border-t border-sand pt-4 space-y-2 text-sm">
              <div class="flex justify-between">
                <span class="text-muted">{{ t('checkout.subtotal') }}</span>
                <span class="font-semibold text-foreground">{{ formatPrice(cart.subtotalSatang) }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-muted">{{ t('checkout.shipping') }}</span>
                <span class="text-muted">{{ t('checkout.calculatedOnSubmit') }}</span>
              </div>
            </div>

            <!-- API Error -->
            <div
              v-if="apiError"
              class="bg-error/10 border border-error/30 rounded-md p-3 text-sm text-error"
            >
              {{ apiError }}
            </div>

            <PrimaryButton
              full-width
              size="lg"
              :disabled="!canSubmit"
              @click="handleSubmit"
            >
              {{ submitting ? t('checkout.placing') : t('checkout.placeOrder') }}
            </PrimaryButton>
          </div>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
select {
  appearance: none;
  background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e");
  background-position: right 0.75rem center;
  background-repeat: no-repeat;
  background-size: 1.25em 1.25em;
  padding-right: 2.5rem;
}
</style>
