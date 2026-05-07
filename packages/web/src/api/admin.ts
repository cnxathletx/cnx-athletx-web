import { ApiClientError, apiFetch, type ApiErrorDetails, type ApiErrorPayload } from './client'
import type {
  AdminChatConversation,
  AdminChatConversationDetail,
  AdminChatStatus,
  AdminDiscountCode,
  AdminInventoryItem,
  AdminLabTestContentType,
  AdminLabTestFile,
  AdminOrderDetail,
  AdminOrderListItem,
  AnalyticsReport,
  AdminPriceTier,
  AdminProduct,
  AdminProductLine,
  AdminProductScreenshot,
  CreateAdminProductPayload,
  CreateDiscountPayload,
  CreateProductLinePayload,
  IncomeReport,
  R2CleanupDryRunResult,
  R2CleanupResult,
  UpdateAdminProductPayload,
  UpdateDiscountPayload,
  UpdateProductLinePayload,
  UpsertPriceTierPayload,
} from '../types/admin'

export type {
  AdminAuditLog,
  AdminChatConversation,
  AdminChatConversationDetail,
  AdminChatMessage,
  AdminChatSenderType,
  AdminChatStatus,
  AdminDiscountCode,
  AdminInventoryItem,
  AdminLabTestContentType,
  AdminLabTestFile,
  AdminOrderDetail,
  AdminOrderItem,
  AdminOrderListItem,
  AdminPaymentProof,
  AdminPriceTier,
  AdminProduct,
  AdminProductLine,
  AdminProductScreenshot,
  AnalyticsMetricGroup,
  AnalyticsReport,
  CreateAdminProductPayload,
  CreateDiscountPayload,
  CreateProductLinePayload,
  IncomeReport,
  IncomeReportProduct,
  R2CleanupDryRunResult,
  R2CleanupResult,
  R2CleanupSummary,
  R2Orphan,
  UpdateAdminProductPayload,
  UpdateDiscountPayload,
  UpdateProductLinePayload,
  UpsertPriceTierPayload,
  VisitorAnalyticsMetricGroup,
} from '../types/admin'

export class AdminApiErrorResponse extends ApiClientError {
  constructor(
    message: string,
    status: number,
    details?: ApiErrorDetails[],
    currentStatus?: string,
  ) {
    super(message, status, details, currentStatus)
    this.name = 'AdminApiErrorResponse'
  }
}

function adminError(payload: ApiErrorPayload, response: Response): AdminApiErrorResponse {
  return new AdminApiErrorResponse(
    payload.error || 'Request failed',
    response.status,
    payload.details,
    typeof payload.current_status === 'string' ? payload.current_status : undefined,
  )
}

export async function fetchAdminPriceTiers(productId: number): Promise<AdminPriceTier[]> {
  const data = await apiFetch<{ price_tiers: AdminPriceTier[] }>(`/api/admin/products/${productId}/price-tiers`, {
    parseError: adminError,
  })
  return data.price_tiers
}

export async function createAdminPriceTier(productId: number, payload: UpsertPriceTierPayload): Promise<AdminPriceTier> {
  const data = await apiFetch<{ success: true; price_tier: AdminPriceTier }>(
    `/api/admin/products/${productId}/price-tiers`,
    { method: 'POST', body: payload, parseError: adminError },
  )
  return data.price_tier
}

export async function updateAdminPriceTier(
  productId: number,
  tierId: number,
  payload: UpsertPriceTierPayload,
): Promise<AdminPriceTier> {
  const data = await apiFetch<{ success: true; price_tier: AdminPriceTier }>(
    `/api/admin/products/${productId}/price-tiers/${tierId}`,
    { method: 'PATCH', body: payload, parseError: adminError },
  )
  return data.price_tier
}

export async function deleteAdminPriceTier(productId: number, tierId: number): Promise<void> {
  await apiFetch<void>(`/api/admin/products/${productId}/price-tiers/${tierId}`, {
    method: 'DELETE',
    parseError: adminError,
  })
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

  return apiFetch(`/api/admin/orders${search.toString() ? `?${search.toString()}` : ''}`, {
    parseError: adminError,
  })
}

