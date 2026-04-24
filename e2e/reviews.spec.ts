import { test, expect, type Page } from '@playwright/test'
import { resetDb } from './helpers'

const API_BASE = 'http://localhost:8787'
const ADMIN_HEADER = { 'X-Admin-Email': 'jdelaire@gmail.com' }

async function adminPost(path: string, body?: unknown): Promise<void> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { ...ADMIN_HEADER, 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`${path} failed: ${res.status} — ${text}`)
  }
}

async function loginCustomer(page: Page, email: string): Promise<void> {
  await page.goto('/login')
  await page.locator('input[placeholder="you@example.com"]').fill(email)
  await page.getByRole('button', { name: /send login link/i }).click()
  const devLink = page.getByRole('link', { name: /dev.*magic link/i })
  await expect(devLink).toBeVisible({ timeout: 10000 })
  await devLink.click()
  await expect(page).toHaveURL(/\/account/, { timeout: 10000 })
}

async function placeOrderViaApi(page: Page, email: string): Promise<string> {
  const res = await page.request.post(`${API_BASE}/api/checkout`, {
    data: {
      idempotency_key: `e2e-${Date.now()}-${Math.random()}`,
      items: [{ product_id: 1, quantity: 1 }],
      customer: {
        name: 'E2E Reviewer',
        email,
        phone: '+66812345678',
        address: {
          line1: '123 Test Street',
          district: 'Mueang',
          province: 'Chiang Mai',
          postal_code: '50200',
        },
      },
    },
  })
  if (!res.ok()) throw new Error(`checkout failed: ${res.status()} ${await res.text()}`)
  const json = (await res.json()) as { order_id?: string }
  if (!json.order_id) throw new Error(`checkout response missing order_id: ${JSON.stringify(json)}`)
  return json.order_id
}

test.beforeEach(async ({ page }) => {
  await resetDb()
  // Public reviews endpoint sets max-age=60; bypass HTTP cache so post-approve
  // navigation sees the updated response within the test.
  await page.setExtraHTTPHeaders({ 'Cache-Control': 'no-cache' })
})

test.describe('Reviews', () => {
  test('full review lifecycle (submit, moderate, display, delete)', async ({ page }) => {
    const email = 'e2e-review@example.com'
    await loginCustomer(page, email)
    const orderId = await placeOrderViaApi(page, email)

    await adminPost(`/api/admin/orders/${orderId}/mark-paid`)
    await adminPost(`/api/admin/orders/${orderId}/pack`)
    await adminPost(`/api/admin/orders/${orderId}/ship`, { carrier: 'Kerry', tracking_number: 'TRKE2E' })

    // 1. Customer sees reviewable item
    await page.goto('/account')
    await expect(page.getByRole('button', { name: /write a review/i }).first()).toBeVisible({ timeout: 10000 })
    await page.getByRole('button', { name: /write a review/i }).first().click()

    // 2. Submit
    await page.locator('[data-testid="star-5"]').click()
    await page.locator('textarea').fill('E2E review body')
    await page.getByRole('button', { name: /submit review/i }).click()
    await expect(page.getByText(/Pending/i).first()).toBeVisible({ timeout: 10000 })

    // 3. Public product page does not show review yet
    await page.goto('/product/plant-protein-500g')
    await expect(page.getByText(/no reviews yet/i)).toBeVisible()

    // 4. Admin approve via API (browser admin UI requires Cloudflare Access in dev)
    const listRes = await page.request.get(`${API_BASE}/api/admin/reviews?status=pending`, { headers: ADMIN_HEADER })
    if (!listRes.ok()) throw new Error(`admin list failed: ${listRes.status()}`)
    const listJson = (await listRes.json()) as { reviews: { id: number }[] }
    const reviewId = listJson.reviews[0]?.id
    if (!reviewId) throw new Error('no pending review found')
    await adminPost(`/api/admin/reviews/${reviewId}/approve`)

    // 5. Public page now shows the review
    await page.goto('/product/plant-protein-500g')
    await expect(page.getByText(/verified buyer/i).first()).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('E2E review body')).toBeVisible()

    // 6. Customer deletes — reverts public state
    await page.goto('/account')
    page.on('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: '×' }).first().click()
    await page.goto('/product/plant-protein-500g')
    await expect(page.getByText(/no reviews yet/i)).toBeVisible({ timeout: 10000 })
  })
})
