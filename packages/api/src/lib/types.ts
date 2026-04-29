import type { OrderStatus, WebhookOrderOutcome } from './orderStatus'

export interface Env {
  DB: D1Database
  PRODUCT_IMAGES: R2Bucket
  RESEND_API_KEY?: string
  ALLOWED_ORIGINS?: string
  ADMIN_EMAILS?: string
  CF_ACCESS_TEAM?: string
  CF_ACCESS_AUD?: string
  ENVIRONMENT?: string
  PUBLIC_IMAGES_BASE_URL?: string
}

export interface SessionUser {
  id: string
  email: string
  name: string | null
  phone: string | null
}

export interface AdminUser {
  email: string
}

export interface ValidationError {
  field: string
  message: string
}

// --- Auth row types ---

export interface SessionRow {
  user_id: string
  email: string
  name: string | null
  phone: string | null
}

export interface UserRow {
  id: string
  email: string
  name: string | null
  phone: string | null
}

export interface MagicLinkRow {
  id: number
  email: string
}

export interface CountRow {
  count: number
}

export interface RequestLinkBody {
  email: string
}

export interface VerifyLinkBody {
  token: string
}

export interface UpdateProfileBody {
  name?: string
  phone?: string
}

// --- Account row types ---

export interface AccountOrderRow {
  id: string
  status: OrderStatus
  total_thb: number
  created_at: string
  items_count: number
  carrier: string | null
  tracking_number: string | null
}

export interface LastAddressRow {
  shipping_address_line1: string
  shipping_address_line2: string | null
  district: string
  province: string
  postal_code: string
}

// --- Checkout types ---

export interface CheckoutItem {
  product_id: number
  quantity: number
}

export interface CheckoutAddress {
  line1: string
  line2?: string
  district: string
  province: string
  postal_code: string
}

export interface CheckoutCustomer {
  name: string
  email: string
  phone: string
  address: CheckoutAddress
}

export interface CheckoutBody {
  items: CheckoutItem[]
  customer: CheckoutCustomer
  idempotency_key: string
  discount_code?: string
  payment_method: ProviderId
  locale?: 'en' | 'th'
}

export interface ProductRow {
  id: number
  name: string
  price_thb: number
  stock_count: number
  reserved_count: number
}

export interface SiteSettings {
  shipping_flat_rate: number
  shipping_free_threshold: number
}

export interface DiscountCodeRow {
  id: number
  code: string
  type: 'fixed' | 'percent'
  value: number
  min_order_thb: number
  max_uses: number | null
  used_count: number
  active: number
  expires_at: string | null
}

export interface ExistingOrderRow {
  id: string
  subtotal_thb: number
  shipping_thb: number
  discount_thb: number
  total_thb: number
}

export interface PaymentProofBody {
  proof_value: string
}

export interface OrderStatusOnlyRow {
  status: OrderStatus
}

// --- Order detail types ---

export interface OrderRow {
  id: string
  status: OrderStatus
  subtotal_thb: number
  shipping_thb: number
  discount_thb: number
  total_thb: number
  created_at: string
  locale: 'en' | 'th'
}

export interface OrderItemRow {
  product_name: string
  quantity: number
  line_total_thb: number
}

export interface ShipmentRow {
  carrier: string
  tracking_number: string
  shipped_at: string
}

export interface PaymentProofRow {
  proof_type: 'reference' | 'image_url'
  proof_value: string
  submitted_at: string
}

// --- Admin types ---

export interface AdminOrderDetailRow {
  id: string
  status: OrderStatus
  customer_name: string
  customer_email: string
  customer_phone: string
  shipping_address_line1: string
  shipping_address_line2: string | null
  district: string
  province: string
  postal_code: string
  subtotal_thb: number
  shipping_thb: number
  discount_thb: number
  total_thb: number
  payment_method: string | null
  locale: 'en' | 'th'
  created_at: string
  updated_at: string
}

export interface AdminPaymentProofRow extends PaymentProofRow {
  id: number
}

export interface AdminOrderListRow {
  id: string
  status: OrderStatus
  customer_name: string
  total_thb: number
  created_at: string
  items_count: number
}

export interface AdminOrderListCountRow {
  total: number
}

export interface AdminOrderItemForStockRow {
  product_id: number
  quantity: number
}

export interface AdminShipmentBody {
  carrier: string
  tracking_number: string
}

export interface AdminInventoryRow {
  product_id: number
  slug: string
  name: string
  price_thb: number
  active: number
  stock_count: number
  reserved_count: number
  available_count: number
}

export interface AdminInventoryUpdateBody {
  adjustment: number
  notes?: string
}

export interface AdminInventorySingleRow {
  stock_count: number
  reserved_count: number
}

export interface AdminAuditLogRow {
  id: number
  admin_email: string
  action: string
  details_json: string | null
  created_at: string
}

export interface AdminProductRow {
  id: number
  product_line_id: number | null
  slug: string
  name: string
  description: string
  price_thb: number
  weight_g: number
  image_url: string
  active: number
  archived: number
  translations_json: string
  created_at: string
  updated_at: string
  stock_count: number
  reserved_count: number
  available_count: number
}

export interface ProductImageRow {
  id: number
  product_id: number
  url: string
  sort_order: number
  created_at: string
}

export interface PriceTierRow {
  id: number
  product_id: number
  min_quantity: number
  unit_price_thb: number
}

export interface AdminPriceTierRow extends PriceTierRow {
  created_at: string
  updated_at: string
}

export interface AdminUpsertPriceTierBody {
  min_quantity: number
  unit_price_thb: number
}

