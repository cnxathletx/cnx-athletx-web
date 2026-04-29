import { apiFetch } from './client'
import { formatMoney } from '../utils/money'
import i18n from '../i18n'
import type { ApiProduct, ProductDetailResponse } from '../types/products'

export type {
  ApiLabTestContentType,
  ApiLabTestFile,
  ApiPriceTier,
  ApiProduct,
  ApiProductScreenshot,
  ApiRelatedProduct,
  ProductDetailResponse,
} from '../types/products'

function currentLocale(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const val = (i18n.global.locale as any).value ?? i18n.global.locale
    return typeof val === 'string' ? val : 'en'
  } catch {
    return 'en'
  }
}

export async function fetchProducts(): Promise<ApiProduct[]> {
  const data = await apiFetch<{ products: ApiProduct[] }>(
    `/api/products?locale=${encodeURIComponent(currentLocale())}`,
    { parseError: () => new Error('Failed to fetch products') },
  )
  return data.products
}

export async function fetchProductBySlug(slug: string): Promise<ProductDetailResponse> {
  return apiFetch<ProductDetailResponse>(
    `/api/products/${encodeURIComponent(slug)}?locale=${encodeURIComponent(currentLocale())}`,
    {
      parseError: (_payload, response) =>
        response.status === 404 ? new Error('Product not found') : new Error('Failed to fetch product'),
    },
  )
}

const prefetched = new Set<string>()

export function prefetchProductBySlug(slug: string): void {
  const key = `${slug}|${currentLocale()}`
  if (prefetched.has(key)) return
  prefetched.add(key)
  void apiFetch<ProductDetailResponse>(
    `/api/products/${encodeURIComponent(slug)}?locale=${encodeURIComponent(currentLocale())}`,
  ).catch(() => {
    prefetched.delete(key)
  })
}

export const formatPrice = formatMoney

export function formatWeight(grams: number): string {
  return grams >= 1000 ? `${grams / 1000}kg` : `${grams}g`
}
