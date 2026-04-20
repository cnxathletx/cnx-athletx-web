import { apiUrl } from './client'
import { formatMoney } from '../utils/money'
import i18n from '../i18n'

function currentLocale(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const val = (i18n.global.locale as any).value ?? i18n.global.locale
    return typeof val === 'string' ? val : 'en'
  } catch {
    return 'en'
  }
}

export interface ApiProductScreenshot {
  id: number
  url: string
  sort_order: number
}

export interface ApiPriceTier {
  min_quantity: number
  unit_price_thb: number
}

export interface ApiProduct {
  id: number
  slug: string
  name: string
  description: string
  price_thb: number
  weight_g: number
  image_url: string
  available_stock: number
  nutrition_json: string | null
  ingredients: string | null
  how_to_use: string | null
  who_is_for: string | null
  regulatory_info: string | null
  product_line_name: string | null
  screenshots: ApiProductScreenshot[]
  price_tiers: ApiPriceTier[]
}

export interface ApiRelatedProduct {
  id: number
  slug: string
  name: string
  price_thb: number
  weight_g: number
  image_url: string
  available_stock: number
}

export interface ProductDetailResponse {
  product: ApiProduct
  related: ApiRelatedProduct | null
}

export async function fetchProducts(): Promise<ApiProduct[]> {
  const res = await fetch(apiUrl(`/api/products?locale=${encodeURIComponent(currentLocale())}`))
  if (!res.ok) throw new Error('Failed to fetch products')
  const data = (await res.json()) as { products: ApiProduct[] }
  return data.products
}

export async function fetchProductBySlug(slug: string): Promise<ProductDetailResponse> {
  const res = await fetch(apiUrl(`/api/products/${encodeURIComponent(slug)}?locale=${encodeURIComponent(currentLocale())}`))
  if (res.status === 404) throw new Error('Product not found')
  if (!res.ok) throw new Error('Failed to fetch product')
  const data = (await res.json()) as ProductDetailResponse
  return data
}

export const formatPrice = formatMoney

export function formatWeight(grams: number): string {
  return grams >= 1000 ? `${grams / 1000}kg` : `${grams}g`
}
