import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../i18n'
import ShopPage from './ShopPage.vue'
import { fetchProducts } from '../api/products'
import { fetchPublicSettings } from '../api/settings'

vi.mock('../api/products', async () => {
  const actual = await vi.importActual<typeof import('../api/products')>('../api/products')
  return {
    ...actual,
    fetchProducts: vi.fn(),
  }
})

vi.mock('../api/settings', () => ({
  fetchPublicSettings: vi.fn(),
}))

function mountPage() {
  return mount(ShopPage, {
    global: {
      plugins: [i18n],
      stubs: {
        ProductCard: { template: '<article />' },
      },
    },
  })
}

describe('ShopPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.mocked(fetchProducts).mockResolvedValue([])
    vi.mocked(fetchPublicSettings).mockResolvedValue({
      shipping_flat_rate: 10000,
      shipping_free_threshold: 123456,
    })
  })

  it('renders the free shipping threshold as baht from satang', async () => {
    const wrapper = mountPage()

    await flushPromises()

    expect(wrapper.text()).toContain('Free Shipping over ฿1,234.56')
    expect(wrapper.text()).not.toContain('Free Shipping over ฿1,235')
  })
})
