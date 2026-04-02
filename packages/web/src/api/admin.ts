import { apiUrl } from './client'

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

export interface AdminProduct {
  id: number
  slug: string
  name: string
  description: string
  price_thb: number
  weight_g: number
  image_url: string
  active: boolean
  created_at: string
  updated_at: string
  stock_count: number
  reserved_count: number
  available_count: number
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
}

export interface UpdateAdminProductPayload {
  slug?: string
  name?: string
  description?: string
  price_thb?: number
  weight_g?: number
  image_url?: string
  active?: boolean
}

interface AdminApiError {
  error: string
  details?: { field: string; message: string }[]
  current_status?: string
}

export class AdminApiErrorResponse extends Error {
  status: number
  details?: { field: string; message: string }[]
  currentStatus?: string

  constructor(
    message: string,
    status: number,
    details?: { field: string; message: string }[],
    currentStatus?: string
  ) {
    super(message)
    this.status = status
    this.details = details
    this.currentStatus = currentStatus
  }
}

async function parseAdminError(res: Response): Promise<never> {
  let payload: AdminApiError = { error: 'Request failed' }
  try {
    payload = (await res.json()) as AdminApiError
  } catch {
    // ignore JSON parse error
  }
  throw new AdminApiErrorResponse(payload.error || 'Request failed', res.status, payload.details, payload.current_status)
}

export async function fetchAdminOrders(params?: {
  status?: string
  q?: string
  page?: number
  limit?: number
}): Promise<{ orders: AdminOrderListItem[]; pagination: { page: number; limit: number; total: number } }> {
  const search = new URLSearchParams()
  if (params?.status) search.set('status', params.status)
  if (params?.q) search.set('q', params.q)
  if (params?.page) search.set('page', String(params.page))
  if (params?.limit) search.set('limit', String(params.limit))

  const res = await fetch(apiUrl(`/api/admin/orders${search.toString() ? `?${search.toString()}` : ''}`), {
    credentials: 'include',
  })

  if (!res.ok) {
    await parseAdminError(res)
  }

  return (await res.json()) as { orders: AdminOrderListItem[]; pagination: { page: number; limit: number; total: number } }
}

export async function fetchAdminOrder(orderId: string): Promise<AdminOrderDetail> {
  const res = await fetch(apiUrl(`/api/admin/orders/${encodeURIComponent(orderId)}`), {
    credentials: 'include',
  })

  if (!res.ok) {
    await parseAdminError(res)
  }

  const data = (await res.json()) as { order: AdminOrderDetail }
  return data.order
}

export async function markOrderPaid(orderId: string): Promise<void> {
  const res = await fetch(apiUrl(`/api/admin/orders/${encodeURIComponent(orderId)}/mark-paid`), {
    method: 'POST',
    credentials: 'include',
  })
  if (!res.ok) await parseAdminError(res)
}

export async function packOrder(orderId: string): Promise<void> {
  const res = await fetch(apiUrl(`/api/admin/orders/${encodeURIComponent(orderId)}/pack`), {
    method: 'POST',
    credentials: 'include',
  })
  if (!res.ok) await parseAdminError(res)
}

export async function shipOrder(orderId: string, payload: { carrier: string; tracking_number: string }): Promise<void> {
  const res = await fetch(apiUrl(`/api/admin/orders/${encodeURIComponent(orderId)}/ship`), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) await parseAdminError(res)
}

export async function cancelOrder(orderId: string): Promise<void> {
  const res = await fetch(apiUrl(`/api/admin/orders/${encodeURIComponent(orderId)}/cancel`), {
    method: 'POST',
    credentials: 'include',
  })
  if (!res.ok) await parseAdminError(res)
}

export async function fetchInventory(): Promise<AdminInventoryItem[]> {
  const res = await fetch(apiUrl('/api/admin/inventory'), {
    credentials: 'include',
  })
  if (!res.ok) await parseAdminError(res)
  const data = (await res.json()) as { inventory: AdminInventoryItem[] }
  return data.inventory
}

export async function adjustInventory(
  productId: number,
  payload: { adjustment: number; notes?: string }
): Promise<{ product_id: number; stock_count: number; reserved_count: number; available_count: number }> {
  const res = await fetch(apiUrl(`/api/admin/inventory/${productId}`), {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) await parseAdminError(res)
  const data = (await res.json()) as {
    success: true
    inventory: { product_id: number; stock_count: number; reserved_count: number; available_count: number }
  }
  return data.inventory
}

export async function fetchAdminProducts(): Promise<AdminProduct[]> {
  const res = await fetch(apiUrl('/api/admin/products'), {
    credentials: 'include',
  })
  if (!res.ok) await parseAdminError(res)
  const data = (await res.json()) as { products: AdminProduct[] }
  return data.products
}

export async function createAdminProduct(payload: CreateAdminProductPayload): Promise<AdminProduct> {
  const res = await fetch(apiUrl('/api/admin/products'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) await parseAdminError(res)
  const data = (await res.json()) as { success: true; product: AdminProduct }
  return data.product
}

export async function updateAdminProduct(productId: number, payload: UpdateAdminProductPayload): Promise<AdminProduct> {
  const res = await fetch(apiUrl(`/api/admin/products/${productId}`), {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) await parseAdminError(res)
  const data = (await res.json()) as { success: true; product: AdminProduct }
  return data.product
}

// --- Admin Discount Codes ---

export interface AdminDiscountCode {
  id: number
  code: string
  type: 'fixed' | 'percent'
  value: number
  min_order_thb: number
  max_uses: number | null
  used_count: number
  active: boolean
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
  expires_at?: string | null
}

export async function fetchAdminDiscountCodes(): Promise<AdminDiscountCode[]> {
  const res = await fetch(apiUrl('/api/admin/discount-codes'), { credentials: 'include' })
  if (!res.ok) await parseAdminError(res)
  const data = (await res.json()) as { discount_codes: AdminDiscountCode[] }
  return data.discount_codes
}

export async function createAdminDiscountCode(payload: CreateDiscountPayload): Promise<AdminDiscountCode> {
  const res = await fetch(apiUrl('/api/admin/discount-codes'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) await parseAdminError(res)
  const data = (await res.json()) as { success: true; discount_code: AdminDiscountCode }
  return data.discount_code
}

export async function updateAdminDiscountCode(id: number, payload: UpdateDiscountPayload): Promise<AdminDiscountCode> {
  const res = await fetch(apiUrl(`/api/admin/discount-codes/${id}`), {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) await parseAdminError(res)
  const data = (await res.json()) as { success: true; discount_code: AdminDiscountCode }
  return data.discount_code
}
