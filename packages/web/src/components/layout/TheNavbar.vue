<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { useTheme } from '../../composables/useTheme'
import { useCartStore } from '../../stores/cart'
import { useAuthStore } from '../../stores/auth'

const { isDark, toggle } = useTheme()
const cart = useCartStore()
const auth = useAuthStore()
const router = useRouter()
const mobileOpen = ref(false)

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
  <header class="sticky top-0 z-50 border-b border-[var(--grid-line)] bg-background/90 backdrop-blur-xl">
    <div class="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8">
      <div class="flex items-center justify-between h-16">
        <!-- Logo -->
        <RouterLink to="/" class="shrink-0">
          <div class="flex flex-col leading-none">
            <span class="brand-kicker text-accent">Natural Performance</span>
            <span class="brand-title text-lg text-primary sm:text-xl">CNX AthletX</span>
          </div>
        </RouterLink>

        <!-- Desktop Navigation -->
        <nav class="hidden md:flex items-center space-x-8">
          <RouterLink
            to="/"
            class="font-brand text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-foreground transition-colors hover:text-accent"
          >
            Home
          </RouterLink>
          <RouterLink
            to="/shop"
            class="font-brand text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-foreground transition-colors hover:text-accent"
          >
            Shop
          </RouterLink>
          <RouterLink
            to="/order/status"
            class="font-brand text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-foreground transition-colors hover:text-accent"
          >
            Track Order
          </RouterLink>
        </nav>

        <!-- Actions: Theme Toggle + Cart + Mobile Menu -->
        <div class="flex items-center space-x-2">
          <RouterLink
            v-if="!auth.loading && !auth.isAuthenticated"
            to="/login"
            class="hidden md:inline-flex px-2 py-1 font-brand text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-foreground transition-colors hover:text-accent"
          >
            Log In
          </RouterLink>

          <RouterLink
            v-if="!auth.loading && auth.isAuthenticated"
            to="/account"
            class="hidden md:inline-flex items-center gap-2 px-2 py-1 font-brand text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-foreground transition-colors hover:text-accent"
          >
            <span class="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--card-ring)] bg-primary text-xs font-bold text-background">
              {{ auth.displayInitial }}
            </span>
            Account
          </RouterLink>

          <button
            v-if="!auth.loading && auth.isAuthenticated"
            class="hidden md:inline-flex px-2 py-1 font-brand text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-muted transition-colors hover:text-signal"
            @click="handleLogout"
          >
            Log Out
          </button>

          <!-- Theme Toggle -->
          <button
            @click="toggle"
            class="rounded-full border border-[var(--card-ring)] bg-[var(--panel-wash)] p-2.5 text-foreground transition-colors hover:text-accent"
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
            class="relative rounded-full border border-[var(--card-ring)] bg-[var(--panel-wash)] p-2.5 text-foreground transition-colors hover:text-accent"
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
              class="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[0.65rem] font-bold text-background"
            >
              {{ cart.totalItems > 9 ? '9+' : cart.totalItems }}
            </span>
          </RouterLink>

          <!-- Mobile Menu Button -->
          <button
            class="rounded-full border border-[var(--card-ring)] bg-[var(--panel-wash)] p-2.5 text-foreground transition-colors hover:text-accent md:hidden"
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
      class="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm md:hidden"
      @click="closeMobile"
    />
  </Transition>

  <!-- Mobile Drawer -->
  <Transition name="drawer">
    <div
      v-if="mobileOpen"
      class="brand-panel fixed inset-y-0 right-0 z-50 w-72 md:hidden"
    >
      <div class="p-6 space-y-8">
        <!-- Close -->
        <div class="flex justify-end">
          <button
            @click="closeMobile"
            class="rounded-full border border-[var(--card-ring)] bg-[var(--panel-wash)] p-2.5 text-foreground transition-colors hover:text-accent"
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

        <!-- Theme Toggle in Mobile -->
        <div class="flex items-center justify-between px-1">
          <span class="font-brand text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-muted">Theme</span>
          <button
            @click="toggle"
            class="rounded-full border border-[var(--card-ring)] bg-[var(--panel-wash)] p-2.5 text-foreground transition-colors hover:text-accent"
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
            class="rounded-2xl px-3 py-3 font-brand text-sm font-semibold uppercase tracking-[0.16em] text-foreground transition-colors hover:bg-white/5 hover:text-accent"
          >
            Home
          </RouterLink>
          <RouterLink
            to="/shop"
            @click="closeMobile"
            class="rounded-2xl px-3 py-3 font-brand text-sm font-semibold uppercase tracking-[0.16em] text-foreground transition-colors hover:bg-white/5 hover:text-accent"
          >
            Shop
          </RouterLink>
          <RouterLink
            to="/order/status"
            @click="closeMobile"
            class="rounded-2xl px-3 py-3 font-brand text-sm font-semibold uppercase tracking-[0.16em] text-foreground transition-colors hover:bg-white/5 hover:text-accent"
          >
            Track Order
          </RouterLink>

          <RouterLink
            v-if="!auth.loading && !auth.isAuthenticated"
            to="/login"
            @click="closeMobile"
            class="rounded-2xl px-3 py-3 font-brand text-sm font-semibold uppercase tracking-[0.16em] text-foreground transition-colors hover:bg-white/5 hover:text-accent"
          >
            Log In
          </RouterLink>

          <RouterLink
            v-if="!auth.loading && auth.isAuthenticated"
            to="/account"
            @click="closeMobile"
            class="rounded-2xl px-3 py-3 font-brand text-sm font-semibold uppercase tracking-[0.16em] text-foreground transition-colors hover:bg-white/5 hover:text-accent"
          >
            My Account
          </RouterLink>

          <button
            v-if="!auth.loading && auth.isAuthenticated"
            class="rounded-2xl px-3 py-3 text-left font-brand text-sm font-semibold uppercase tracking-[0.16em] text-signal transition-colors hover:bg-white/5"
            @click="handleLogout"
          >
            Log Out
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
