<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useTheme } from '../../composables/useTheme'
import { useCartStore } from '../../stores/cart'
import { useAuthStore } from '../../stores/auth'
import { setLocale } from '../../i18n'

const { t, locale } = useI18n()
const { isDark, toggle } = useTheme()
const cart = useCartStore()
const auth = useAuthStore()
const router = useRouter()
const mobileOpen = ref(false)

function toggleLocale() {
  setLocale(locale.value === 'en' ? 'th' : 'en')
}

function closeMobile() {
  mobileOpen.value = false
}

async function handleLogout() {
  await auth.logout()
  closeMobile()
  await router.push('/')
}
</script>

<template>
  <header class="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-sand">
    <div class="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8">
      <div class="flex items-center justify-between h-16">
        <!-- Logo -->
        <RouterLink to="/" class="flex items-center gap-2 shrink-0">
          <span class="text-xl font-bold tracking-tight text-foreground">CNX</span>
          <span class="text-xl font-bold tracking-tight text-primary">AthletX</span>
        </RouterLink>

        <!-- Desktop Navigation -->
        <nav class="hidden md:flex items-center space-x-8">
          <RouterLink
            to="/"
            class="text-sm font-semibold text-foreground hover:text-primary transition-colors"
          >
            {{ t('nav.home') }}
          </RouterLink>
          <RouterLink
            to="/shop"
            class="text-sm font-semibold text-foreground hover:text-primary transition-colors"
          >
            {{ t('nav.shop') }}
          </RouterLink>
          <RouterLink
            to="/order/status"
            class="text-sm font-semibold text-foreground hover:text-primary transition-colors"
          >
            {{ t('nav.trackOrder') }}
          </RouterLink>
        </nav>

        <!-- Actions: Theme Toggle + Cart + Mobile Menu -->
        <div class="flex items-center space-x-2">
          <RouterLink
            v-if="!auth.loading && !auth.isAuthenticated"
            to="/login"
            class="hidden md:inline-flex text-sm font-semibold text-foreground hover:text-primary transition-colors px-2 py-1"
          >
            {{ t('nav.logIn') }}
          </RouterLink>

          <RouterLink
            v-if="!auth.loading && auth.isAuthenticated"
            to="/account"
            class="hidden md:inline-flex items-center gap-2 px-2 py-1 text-sm font-semibold text-foreground hover:text-primary transition-colors"
          >
            <span class="w-7 h-7 rounded-full bg-primary text-background flex items-center justify-center text-xs font-bold">
              {{ auth.displayInitial }}
            </span>
            {{ t('nav.account') }}
          </RouterLink>

          <button
            v-if="!auth.loading && auth.isAuthenticated"
            class="hidden md:inline-flex text-sm font-semibold text-muted hover:text-error transition-colors px-2 py-1"
            @click="handleLogout"
          >
            {{ t('nav.logOut') }}
          </button>

          <!-- Language Toggle -->
          <button
            @click="toggleLocale"
            class="px-2 py-1.5 text-xs font-bold text-foreground hover:text-primary transition-colors rounded-md"
            :aria-label="t('common.language')"
          >
            {{ locale === 'en' ? 'TH' : 'EN' }}
          </button>

          <!-- Theme Toggle -->
          <button
            @click="toggle"
            class="p-2.5 text-foreground hover:text-primary transition-colors rounded-md"
            aria-label="Toggle theme"
          >
            <!-- Sun icon (shown in dark mode) -->
            <svg
              v-if="isDark"
              class="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
              />
            </svg>
            <!-- Moon icon (shown in light mode) -->
            <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
              />
            </svg>
          </button>

          <!-- Cart Icon -->
          <RouterLink
            to="/cart"
            class="relative p-2.5 text-foreground hover:text-primary transition-colors"
          >
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
              />
            </svg>
            <!-- Count Badge -->
            <span
              v-if="cart.totalItems > 0"
              class="absolute -top-1 -right-1 bg-primary text-background text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center"
            >
              {{ cart.totalItems > 9 ? '9+' : cart.totalItems }}
            </span>
          </RouterLink>

          <!-- Mobile Menu Button -->
          <button
            class="md:hidden p-2.5 text-foreground hover:text-primary transition-colors"
            @click="mobileOpen = !mobileOpen"
            :aria-label="mobileOpen ? 'Close menu' : 'Open menu'"
          >
            <svg
              v-if="!mobileOpen"
              class="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
            <svg v-else class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  </header>

  <!-- Mobile Drawer Overlay -->
  <Transition name="overlay">
    <div
      v-if="mobileOpen"
      class="fixed inset-0 z-50 bg-foreground/50 backdrop-blur-sm md:hidden"
      @click="closeMobile"
    />
  </Transition>

  <!-- Mobile Drawer -->
  <Transition name="drawer">
    <div
      v-if="mobileOpen"
      class="fixed inset-y-0 right-0 z-50 w-72 bg-surface shadow-lg md:hidden"
    >
      <div class="p-6 space-y-8">
        <!-- Close -->
        <div class="flex justify-end">
          <button
            @click="closeMobile"
            class="p-2.5 text-foreground hover:text-primary transition-colors"
            aria-label="Close menu"
          >
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <!-- Language Toggle in Mobile -->
        <div class="flex items-center justify-between px-1">
          <span class="text-sm font-medium text-muted">{{ t('common.language') }}</span>
          <button
            @click="toggleLocale"
            class="px-3 py-1.5 text-sm font-bold text-foreground hover:text-primary transition-colors rounded-md"
          >
            {{ locale === 'en' ? 'ไทย' : 'English' }}
          </button>
        </div>

        <!-- Theme Toggle in Mobile -->
        <div class="flex items-center justify-between px-1">
          <span class="text-sm font-medium text-muted">{{ t('nav.theme') }}</span>
          <button
            @click="toggle"
            class="p-2.5 text-foreground hover:text-primary transition-colors rounded-md"
            aria-label="Toggle theme"
          >
            <svg
              v-if="isDark"
              class="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
              />
            </svg>
            <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
              />
            </svg>
          </button>
        </div>

        <!-- Navigation Links -->
        <nav class="flex flex-col space-y-1">
          <RouterLink
            to="/"
            @click="closeMobile"
            class="text-lg font-semibold text-foreground hover:text-primary hover:bg-surface-alt px-3 py-3 rounded-md transition-colors"
          >
            {{ t('nav.home') }}
          </RouterLink>
          <RouterLink
            to="/shop"
            @click="closeMobile"
            class="text-lg font-semibold text-foreground hover:text-primary hover:bg-surface-alt px-3 py-3 rounded-md transition-colors"
          >
            {{ t('nav.shop') }}
          </RouterLink>
          <RouterLink
            to="/order/status"
            @click="closeMobile"
            class="text-lg font-semibold text-foreground hover:text-primary hover:bg-surface-alt px-3 py-3 rounded-md transition-colors"
          >
            {{ t('nav.trackOrder') }}
          </RouterLink>

          <RouterLink
            v-if="!auth.loading && !auth.isAuthenticated"
            to="/login"
            @click="closeMobile"
            class="text-lg font-semibold text-foreground hover:text-primary hover:bg-surface-alt px-3 py-3 rounded-md transition-colors"
          >
            {{ t('nav.logIn') }}
          </RouterLink>

          <RouterLink
            v-if="!auth.loading && auth.isAuthenticated"
            to="/account"
            @click="closeMobile"
            class="text-lg font-semibold text-foreground hover:text-primary hover:bg-surface-alt px-3 py-3 rounded-md transition-colors"
          >
            {{ t('nav.myAccount') }}
          </RouterLink>

          <button
            v-if="!auth.loading && auth.isAuthenticated"
            class="text-left text-lg font-semibold text-error hover:bg-surface-alt px-3 py-3 rounded-md transition-colors"
            @click="handleLogout"
          >
            {{ t('nav.logOut') }}
          </button>
        </nav>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.overlay-enter-active,
.overlay-leave-active {
  transition: opacity 0.2s ease;
}
.overlay-enter-from,
.overlay-leave-to {
  opacity: 0;
}

.drawer-enter-active,
.drawer-leave-active {
  transition: transform 0.3s ease;
}
.drawer-enter-from,
.drawer-leave-to {
  transform: translateX(100%);
}
</style>
