export interface ApiProductScreenshot {
  id: number
  url: string
  sort_order: number
}

export interface ApiPriceTier {
  min_quantity: number
  unit_price_thb: number
}

export type ApiLabTestContentType =
  | 'application/pdf'
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp'

export interface ApiLabTestFile {
  id: number
  url: string
  content_type: ApiLabTestContentType
  label: string
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
  lab_test_files: ApiLabTestFile[]
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

export interface ProductWaitlistSignupResponse {
  success: true
}
