import { defineStore } from 'pinia'
import { fetchMe, logoutApi, type AuthUser } from '../api/auth'

interface AuthState {
  user: AuthUser | null
  loading: boolean
  initialized: boolean
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    user: null,
    loading: true,
    initialized: false,
  }),

  getters: {
    isAuthenticated: (state) => state.user !== null,
    displayName: (state) => state.user?.name?.trim() || state.user?.email || 'Guest',
    displayInitial: (state) => {
      const source = state.user?.name?.trim() || state.user?.email || 'G'
      return source.charAt(0).toUpperCase()
    },
  },

  actions: {
    async init(force = false) {
      if (this.initialized && !force) {
        return
      }

      this.loading = true
      try {
        this.user = await fetchMe()
      } catch {
        this.user = null
      } finally {
        this.loading = false
        this.initialized = true
      }
    },

    setUser(user: AuthUser | null) {
      this.user = user
      this.initialized = true
      this.loading = false
    },

    async logout() {
      try {
        await logoutApi()
      } finally {
        this.user = null
      }
    },
  },
})
