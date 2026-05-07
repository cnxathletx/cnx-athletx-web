export interface AdminOrderListItem {
  id: string
  status: string
  customer_name: string
  total_thb: number
  items_count: number
  created_at: string
}

export interface AdminOrderItem {
  product_name: string
  quantity: number
  line_total_thb: number
}

export interface AdminPaymentProof {
  id: number
  proof_type: 'reference' | 'image_url'
  proof_value: string
  submitted_at: string
}

export interface AdminAuditLog {
  id: number
  admin_email: string
  action: string
  details_json: string | null
  created_at: string
}

export interface AdminOrderDetail {
  id: string
  status: string
  customer: {
    name: string
    email: string
    phone: string
  }
  shipping_address: {
    line1: string
    line2: string | null
    district: string
    province: string
    postal_code: string
  }
  subtotal_thb: number
  shipping_thb: number
  discount_thb: number
  total_thb: number
  items: AdminOrderItem[]
  shipment: { carrier: string; tracking_number: string; shipped_at: string } | null
  payment_proofs: AdminPaymentProof[]
  audit_logs: AdminAuditLog[]
  created_at: string
  updated_at: string
}

export interface AdminInventoryItem {
  product_id: number
  slug: string
  name: string
  price_thb: number
  active: boolean
  stock_count: number
  reserved_count: number
  available_count: number
}

export interface AdminProductScreenshot {
  id: number
  url: string
  sort_order: number
}

export interface AdminProduct {
  id: number
  product_line_id: number | null
  slug: string
  name: string
  description: string
  price_thb: number
  weight_g: number
  image_url: string
  active: boolean
  archived: boolean
  translations_json: string
  created_at: string
  updated_at: string
  stock_count: number
  reserved_count: number
  available_count: number
  screenshots: AdminProductScreenshot[]
}

export interface CreateAdminProductPayload {
  slug: string
  name: string
  description: string
  price_thb: number
  weight_g: number
  image_url: string
  active: boolean
  stock_count: number
  product_line_id: number | null
  translations_json: string
}

export interface UpdateAdminProductPayload {
  slug?: string
  name?: string
  description?: string
  price_thb?: number
  weight_g?: number
  image_url?: string
  active?: boolean
  archived?: boolean
  product_line_id?: number | null
  translations_json?: string
}

export interface AdminPriceTier {
  id: number
  product_id: number
  min_quantity: number
  unit_price_thb: number
  created_at: string
  updated_at: string
}

export interface UpsertPriceTierPayload {
  min_quantity: number
  unit_price_thb: number
}

export type AdminLabTestContentType =
  | 'application/pdf'
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp'

export interface AdminLabTestFile {
  id: number
  url: string
  content_type: AdminLabTestContentType
  label: string
  sort_order: number
  size_bytes: number
}

export interface AdminProductLine {
  id: number
  name: string
  slug: string
  nutrition_json: string
  ingredients: string
  how_to_use: string
  who_is_for: string
  regulatory_info: string
  translations_json: string
  created_at: string
  updated_at: string
  lab_test_files: AdminLabTestFile[]
}

export interface CreateProductLinePayload {
  name: string
  slug: string
  nutrition_json: string
  ingredients: string
  how_to_use: string
  who_is_for: string
  regulatory_info: string
  translations_json: string
}

export interface UpdateProductLinePayload {
  name?: string
  slug?: string
  nutrition_json?: string
  ingredients?: string
  how_to_use?: string
  who_is_for?: string
  regulatory_info?: string
  translations_json?: string
}

export type AdminChatSenderType = 'customer' | 'admin' | 'system'
export type AdminChatStatus = 'open' | 'closed'

export interface AdminChatConversation {
  id: string
  visitor_id: string
  user_id: string | null
  guest_name: string | null
  guest_email: string | null
  status: AdminChatStatus
  last_message_at: string
  last_admin_read_at: string | null
  created_at: string
  message_count: number
  unread_count: number
}

export interface AdminChatMessage {
  id: number
  conversation_id: string
  sender_type: AdminChatSenderType
  sender_email: string | null
  body: string
  created_at: string
}

export interface AdminChatConversationDetail {
  id: string
  visitor_id: string
  user_id: string | null
  guest_name: string | null
  guest_email: string | null
  status: AdminChatStatus
  last_message_at: string
  last_admin_read_at: string | null
  last_customer_read_at: string | null
  created_at: string
  updated_at: string
  messages: AdminChatMessage[]
  unread_count: number
}

export interface AdminDiscountCode {
  id: number
  code: string
  type: 'fixed' | 'percent'
  value: number
  min_order_thb: number
  max_uses: number | null
  used_count: number
  active: boolean
  archived: boolean
  expires_at: string | null
  created_at: string
}

export interface CreateDiscountPayload {
  code: string
  type: 'fixed' | 'percent'
  value: number
  min_order_thb: number
  max_uses: number | null
  active: boolean
  expires_at: string | null
}

export interface UpdateDiscountPayload {
  code?: string
  type?: 'fixed' | 'percent'
  value?: number
  min_order_thb?: number
  max_uses?: number | null
  active?: boolean
  archived?: boolean
  expires_at?: string | null
}

export interface R2Orphan {
  key: string
  uploaded: string
  size: number
}

export interface R2CleanupSummary {
  scanned: number
  referenced_count: number
  orphan_count: number
  min_age_seconds: number
  truncated: boolean
}

export interface R2CleanupDryRunResult extends R2CleanupSummary {
  dry_run: true
  orphans: R2Orphan[]
}

export interface R2CleanupResult extends R2CleanupSummary {
  dry_run: false
  deleted: string[]
  errors: { key: string; error: string }[]
}

export interface IncomeReportProduct {
  product_name: string
  total_revenue: number
  total_quantity: number
}

export interface IncomeReport {
  year: number
  month: number
  total_revenue: number
  total_orders: number
  products: IncomeReportProduct[]
}

export interface AnalyticsMetricGroup {
  today: number
  week: number
  month: number
}

export interface VisitorAnalyticsMetricGroup {
  status: 'ok' | 'unconfigured' | 'error'
  today: number | null
  week: number | null
  month: number | null
}

export interface AnalyticsReport {
  visitors: VisitorAnalyticsMetricGroup
  orders: AnalyticsMetricGroup
}

export interface AdminReview {
  id: number
  user_id: string
  user_email: string
  product_line_id: number
  product_line_name: string
  rating: number
  body: string | null
  locale: 'en' | 'th'
  status: 'pending' | 'approved' | 'rejected'
  rejected_reason: string | null
  created_at: string
  moderated_at: string | null
  moderated_by: string | null
}

export interface AdminReviewsResponse {
  reviews: AdminReview[]
  pagination: { page: number; limit: number; total: number }
}

export type AdminReviewStatus = 'pending' | 'approved' | 'rejected'