export interface AdminAddProductImageBody {
  url: string
}

export interface AdminReorderProductImagesBody {
  image_ids: number[]
}

export interface AdminCreateProductBody {
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

export interface AdminUpdateProductBody {
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

// --- Admin Product Line types ---

export interface ProductLineRow {
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
}

export interface AdminCreateProductLineBody {
  name: string
  slug: string
  nutrition_json: string
  ingredients: string
  how_to_use: string
  who_is_for: string
  regulatory_info: string
  translations_json: string
}

export interface AdminUpdateProductLineBody {
  name?: string
  slug?: string
  nutrition_json?: string
  ingredients?: string
  how_to_use?: string
  who_is_for?: string
  regulatory_info?: string
  translations_json?: string
}

// --- Lab test file types ---

export type LabTestContentType =
  | 'application/pdf'
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp'

export interface LabTestFileRow {
  id: number
  product_line_id: number
  url: string
  r2_key: string
  content_type: LabTestContentType
  label: string
  sort_order: number
  size_bytes: number
  created_at: string
}

export interface AdminAddLabTestFileBody {
  url: string
  r2_key: string
  content_type: LabTestContentType
  size_bytes: number
  label?: string
}

export interface AdminUpdateLabTestFileBody {
  label: string
}

export interface AdminReorderLabTestFilesBody {
  file_ids: number[]
}

// --- Admin Discount Code types ---

export interface AdminDiscountCodeRow {
  id: number
  code: string
  type: 'fixed' | 'percent'
  value: number
  min_order_thb: number
  max_uses: number | null
  used_count: number
  active: number
  archived: number
  expires_at: string | null
  created_at: string
}

export interface AdminCreateDiscountBody {
  code: string
  type: 'fixed' | 'percent'
  value: number
  min_order_thb: number
  max_uses: number | null
  active: boolean
  expires_at: string | null
}

export interface AdminUpdateDiscountBody {
  code?: string
  type?: 'fixed' | 'percent'
  value?: number
  min_order_thb?: number
  max_uses?: number | null
  active?: boolean
  archived?: boolean
  expires_at?: string | null
}

// --- Chat types ---

export type ChatSenderType = 'customer' | 'admin' | 'system'
export type ChatConversationStatus = 'open' | 'closed'

export interface ChatConversationRow {
  id: string
  visitor_id: string
  user_id: string | null
  guest_name: string | null
  guest_email: string | null
  status: ChatConversationStatus
  last_message_at: string
  last_admin_read_at: string | null
  last_customer_read_at: string | null
  created_at: string
  updated_at: string
}

export interface ChatMessageRow {
  id: number
  conversation_id: string
  sender_type: ChatSenderType
  sender_email: string | null
  body: string
  created_at: string
}

export interface CreateChatConversationBody {
  visitor_id: string
  guest_name?: string
  guest_email?: string
  initial_message: string
}

export interface PostChatMessageBody {
  body: string
}

export interface ChatConversationPublicView {
  id: string
  status: ChatConversationStatus
  guest_name: string | null
  guest_email: string | null
  last_message_at: string
  unread_count: number
  messages: ChatMessagePublicView[]
}

export interface ChatMessagePublicView {
  id: number
  sender_type: ChatSenderType
  body: string
  created_at: string
}

export interface AdminChatConversationListRow {
  id: string
  visitor_id: string
  user_id: string | null
  guest_name: string | null
  guest_email: string | null
  status: ChatConversationStatus
  last_message_at: string
  last_admin_read_at: string | null
  created_at: string
  message_count: number
  unread_count: number
}

export interface AdminChatConversationDetail extends ChatConversationRow {
  messages: ChatMessageRow[]
  unread_count: number
}

export interface AdminUpdateChatStatusBody {
  status: ChatConversationStatus
}

// --- Review row types ---

export interface ReviewRow {
  id: number
  user_id: string
  product_line_id: number
  rating: number
  body: string | null
  locale: 'en' | 'th'
  status: 'pending' | 'approved' | 'rejected'
  rejected_reason: string | null
  created_at: string
  updated_at: string
  moderated_at: string | null
  moderated_by: string | null
}

export interface PublicReviewRow {
  id: number
  rating: number
  body: string | null
  locale: 'en' | 'th'
  created_at: string
}

export interface ReviewSummaryRow {
  avg_rating: number | null
  count: number
}

export interface ReviewDistributionRow {
  rating: number
  count: number
}

export interface ReviewableProductRow {
  product_line_id: number
  slug: string
  name: string
  order_id: string
  shipped_at: string
}

export interface AdminReviewListRow {
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

export interface SubmitReviewBody {
  productLineId: number
  rating: number
  body?: string
  locale: 'en' | 'th'
}

export interface RejectReviewBody {
  reason?: string
}

// --- Payment provider types ---

export type ProviderId = 'promptpay' | 'bank_transfer' | '2c2p' | 'nowpayments'

export type SiteSettingsMap = Record<string, string>

export type PaymentIntent =
  | { kind: 'instructions'; provider: ProviderId; instructions: Record<string, unknown> }
  | { kind: 'redirect'; provider: ProviderId; url: string; expires_at?: string }
  | { kind: 'sdk'; provider: ProviderId; client_token: string; provider_data: unknown }

export type WebhookOutcome = WebhookOrderOutcome

export type WebhookResult =
  | { ok: true; order_id: string; provider_txn_id: string; status: WebhookOutcome; raw: unknown }
  | { ok: false; reason: string }

export interface CheckoutOrderForIntent {
  id: string
  total_thb: number
  customer_email: string
}
