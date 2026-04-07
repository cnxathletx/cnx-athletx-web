<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { AuthApiErrorResponse, requestMagicLink } from '../api/auth'
import PrimaryButton from '../components/ui/PrimaryButton.vue'
import SecondaryButton from '../components/ui/SecondaryButton.vue'
import { useAuthStore } from '../stores/auth'
import { useHead } from '../composables/useHead'

const { t } = useI18n({ useScope: 'global' })

useHead({ title: 'Log In', description: 'Sign in to your CNX AthletX account.' })

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const email = ref('')
const submitting = ref(false)
const sentTo = ref('')
const apiError = ref('')
const apiSuccess = ref('')
const devMagicLink = ref('')
const resendCooldown = ref(0)
let timerId: number | null = null

onMounted(() => {
  const redirect = route.query.redirect
  if (typeof redirect === 'string' && redirect.startsWith('/')) {
    localStorage.setItem('cnx-auth-redirect', redirect)
  }
})

onUnmounted(() => {
  if (timerId !== null) {
    window.clearInterval(timerId)
    timerId = null
  }
})

function startCooldown(seconds: number) {
  resendCooldown.value = seconds
  if (timerId !== null) {
    window.clearInterval(timerId)
  }
  timerId = window.setInterval(() => {
    resendCooldown.value -= 1
    if (resendCooldown.value <= 0 && timerId !== null) {
      window.clearInterval(timerId)
      timerId = null
    }
  }, 1000)
}

const canSubmit = computed(() => !submitting.value && resendCooldown.value === 0)

async function handleSubmit() {
  apiError.value = ''
  apiSuccess.value = ''
  devMagicLink.value = ''

  const normalized = email.value.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    apiError.value = 'Please enter a valid email address.'
    return
  }

  submitting.value = true
  try {
    const result = await requestMagicLink(normalized)
    sentTo.value = normalized
    apiSuccess.value = result.message
    devMagicLink.value = result.dev_magic_link ?? ''
    startCooldown(60)
  } catch (err) {
    if (err instanceof AuthApiErrorResponse) {
      apiError.value = err.message
    } else {
      apiError.value = 'Unable to send login link. Please try again.'
    }
  } finally {
    submitting.value = false
  }
}

async function goToAccount() {
  await auth.init(true)
  if (auth.isAuthenticated) {
    await router.replace('/account')
  }
}
</script>

<template>
  <div class="bg-background min-h-[60vh]">
    <div class="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 py-10">
      <div class="max-w-md mx-auto bg-surface rounded-lg ring-1 ring-[var(--card-ring)] p-6 sm:p-8 space-y-6">
        <div class="text-center space-y-2">
          <h1 class="text-3xl font-bold text-foreground">{{ t('auth.loginTitle') }}</h1>
          <p class="text-muted">{{ t('auth.loginSubtitle') }}</p>
        </div>

        <form class="space-y-4" @submit.prevent="handleSubmit">
          <div>
            <label class="block text-sm font-medium text-foreground mb-1">{{ t('auth.emailLabel') }}</label>
            <input
              v-model="email"
              type="email"
              class="w-full rounded-md border border-sand px-4 py-3 text-sm bg-surface-alt text-foreground placeholder:text-muted transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="you@example.com"
              :disabled="submitting"
            />
          </div>

          <p v-if="apiError" class="text-sm text-error">{{ apiError }}</p>

          <PrimaryButton full-width size="lg" :disabled="!canSubmit || submitting">
            {{
              submitting
                ? t('auth.sending')
                : sentTo && resendCooldown === 0
                  ? t('auth.resendLink')
                  : sentTo && resendCooldown > 0
                    ? t('auth.resendIn', { seconds: resendCooldown })
                    : t('auth.sendLink')
            }}
          </PrimaryButton>
        </form>

        <div v-if="sentTo" class="bg-primary/10 border border-primary/30 rounded-md p-4 space-y-2">
          <p class="font-semibold text-foreground">{{ t('auth.checkEmail') }}</p>
          <p class="text-sm text-muted">
            {{ t('auth.checkEmailDesc') }} <span class="font-medium text-foreground">{{ sentTo }}</span>.
          </p>
          <p class="text-xs text-muted">
            {{ t('auth.linkExpires') }}
          </p>
          <p v-if="apiSuccess" class="text-xs text-muted">{{ apiSuccess }}</p>

          <a
            v-if="devMagicLink"
            :href="devMagicLink"
            class="inline-block text-sm text-primary font-semibold hover:underline underline-offset-4"
          >
            Dev: Open Magic Link
          </a>

          <div class="pt-1">
            <SecondaryButton size="sm" @click="goToAccount">{{ t('auth.alreadyLoggedIn') }}</SecondaryButton>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
