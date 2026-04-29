import { test, expect } from '@playwright/test'
import { resetDb, addProductToCart, fillCheckoutForm } from './helpers'

const API_BASE = 'http://localhost:8787'

test.beforeEach(async () => {
  await resetDb()
})

/** Create an order via API and return its ID */
async function createOrderViaApi(): Promise<string> {
  const res = await fetch(`${API_BASE}/api/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      idempotency_key: `e2e-${Date.now()}-${Math.random()}`,
      items: [{ product_id: 1, quantity: 1 }],
      payment_method: 'promptpay',
      customer: {
        name: 'E2E User',
        email: 'e2e@example.com',
        phone: '+66812345678',
        address: {
          line1: '123 Test Street, Apt 4',
          district: 'Mueang',
          province: 'Chiang Mai',
          postal_code: '50200',
        },
      },
    }),
  })
  if (!res.ok) {
    throw new Error(`checkout failed: ${res.status} ${await res.text()}`)
  }
  const data = await res.json() as { order_id: string }
  return data.order_id
}

test.describe('Order status page', () => {
  test('displays order with pending_payment status', async ({ page }) => {
    const orderId = await createOrderViaApi()
    await page.goto(`/order/${orderId}`)

    await expect(page.getByText(orderId)).toBeVisible()
    await expect(page.getByText('Awaiting Payment', { exact: true })).toBeVisible()
  })

  test('displays order after payment confirmed', async ({ page }) => {
    const orderId = await createOrderViaApi()

    // Mark paid via admin API
    await fetch(`${API_BASE}/api/admin/orders/${orderId}/mark-paid`, {
      method: 'POST',
      headers: { 'X-Admin-Email': 'jdelaire@gmail.com' },
    })

    await page.goto(`/order/${orderId}`)
    await expect(page.locator('span').filter({ hasText: 'Payment Confirmed' })).toBeVisible()
  })

  test('displays shipping info after order shipped', async ({ page }) => {
    const orderId = await createOrderViaApi()

    // Advance order: paid → packed → shipped
    await fetch(`${API_BASE}/api/admin/orders/${orderId}/mark-paid`, {
      method: 'POST',
      headers: { 'X-Admin-Email': 'jdelaire@gmail.com' },
    })
    await fetch(`${API_BASE}/api/admin/orders/${orderId}/pack`, {
      method: 'POST',
      headers: { 'X-Admin-Email': 'jdelaire@gmail.com' },
    })
    await fetch(`${API_BASE}/api/admin/orders/${orderId}/ship`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Email': 'jdelaire@gmail.com',
      },
      body: JSON.stringify({ carrier: 'Kerry Express', tracking_number: 'KRY-E2E-001' }),
    })

    await page.goto(`/order/${orderId}`)
    await expect(page.getByText(/shipped/i).first()).toBeVisible()
    await expect(page.getByText('Kerry Express')).toBeVisible()
    await expect(page.getByText('KRY-E2E-001')).toBeVisible()
  })

  test('shows 404-like state for invalid order ID', async ({ page }) => {
    await page.goto('/order/INVALID_ORDER_ID_THAT_DOES_NOT_EXIST')
    // Should show error or not found message
    await expect(page.getByText(/not found|error|invalid/i).first()).toBeVisible({ timeout: 10000 })
  })
})

test.describe('Order lookup page', () => {
  test('order status lookup page loads', async ({ page }) => {
    await page.goto('/order/status')
    await expect(page).toHaveURL(/\/order\/status/)
  })
})
