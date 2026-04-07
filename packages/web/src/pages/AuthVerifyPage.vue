<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { AuthApiErrorResponse, verifyMagicLink } from '../api/auth'
import PrimaryButton from '../components/ui/PrimaryButton.vue'
import SecondaryButton from '../components/ui/SecondaryButton.vue'
import { useAuthStore } from '../stores/auth'

const { t } = useI18n({ useScope: 'global' })

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const loading = ref(true)
const error = ref('')

onMounted(async () => {
  const token = typeof route.query.token === 'string' ? route.query.token : ''

  if (!token) {
    error.value = 'This login link is invalid or missing.'
    loading.value = false
    return
  }

  try {
    const user = await verifyMagicLink(token)
    auth.setUser(user)

    const savedRedirect = localStorage.getItem('cnx-auth-redirect')
    if (savedRedirect) {
      localStorage.removeItem('cnx-auth-redirect')
      await router.replace(savedRedirect)
      return
    }

    await router.replace('/account')
  } catch (err) {
    if (err instanceof AuthApiErrorResponse) {
      error.value = err.message
    } else {
      error.value = 'This login link is invalid or expired. Please request a new one.'
    }
  } finally {
    loading.value = false
  }
})

function goToLogin() {
  router.push('/login')
}
</script>

<template>
  <div class="bg-background min-h-[60vh]">
    <div class="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 py-10">
      <div class="max-w-md mx-auto bg-surface rounded-lg ring-1 ring-[var(--card-ring)] p-6 sm:p-8 text-center space-y-5">
        <div v-if="loading" class="space-y-4">
          <div class="w-10 h-10 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto" />
          <p class="text-foreground font-semibold">{{ t('auth.verifying') }}</p>
        </div>

        <div v-else-if="error" class="space-y-4">
          <p class="text-error font-semibold">{{ error }}</p>
          <div class="flex flex-col sm:flex-row gap-3 justify-center">
            <PrimaryButton size="sm" @click="goToLogin">{{ t('auth.requestNewLink') }}</PrimaryButton>
            <RouterLink to="/">
              <SecondaryButton size="sm">{{ t('common.backToHome') }}</SecondaryButton>
            </RouterLink>
          </div>
        </div>

        <div v-else class="space-y-4">
          <p class="text-foreground font-semibold">{{ t('auth.verified') }}</p>
        </div>
      </div>
    </div>
  </div>
</template>
