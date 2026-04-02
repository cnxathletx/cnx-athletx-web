import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useCartStore, type CartItem } from './cart'

function makeProduct(id = 1): Omit<CartItem, 'quantity'> {
  return {
    productId: id,
    slug: `product-${id}`,
    name: `Product ${id}`,
    weightLabel: '500g',
    priceSatang: 89900,
    imageUrl: '/img/product.jpg',
  }
}

// happy-dom's localStorage is limited, so we use a simple in-memory mock
const store: Record<string, string> = {}
const localStorageMock = {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { store[key] = value }),
  removeItem: vi.fn((key: string) => { delete store[key] }),
}
vi.stubGlobal('localStorage', localStorageMock)

describe('cart store', () => {
  beforeEach(() => {
    for (const key of Object.keys(store)) delete store[key]
    vi.clearAllMocks()
    setActivePinia(createPinia())
  })

  // --- Initial state ---

  it('starts with empty cart', () => {
    const cart = useCartStore()
    expect(cart.items).toEqual([])
    expect(cart.totalItems).toBe(0)
    expect(cart.subtotalSatang).toBe(0)
  })

  it('loads cart from localStorage', () => {
    store['cnx-cart'] = JSON.stringify([{ ...makeProduct(), quantity: 2 }])
    setActivePinia(createPinia())
    const cart = useCartStore()
    expect(cart.items).toHaveLength(1)
    expect(cart.items[0].quantity).toBe(2)
  })

  it('handles corrupted localStorage gracefully', () => {
    store['cnx-cart'] = 'not-json{{{'
    setActivePinia(createPinia())
    const cart = useCartStore()
    expect(cart.items).toEqual([])
  })

  // --- addItem ---

  it('adds a new item', () => {
    const cart = useCartStore()
    cart.addItem(makeProduct())
    expect(cart.items).toHaveLength(1)
    expect(cart.items[0].quantity).toBe(1)
    expect(cart.items[0].productId).toBe(1)
  })

  it('increments quantity for existing item', () => {
    const cart = useCartStore()
    cart.addItem(makeProduct())
    cart.addItem(makeProduct())
    expect(cart.items).toHaveLength(1)
    expect(cart.items[0].quantity).toBe(2)
  })

  it('adds custom quantity', () => {
    const cart = useCartStore()
    cart.addItem(makeProduct(), 3)
    expect(cart.items[0].quantity).toBe(3)
  })

  it('caps quantity at 10', () => {
    const cart = useCartStore()
    cart.addItem(makeProduct(), 8)
    cart.addItem(makeProduct(), 5)
    expect(cart.items[0].quantity).toBe(10)
  })

  it('persists to localStorage after add', () => {
    const cart = useCartStore()
    cart.addItem(makeProduct())
    const stored = JSON.parse(store['cnx-cart'])
    expect(stored).toHaveLength(1)
  })

  // --- removeItem ---

  it('removes an item by productId', () => {
    const cart = useCartStore()
    cart.addItem(makeProduct(1))
    cart.addItem(makeProduct(2))
    cart.removeItem(1)
    expect(cart.items).toHaveLength(1)
    expect(cart.items[0].productId).toBe(2)
  })

  it('does nothing when removing non-existent item', () => {
    const cart = useCartStore()
    cart.addItem(makeProduct(1))
    cart.removeItem(999)
    expect(cart.items).toHaveLength(1)
  })

  // --- updateQuantity ---

  it('updates item quantity', () => {
    const cart = useCartStore()
    cart.addItem(makeProduct())
    cart.updateQuantity(1, 5)
    expect(cart.items[0].quantity).toBe(5)
  })

  it('caps updated quantity at 10', () => {
    const cart = useCartStore()
    cart.addItem(makeProduct())
    cart.updateQuantity(1, 15)
    expect(cart.items[0].quantity).toBe(10)
  })

  it('removes item when quantity set to 0', () => {
    const cart = useCartStore()
    cart.addItem(makeProduct())
    cart.updateQuantity(1, 0)
    expect(cart.items).toHaveLength(0)
  })

  it('removes item when quantity set to negative', () => {
    const cart = useCartStore()
    cart.addItem(makeProduct())
    cart.updateQuantity(1, -1)
    expect(cart.items).toHaveLength(0)
  })

  // --- clearCart ---

  it('clears all items', () => {
    const cart = useCartStore()
    cart.addItem(makeProduct(1))
    cart.addItem(makeProduct(2))
    cart.clearCart()
    expect(cart.items).toHaveLength(0)
    expect(store['cnx-cart']).toBe('[]')
  })

  // --- computed ---

  it('calculates totalItems correctly', () => {
    const cart = useCartStore()
    cart.addItem(makeProduct(1), 2)
    cart.addItem(makeProduct(2), 3)
    expect(cart.totalItems).toBe(5)
  })

  it('calculates subtotalSatang correctly', () => {
    const cart = useCartStore()
    cart.addItem({ ...makeProduct(1), priceSatang: 10000 }, 2)
    cart.addItem({ ...makeProduct(2), priceSatang: 20000 }, 1)
    expect(cart.subtotalSatang).toBe(40000) // 10000*2 + 20000*1
  })

  it('recalculates after removal', () => {
    const cart = useCartStore()
    cart.addItem({ ...makeProduct(1), priceSatang: 10000 }, 2)
    cart.addItem({ ...makeProduct(2), priceSatang: 20000 }, 1)
    cart.removeItem(2)
    expect(cart.totalItems).toBe(2)
    expect(cart.subtotalSatang).toBe(20000)
  })
})