export async function fetchAdminOrder(orderId: string): Promise<AdminOrderDetail> {
  const data = await apiFetch<{ order: AdminOrderDetail }>(`/api/admin/orders/${encodeURIComponent(orderId)}`, {
    parseError: adminError,
  })
  return data.order
}

export async function markOrderPaid(orderId: string): Promise<void> {
  await apiFetch<void>(`/api/admin/orders/${encodeURIComponent(orderId)}/mark-paid`, {
    method: 'POST',
    parseError: adminError,
  })
}

export async function fetchAdminChatConversations(params?: {
  status?: AdminChatStatus
  q?: string
  page?: number
  limit?: number
}): Promise<{
  conversations: AdminChatConversation[]
  pagination: { page: number; limit: number; total: number }
}> {
  const search = new URLSearchParams()
  if (params?.status) search.set('status', params.status)
  if (params?.q) search.set('q', params.q)
  if (params?.page) search.set('page', String(params.page))
  if (params?.limit) search.set('limit', String(params.limit))

  return apiFetch(`/api/admin/chat/conversations${search.toString() ? `?${search.toString()}` : ''}`, {
    parseError: adminError,
  })
}

export async function fetchAdminChatConversation(id: string): Promise<AdminChatConversationDetail> {
  const data = await apiFetch<{ conversation: AdminChatConversationDetail }>(
    `/api/admin/chat/conversations/${encodeURIComponent(id)}`,
    { parseError: adminError },
  )
  return data.conversation
}

export async function postAdminChatMessage(id: string, body: string): Promise<void> {
  await apiFetch<void>(`/api/admin/chat/conversations/${encodeURIComponent(id)}/messages`, {
    method: 'POST',
    body: { body },
    parseError: adminError,
  })
}

export async function markAdminChatRead(id: string): Promise<void> {
  await apiFetch<void>(`/api/admin/chat/conversations/${encodeURIComponent(id)}/read`, {
    method: 'POST',
    parseError: adminError,
  })
}

