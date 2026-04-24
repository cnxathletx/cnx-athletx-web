import { test, expect, type Page } from '@playwright/test'
import { resetDb, addProductToCart, fillCheckoutForm } from './helpers'

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

async function placeOrderAsCustomer(page: Page): Promise<string> {
  await addProductToCart(page, 'plant-protein-500g')
  await page.goto('/checkout')
  await fillCheckoutForm(page)
  await page.getByRole('button', { name: /place order/i }).click()
  await page.waitForURL(/\/order\/.*\/payment/, { timeout: 10000 })
  const url = page.url()
  const match = url.match(/\/order\/([^/]+)\/payment/)
  if (!match) throw new Error(`Could not extract order id from ${url}`)
  return match[1]
}

test.beforeEach(async () => {
  await resetDb()
})

test.describe('Reviews', () => {
  test('full review lifecycle (submit, moderate, display, delete)', async ({ page }) => {
    const email = 'e2e-review@example.com'
    await loginCustomer(page, email)
    const orderId = await placeOrderAsCustomer(page)

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

    // 4. Admin approve
    await page.goto('/admin/reviews')
    await page.getByRole('button', { name: /^approve$/i }).first().click()

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
