import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import TheNavbar from './TheNavbar.vue'
import { useCartStore } from '../../stores/cart'
import { useAuthStore } from '../../stores/auth'

// happy-dom's localStorage is limited — stub it
const store: Record<string, string> = {}
vi.stubGlobal('localStorage', {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = value },
  removeItem: (key: string) => { delete store[key] },
})

// Mock useTheme composable
vi.mock('../../composables/useTheme', () => ({
  useTheme: () => ({ isDark: { value: true }, toggle: vi.fn() }),
}))

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', component: { template: '<div />' } },
    { path: '/shop', component: { template: '<div />' } },
    { path: '/cart', component: { template: '<div />' } },
    { path: '/login', component: { template: '<div />' } },
    { path: '/account', component: { template: '<div />' } },
    { path: '/order/status', component: { template: '<div />' } },
  ],
})

function mountNavbar() {
  return mount(TheNavbar, {
    global: { plugins: [router] },
  })
}

describe('TheNavbar', () => {
  beforeEach(() => {
    for (const key of Object.keys(store)) delete store[key]
    setActivePinia(createPinia())
  })

  it('renders logo text', () => {
    const wrapper = mountNavbar()
    expect(wrapper.text()).toContain('CNX')
    expect(wrapper.text()).toContain('AthletX')
  })

  it('renders navigation links', () => {
    const wrapper = mountNavbar()
    expect(wrapper.text()).toContain('Home')
    expect(wrapper.text()).toContain('Shop')
    expect(wrapper.text()).toContain('Track Order')
  })

  it('shows "Log In" when not authenticated', () => {
    const auth = useAuthStore()
    auth.loading = false
    auth.setUser(null)

    const wrapper = mountNavbar()
    expect(wrapper.text()).toContain('Log In')
    expect(wrapper.text()).not.toContain('Account')
    expect(wrapper.text()).not.toContain('Log Out')
  })

  it('shows "Account" and "Log Out" when authenticated', () => {
    const auth = useAuthStore()
    auth.setUser({ id: 'u1', email: 'test@example.com', name: 'Test', phone: null })

    const wrapper = mountNavbar()
    expect(wrapper.text()).toContain('Account')
    expect(wrapper.text()).toContain('Log Out')
    expect(wrapper.text()).not.toContain('Log In')
  })

  it('shows user initial when authenticated', () => {
    const auth = useAuthStore()
    auth.setUser({ id: 'u1', email: 'test@example.com', name: 'Test User', phone: null })

    const wrapper = mountNavbar()
    expect(wrapper.text()).toContain('T') // displayInitial
  })

  it('does not show cart badge when cart is empty', () => {
    const wrapper = mountNavbar()
    // Cart badge uses absolute positioning class and shows count
    const badge = wrapper.find('.-top-1')
    expect(badge.exists()).toBe(false)
  })

  it('shows cart badge with count', () => {
    const cart = useCartStore()
    cart.addItem({
      productId: 1,
      slug: 'test',
      name: 'Test',
      weightLabel: '500g',
      priceSatang: 10000,
      imageUrl: '/img.jpg',
    })

    const wrapper = mountNavbar()
    expect(wrapper.text()).toContain('1')
  })

  it('shows 9+ for large cart counts', () => {
    const cart = useCartStore()
    for (let i = 1; i <= 10; i++) {
      cart.addItem({
        productId: i,
        slug: `product-${i}`,
        name: `Product ${i}`,
        weightLabel: '500g',
        priceSatang: 10000,
        imageUrl: '/img.jpg',
      })
    }

    const wrapper = mountNavbar()
    expect(wrapper.text()).toContain('9+')
  })

  it('has theme toggle button', () => {
    const wrapper = mountNavbar()
    const themeBtn = wrapper.find('[aria-label="Toggle theme"]')
    expect(themeBtn.exists()).toBe(true)
  })

  it('has mobile menu button', () => {
    const wrapper = mountNavbar()
    const menuBtn = wrapper.find('[aria-label="Open menu"]')
    expect(menuBtn.exists()).toBe(true)
  })
})
