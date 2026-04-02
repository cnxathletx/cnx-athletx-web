import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from './auth'

// Mock the auth API module
vi.mock('../api/auth', () => ({
  fetchMe: vi.fn(),
  logoutApi: vi.fn(),
}))

import { fetchMe, logoutApi } from '../api/auth'

const mockFetchMe = vi.mocked(fetchMe)
const mockLogoutApi = vi.mocked(logoutApi)

const testUser = { id: 'usr_1', email: 'john@example.com', name: 'John', phone: '+66812345678' }

describe('auth store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  // --- Initial state ---

  it('starts uninitialized with loading true', () => {
    const auth = useAuthStore()
    expect(auth.user).toBeNull()
    expect(auth.loading).toBe(true)
    expect(auth.initialized).toBe(false)
  })

  // --- Getters ---

  it('isAuthenticated returns false when no user', () => {
    const auth = useAuthStore()
    expect(auth.isAuthenticated).toBe(false)
  })

  it('isAuthenticated returns true when user set', () => {
    const auth = useAuthStore()
    auth.setUser(testUser)
    expect(auth.isAuthenticated).toBe(true)
  })

  it('displayName returns user name when available', () => {
    const auth = useAuthStore()
    auth.setUser(testUser)
    expect(auth.displayName).toBe('John')
  })

  it('displayName falls back to email when name is null', () => {
    const auth = useAuthStore()
    auth.setUser({ ...testUser, name: null })
    expect(auth.displayName).toBe('john@example.com')
  })

  it('displayName returns Guest when no user', () => {
    const auth = useAuthStore()
    expect(auth.displayName).toBe('Guest')
  })

  it('displayInitial returns first char of name uppercased', () => {
    const auth = useAuthStore()
    auth.setUser(testUser)
    expect(auth.displayInitial).toBe('J')
  })

  it('displayInitial falls back to email initial', () => {
    const auth = useAuthStore()
    auth.setUser({ ...testUser, name: null })
    expect(auth.displayInitial).toBe('J')
  })

  it('displayInitial returns G when no user', () => {
    const auth = useAuthStore()
    expect(auth.displayInitial).toBe('G')
  })

  // --- init ---

  it('fetches user on init', async () => {
    mockFetchMe.mockResolvedValueOnce(testUser)
    const auth = useAuthStore()
    await auth.init()

    expect(mockFetchMe).toHaveBeenCalledOnce()
    expect(auth.user).toEqual(testUser)
    expect(auth.loading).toBe(false)
    expect(auth.initialized).toBe(true)
  })

  it('sets user to null when fetchMe fails', async () => {
    mockFetchMe.mockRejectedValueOnce(new Error('Unauthorized'))
    const auth = useAuthStore()
    await auth.init()

    expect(auth.user).toBeNull()
    expect(auth.loading).toBe(false)
    expect(auth.initialized).toBe(true)
  })

  it('skips fetch on second init (not forced)', async () => {
    mockFetchMe.mockResolvedValueOnce(testUser)
    const auth = useAuthStore()
    await auth.init()
    await auth.init()

    expect(mockFetchMe).toHaveBeenCalledOnce()
  })

  it('re-fetches on forced init', async () => {
    mockFetchMe.mockResolvedValue(testUser)
    const auth = useAuthStore()
    await auth.init()
    await auth.init(true)

    expect(mockFetchMe).toHaveBeenCalledTimes(2)
  })

  // --- setUser ---

  it('sets user directly and marks initialized', () => {
    const auth = useAuthStore()
    auth.setUser(testUser)

    expect(auth.user).toEqual(testUser)
    expect(auth.initialized).toBe(true)
    expect(auth.loading).toBe(false)
  })

  it('clears user when set to null', () => {
    const auth = useAuthStore()
    auth.setUser(testUser)
    auth.setUser(null)

    expect(auth.user).toBeNull()
    expect(auth.isAuthenticated).toBe(false)
  })

  // --- logout ---

  it('calls logoutApi and clears user', async () => {
    mockLogoutApi.mockResolvedValueOnce()
    const auth = useAuthStore()
    auth.setUser(testUser)
    await auth.logout()

    expect(mockLogoutApi).toHaveBeenCalledOnce()
    expect(auth.user).toBeNull()
  })

  it('clears user even when logoutApi fails', async () => {
    mockLogoutApi.mockRejectedValueOnce(new Error('Network error'))
    const auth = useAuthStore()
    auth.setUser(testUser)
    await expect(auth.logout()).rejects.toThrow('Network error')

    expect(auth.user).toBeNull()
  })
})
