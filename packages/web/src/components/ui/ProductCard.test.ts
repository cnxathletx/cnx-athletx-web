import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import ProductCard from './ProductCard.vue'
import { useCartStore } from '../../stores/cart'

// happy-dom's localStorage is limited — stub it
const store: Record<string, string> = {}
vi.stubGlobal('localStorage', {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = value },
  removeItem: (key: string) => { delete store[key] },
})

const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/product/:slug', component: { template: '<div />' } }],
})

const baseProps = {
  productId: 1,
  name: 'CNX Plant Protein 500g',
  slug: 'plant-protein-500g',
  weight: '500g',
  priceFormatted: '฿899',
  priceSatang: 89900,
  imageUrl: '/images/products/plant-protein-500g.jpg',
  inStock: true,
}

function mountCard(propsOverride: Record<string, unknown> = {}) {
  return mount(ProductCard, {
    props: { ...baseProps, ...propsOverride },
    global: { plugins: [router] },
  })
}

describe('ProductCard', () => {
  beforeEach(() => {
    for (const key of Object.keys(store)) delete store[key]
    setActivePinia(createPinia())
  })

  it('renders product name', () => {
    const wrapper = mountCard()
    expect(wrapper.text()).toContain('CNX Plant Protein 500g')
  })

  it('renders formatted price', () => {
    const wrapper = mountCard()
    expect(wrapper.text()).toContain('฿899')
  })

  it('renders weight badge', () => {
    const wrapper = mountCard()
    expect(wrapper.text()).toContain('500g')
  })

  it('renders "Add to Cart" button when in stock', () => {
    const wrapper = mountCard()
    const btn = wrapper.find('button')
    expect(btn.text()).toBe('Add to Cart')
    expect(btn.attributes('disabled')).toBeUndefined()
  })

  it('renders "Sold Out" button when out of stock', () => {
    const wrapper = mountCard({ inStock: false })
    const btn = wrapper.find('button')
    expect(btn.text()).toBe('Sold Out')
    expect(btn.attributes('disabled')).toBeDefined()
  })

  it('shows out of stock overlay when not in stock', () => {
    const wrapper = mountCard({ inStock: false })
    expect(wrapper.text()).toContain('Out of Stock')
  })

  it('does not show out of stock overlay when in stock', () => {
    const wrapper = mountCard({ inStock: true })
    expect(wrapper.text()).not.toContain('Out of Stock')
  })

  it('links to product detail page', () => {
    const wrapper = mountCard()
    const links = wrapper.findAll('a')
    const productLinks = links.filter((l) => l.attributes('href')?.includes('/product/plant-protein-500g'))
    expect(productLinks.length).toBeGreaterThan(0)
  })

  it('adds item to cart when clicking Add to Cart', async () => {
    const wrapper = mountCard()
    const cart = useCartStore()

    await wrapper.find('button').trigger('click')
    expect(cart.items).toHaveLength(1)
    expect(cart.items[0].productId).toBe(1)
    expect(cart.items[0].name).toBe('CNX Plant Protein 500g')
  })

  it('shows fallback when image URL is empty', () => {
    const wrapper = mountCard({ imageUrl: '' })
    // Should show fallback SVG, not an img tag
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.find('svg').exists()).toBe(true)
  })

  it('renders product image when imageUrl is provided', () => {
    const wrapper = mountCard()
    const img = wrapper.find('img')
    expect(img.exists()).toBe(true)
    expect(img.attributes('src')).toBe('/images/products/plant-protein-500g.jpg')
    expect(img.attributes('alt')).toBe('CNX Plant Protein 500g')
  })
})
