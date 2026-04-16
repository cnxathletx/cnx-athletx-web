import { apiUrl } from './client'

export interface ApiProductScreenshot {
  id: number
  url: string
  sort_order: number
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
}

export async function fetchProducts(): Promise<ApiProduct[]> {
  const res = await fetch(apiUrl('/api/products'))
  if (!res.ok) throw new Error('Failed to fetch products')
  const data = (await res.json()) as { products: ApiProduct[] }
  return data.products
}

export async function fetchProductBySlug(slug: string): Promise<ApiProduct> {
  const res = await fetch(apiUrl(`/api/products/${encodeURIComponent(slug)}`))
  if (res.status === 404) throw new Error('Product not found')
  if (!res.ok) throw new Error('Failed to fetch product')
  const data = (await res.json()) as { product: ApiProduct }
  return data.product
}

export function formatPrice(satang: number): string {
  const thb = satang / 100
  return `฿${thb.toLocaleString()}`
}

export function formatWeight(grams: number): string {
  return grams >= 1000 ? `${grams / 1000}kg` : `${grams}g`
}
