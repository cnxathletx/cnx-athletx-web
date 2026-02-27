import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface CartItem {
  productId: number
  slug: string
  name: string
  weightLabel: string
  priceSatang: number
  quantity: number
  imageUrl: string
}

const STORAGE_KEY = 'cnx-cart'

function loadCart(): CartItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveCart(items: CartItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
}

export const useCartStore = defineStore('cart', () => {
  const items = ref<CartItem[]>(loadCart())

  const totalItems = computed(() => items.value.reduce((sum, item) => sum + item.quantity, 0))

  const subtotalSatang = computed(() =>
    items.value.reduce((sum, item) => sum + item.priceSatang * item.quantity, 0)
  )

  function addItem(product: Omit<CartItem, 'quantity'>, quantity = 1) {
    const existing = items.value.find((item) => item.productId === product.productId)
    if (existing) {
      existing.quantity = Math.min(existing.quantity + quantity, 10)
    } else {
      items.value.push({ ...product, quantity })
    }
    saveCart(items.value)
  }

  function removeItem(productId: number) {
    items.value = items.value.filter((item) => item.productId !== productId)
    saveCart(items.value)
  }

  function updateQuantity(productId: number, quantity: number) {
    const item = items.value.find((i) => i.productId === productId)
    if (item) {
      if (quantity <= 0) {
        removeItem(productId)
      } else {
        item.quantity = Math.min(quantity, 10)
        saveCart(items.value)
      }
    }
  }

  function clearCart() {
    items.value = []
    saveCart(items.value)
  }

  return { items, totalItems, subtotalSatang, addItem, removeItem, updateQuantity, clearCart }
})
