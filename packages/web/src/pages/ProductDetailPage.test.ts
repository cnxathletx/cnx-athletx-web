import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRouter, createWebHistory } from 'vue-router'
import { createPinia } from 'pinia'
import i18n from '../i18n'
import ProductDetailPage from './ProductDetailPage.vue'
import { fetchProductBySlug, joinProductWaitlist } from '../api/products'

vi.mock('../api/products', async () => {
  const actual = await vi.importActual<typeof import('../api/products')>('../api/products')
  return {
    ...actual,
    fetchProductBySlug: vi.fn(),
    joinProductWaitlist: vi.fn(),
  }
})

vi.mock('../composables/useProductReviews', () => ({
  useProductReviews: () => ({
    summary: { value: null },
    reviews: { value: [] },
    page: { value: 1 },
    pageSize: { value: 5 },
    total: { value: 0 },
    loading: { value: false },
    error: { value: '' },
    setPage: vi.fn(),
  }),
}))

const product = {
  id: 1,
  slug: 'plant-protein-500g',
  name: 'CNX Plant Protein 500g',
  description: 'Protein',
  price_thb: 89900,
  weight_g: 500,
  image_url: '/image.jpg',
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

async function mountPage(stock = 0) {
  vi.mocked(fetchProductBySlug).mockResolvedValue({
    product: { ...product, available_stock: stock },
    related: null,
  })
  const router = createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/product/:slug', component: ProductDetailPage },
      { path: '/shop', component: { template: '<div />' } },
    ],
  })
  router.push('/product/plant-protein-500g')
  await router.isReady()

  const wrapper = mount(ProductDetailPage, {
    global: {
      plugins: [router, i18n, createPinia()],
      stubs: {
        ReviewSummary: true,
        ReviewList: true,
        ProductCard: true,
      },
    },
  })
  await flushPromises()
  return wrapper
}

describe('ProductDetailPage waitlist', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.mocked(joinProductWaitlist).mockResolvedValue({ success: true })
  })

  it('shows waitlist form when product is out of stock', async () => {
    const wrapper = await mountPage(0)
    expect(wrapper.text()).toContain('Notify me when back in stock')
    expect(wrapper.find('input[type="email"]').exists()).toBe(true)
  })

  it('keeps add to cart when product is in stock', async () => {
    const wrapper = await mountPage(5)
    expect(wrapper.text()).toContain('Add to Cart')
    expect(wrapper.text()).not.toContain('Notify me when back in stock')
  })

  it('submits email and marketing consent', async () => {
    const wrapper = await mountPage(0)
    await wrapper.find('input[type="email"]').setValue('buyer@example.com')
    await wrapper.find('input[type="checkbox"]').setValue(true)
    await wrapper.find('form').trigger('submit.prevent')
    await flushPromises()

    expect(joinProductWaitlist).toHaveBeenCalledWith('plant-protein-500g', {
      email: 'buyer@example.com',
      marketing_consent: true,
    })
    expect(wrapper.text()).toContain("We'll email you when this product is back in stock.")
  })
})
