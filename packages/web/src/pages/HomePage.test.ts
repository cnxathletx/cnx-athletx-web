import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../i18n'
import HomePage from './HomePage.vue'
import { fetchProducts } from '../api/products'
import type { ApiProduct } from '../types/products'

vi.mock('../api/products', async () => {
  const actual = await vi.importActual<typeof import('../api/products')>('../api/products')
  return {
    ...actual,
    fetchProducts: vi.fn(),
  }
})

const baseProduct: ApiProduct = {
  id: 1,
  slug: 'plant-protein-500g',
  name: 'CNX Plant Protein 500g',
  description: 'Plant protein',
  price_thb: 89900,
  weight_g: 500,
  image_url: '/images/products/plant-protein-500g.jpg',
  available_stock: 0,
  nutrition_json: null,
  ingredients: null,
  how_to_use: null,
  who_is_for: null,
  regulatory_info: null,
  product_line_name: null,
  screenshots: [],
  price_tiers: [],
  lab_test_files: [],
}

function mountPage() {
  return mount(HomePage, {
    global: {
      plugins: [i18n],
      stubs: {
        RouterLink: { template: '<a><slot /></a>' },
        ProductCard: { template: '<article />' },
      },
    },
  })
}

describe('HomePage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.mocked(fetchProducts).mockResolvedValue([])
  })

  it('shows the out-of-stock notice when all products are unavailable', async () => {
    vi.mocked(fetchProducts).mockResolvedValue([
      { ...baseProduct, id: 1, available_stock: 0 },
      { ...baseProduct, id: 2, slug: 'plant-protein-1kg', available_stock: 0 },
    ])

    const wrapper = mountPage()

    await flushPromises()

    expect(wrapper.text()).toContain("Sorry, we're out of stock due to unexpected demand, but we'll be back soon.")
  })

  it('hides the out-of-stock notice when any product is available', async () => {
    vi.mocked(fetchProducts).mockResolvedValue([
      { ...baseProduct, id: 1, available_stock: 0 },
      { ...baseProduct, id: 2, slug: 'plant-protein-1kg', available_stock: 3 },
    ])

    const wrapper = mountPage()

    await flushPromises()

    expect(wrapper.text()).not.toContain("Sorry, we're out of stock due to unexpected demand, but we'll be back soon.")
  })
})
