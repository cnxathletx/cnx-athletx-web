import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { pickUnitPrice, type PriceTier } from '../utils/pricing'

export interface CartItem {
  productId: number
  slug: string
  name: string
  weightLabel: string
  priceSatang: number
  quantity: number
  imageUrl: string
  priceTiers?: PriceTier[]
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

export function unitPriceFor(item: CartItem): number {
  return pickUnitPrice(item.priceSatang, item.priceTiers ?? [], item.quantity)
}

export function lineTotalFor(item: CartItem): number {
  return unitPriceFor(item) * item.quantity
}

export const useCartStore = defineStore('cart', () => {
  const items = ref<CartItem[]>(loadCart())

  const totalItems = computed(() => items.value.reduce((sum, item) => sum + item.quantity, 0))

  const subtotalSatang = computed(() =>
    items.value.reduce((sum, item) => sum + lineTotalFor(item), 0)
  )

  function addItem(product: Omit<CartItem, 'quantity'>, quantity = 1) {
    const existing = items.value.find((item) => item.productId === product.productId)
    if (existing) {
      existing.quantity = Math.min(existing.quantity + quantity, 10)
      // Refresh tier metadata from latest product data in case admin updated tiers.
      existing.priceSatang = product.priceSatang
      existing.priceTiers = product.priceTiers
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