export async function updateAdminChatStatus(id: string, status: AdminChatStatus): Promise<void> {
  await apiFetch<void>(`/api/admin/chat/conversations/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: { status },
    parseError: adminError,
  })
}

export async function fetchAdminChatUnreadCount(): Promise<number> {
  const data = await apiFetch<{ unread_count: number }>('/api/admin/chat/unread-count', {
    parseError: adminError,
  })
  return data.unread_count
}

export async function packOrder(orderId: string): Promise<void> {
  await apiFetch<void>(`/api/admin/orders/${encodeURIComponent(orderId)}/pack`, {
    method: 'POST',
    parseError: adminError,
  })
}

export async function shipOrder(orderId: string, payload: { carrier: string; tracking_number: string }): Promise<void> {
  await apiFetch<void>(`/api/admin/orders/${encodeURIComponent(orderId)}/ship`, {
    method: 'POST',
    body: payload,
    parseError: adminError,
  })
}

export async function cancelOrder(orderId: string): Promise<void> {
  await apiFetch<void>(`/api/admin/orders/${encodeURIComponent(orderId)}/cancel`, {
    method: 'POST',
    parseError: adminError,
  })
}

export async function fetchInventory(): Promise<AdminInventoryItem[]> {
  const data = await apiFetch<{ inventory: AdminInventoryItem[] }>('/api/admin/inventory', {
    parseError: adminError,
  })
  return data.inventory
}

export async function adjustInventory(
  productId: number,
  payload: { adjustment: number; notes?: string },
): Promise<{ product_id: number; stock_count: number; reserved_count: number; available_count: number }> {
  const data = await apiFetch<{
    success: true
    inventory: { product_id: number; stock_count: number; reserved_count: number; available_count: number }
  }>(`/api/admin/inventory/${productId}`, {
    method: 'PATCH',
    body: payload,
    parseError: adminError,
  })
  return data.inventory
}

export async function fetchAdminProducts(): Promise<AdminProduct[]> {
  const data = await apiFetch<{ products: AdminProduct[] }>('/api/admin/products', {
    parseError: adminError,
  })
  return data.products
}

export async function createAdminProduct(payload: CreateAdminProductPayload): Promise<AdminProduct> {
  const data = await apiFetch<{ success: true; product: AdminProduct }>('/api/admin/products', {
    method: 'POST',
    body: payload,
    parseError: adminError,
  })
  return data.product
}

export async function updateAdminProduct(productId: number, payload: UpdateAdminProductPayload): Promise<AdminProduct> {
  const data = await apiFetch<{ success: true; product: AdminProduct }>(`/api/admin/products/${productId}`, {
    method: 'PATCH',
    body: payload,
    parseError: adminError,
  })
  return data.product
}

export async function addAdminProductImage(productId: number, url: string): Promise<AdminProductScreenshot[]> {
  const data = await apiFetch<{ success: true; screenshots: AdminProductScreenshot[] }>(
    `/api/admin/products/${productId}/images`,
    { method: 'POST', body: { url }, parseError: adminError },
  )
  return data.screenshots
}

export async function deleteAdminProductImage(productId: number, imageId: number): Promise<AdminProductScreenshot[]> {
  const data = await apiFetch<{ success: true; screenshots: AdminProductScreenshot[] }>(
    `/api/admin/products/${productId}/images/${imageId}`,
    { method: 'DELETE', parseError: adminError },
  )
  return data.screenshots
}

export async function uploadAdminProductImage(file: File): Promise<{ url: string; key: string }> {
  return apiFetch('/api/admin/upload/product-image', {
    method: 'POST',
    headers: { 'Content-Type': file.type },
    body: file,
    parseError: adminError,
  })
}

export async function reorderAdminProductImages(productId: number, imageIds: number[]): Promise<AdminProductScreenshot[]> {
  const data = await apiFetch<{ success: true; screenshots: AdminProductScreenshot[] }>(
    `/api/admin/products/${productId}/images/reorder`,
    { method: 'PATCH', body: { image_ids: imageIds }, parseError: adminError },
  )
  return data.screenshots
}

export async function fetchAdminDiscountCodes(options: { includeArchived?: boolean } = {}): Promise<AdminDiscountCode[]> {
  const path = options.includeArchived
    ? '/api/admin/discount-codes?include_archived=1'
    : '/api/admin/discount-codes'
  const data = await apiFetch<{ discount_codes: AdminDiscountCode[] }>(path, { parseError: adminError })
  return data.discount_codes
}

export async function createAdminDiscountCode(payload: CreateDiscountPayload): Promise<AdminDiscountCode> {
  const data = await apiFetch<{ success: true; discount_code: AdminDiscountCode }>('/api/admin/discount-codes', {
    method: 'POST',
    body: payload,
    parseError: adminError,
  })
  return data.discount_code
}

export async function updateAdminDiscountCode(id: number, payload: UpdateDiscountPayload): Promise<AdminDiscountCode> {
  const data = await apiFetch<{ success: true; discount_code: AdminDiscountCode }>(`/api/admin/discount-codes/${id}`, {
    method: 'PATCH',
    body: payload,
    parseError: adminError,
  })
  return data.discount_code
}

export async function fetchAdminProductLines(): Promise<AdminProductLine[]> {
  const data = await apiFetch<{ product_lines: AdminProductLine[] }>('/api/admin/product-lines', {
    parseError: adminError,
  })
  return data.product_lines
}

export async function createAdminProductLine(payload: CreateProductLinePayload): Promise<AdminProductLine> {
  const data = await apiFetch<{ success: true; product_line: AdminProductLine }>('/api/admin/product-lines', {
    method: 'POST',
    body: payload,
    parseError: adminError,
  })
  return data.product_line
}

export async function updateAdminProductLine(id: number, payload: UpdateProductLinePayload): Promise<AdminProductLine> {
  const data = await apiFetch<{ success: true; product_line: AdminProductLine }>(`/api/admin/product-lines/${id}`, {
    method: 'PATCH',
    body: payload,
    parseError: adminError,
  })
  return data.product_line
}

export async function uploadAdminLabTestFile(file: File): Promise<{
  url: string
  key: string
  content_type: AdminLabTestContentType
  size_bytes: number
}> {
  return apiFetch('/api/admin/upload/lab-test-file', {
    method: 'POST',
    headers: { 'Content-Type': file.type },
    body: file,
    parseError: adminError,
  })
}

export async function addAdminLabTestFile(
  productLineId: number,
  payload: { url: string; r2_key: string; content_type: AdminLabTestContentType; size_bytes: number; label?: string },
): Promise<AdminLabTestFile[]> {
  const data = await apiFetch<{ success: true; lab_test_files: AdminLabTestFile[] }>(
    `/api/admin/product-lines/${productLineId}/lab-test-files`,
    { method: 'POST', body: payload, parseError: adminError },
  )
  return data.lab_test_files
}

export async function updateAdminLabTestFile(
  productLineId: number,
  fileId: number,
  label: string,
): Promise<AdminLabTestFile[]> {
  const data = await apiFetch<{ success: true; lab_test_files: AdminLabTestFile[] }>(
    `/api/admin/product-lines/${productLineId}/lab-test-files/${fileId}`,
    { method: 'PATCH', body: { label }, parseError: adminError },
  )
  return data.lab_test_files
}

export async function deleteAdminLabTestFile(productLineId: number, fileId: number): Promise<AdminLabTestFile[]> {
  const data = await apiFetch<{ success: true; lab_test_files: AdminLabTestFile[] }>(
    `/api/admin/product-lines/${productLineId}/lab-test-files/${fileId}`,
    { method: 'DELETE', parseError: adminError },
  )
  return data.lab_test_files
}

export async function reorderAdminLabTestFiles(productLineId: number, fileIds: number[]): Promise<AdminLabTestFile[]> {
  const data = await apiFetch<{ success: true; lab_test_files: AdminLabTestFile[] }>(
    `/api/admin/product-lines/${productLineId}/lab-test-files/reorder`,
    { method: 'PATCH', body: { file_ids: fileIds }, parseError: adminError },
  )
  return data.lab_test_files
}

export async function previewR2Orphans(minAgeSeconds?: number): Promise<R2CleanupDryRunResult> {
  const params = new URLSearchParams({ dry_run: '1' })
  if (typeof minAgeSeconds === 'number') params.set('min_age_seconds', String(minAgeSeconds))
  return apiFetch(`/api/admin/cleanup/r2-orphans?${params.toString()}`, {
    method: 'POST',
    parseError: adminError,
  })
}

export async function deleteR2Orphans(minAgeSeconds?: number): Promise<R2CleanupResult> {
  const params = new URLSearchParams()
  if (typeof minAgeSeconds === 'number') params.set('min_age_seconds', String(minAgeSeconds))
  const qs = params.toString()
  return apiFetch(`/api/admin/cleanup/r2-orphans${qs ? `?${qs}` : ''}`, {
    method: 'POST',
    parseError: adminError,
  })
}

export async function fetchAdminIncomeReport(year: number, month: number): Promise<IncomeReport> {
  return apiFetch(`/api/admin/reports/income?year=${year}&month=${month}`, {
    parseError: adminError,
  })
}

export async function fetchAdminAnalyticsReport(): Promise<AnalyticsReport> {
  return apiFetch('/api/admin/reports/analytics', {
    parseError: adminError,
  })
}

export async function fetchAdminSettings(): Promise<Record<string, string>> {
  const data = await apiFetch<{ settings: Record<string, string> }>('/api/admin/settings', {
    parseError: adminError,
  })
  return data.settings
}

export async function updateAdminSettings(settings: Record<string, string>): Promise<Record<string, string>> {
  const data = await apiFetch<{ success: true; settings: Record<string, string> }>('/api/admin/settings', {
    method: 'PATCH',
    body: { settings },
    parseError: adminError,
  })
  return data.settings
}
