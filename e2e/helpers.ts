import { type Page } from '@playwright/test'

const API_BASE = 'http://localhost:8787'

/** Reset the D1 database to clean schema + seed data */
export async function resetDb() {
  const res = await fetch(`${API_BASE}/api/__test-reset`, { method: 'POST' })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`DB reset failed: ${res.status} — ${body}`)
  }
}

/** Add item(s) to cart via the product detail page */
export async function addProductToCart(page: Page, slug: string, quantity = 1) {
  await page.goto(`/product/${slug}`)
  // Set quantity if > 1
  for (let i = 1; i < quantity; i++) {
    await page.getByRole('button', { name: '+' }).click()
  }
  await page.getByRole('button', { name: /add to cart/i }).first().click()
}

/** Fill in checkout form and submit */
export async function fillCheckoutForm(page: Page, overrides: Partial<{
  name: string
  email: string
  phone: string
  line1: string
  district: string
  province: string
  postal_code: string
  discount_code: string
}> = {}) {
  const name = overrides.name ?? 'Test User'
  const email = overrides.email ?? 'e2e@example.com'
  const phone = overrides.phone ?? '812345678'
  const line1 = overrides.line1 ?? '123 Test Street, Apt 4'
  const district = overrides.district ?? 'Mueang'
  const province = overrides.province ?? 'Chiang Mai'
  const postal_code = overrides.postal_code ?? '50200'

  await page.locator('input[placeholder="Somchai Rattana"]').fill(name)
  // Email may be disabled if logged in
  const emailInput = page.locator('input[placeholder="you@example.com"]')
  if (await emailInput.isEnabled()) {
    await emailInput.fill(email)
  }
  await page.locator('input[type="tel"]').fill(phone)
  await page.locator('input[placeholder="123 Nimmanhaemin Road"]').fill(line1)
  await page.locator('input[placeholder="Suthep"]').fill(district)
  await page.locator('input[placeholder="Chiang Mai"]').fill(province)
  await page.locator('input[placeholder="50200"]').fill(postal_code)

  if (overrides.discount_code) {
    await page.locator('input[placeholder="SAVE10"]').fill(overrides.discount_code)
  }
}
