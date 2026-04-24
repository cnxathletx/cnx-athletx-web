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

/** Fill in checkout form. Province/district/subdistrict are dropdowns sourced from
 *  packages/web/src/data/th-address.json — values must match real Thai address rows. */
export async function fillCheckoutForm(page: Page, overrides: Partial<{
  name: string
  email: string
  phone: string
  line1: string
  province: string
  district: string
  subdistrict: string
  discount_code: string
}> = {}) {
  const name = overrides.name ?? 'Test User'
  const email = overrides.email ?? 'e2e@example.com'
  const phone = overrides.phone ?? '812345678'
  const line1 = overrides.line1 ?? '123 Test Street, Apt 4'
  const province = overrides.province ?? 'Chiang Mai'
  const district = overrides.district ?? 'Mueang Chiang Mai'
  const subdistrict = overrides.subdistrict ?? 'Si Phum'

  await page.locator('input[placeholder="Somchai Rattana"]').fill(name)
  const emailInput = page.locator('input[placeholder="you@example.com"]')
  if (await emailInput.isEnabled()) {
    await emailInput.fill(email)
  }
  await page.locator('input[type="tel"]').fill(phone)
  await page.locator('input[placeholder="123 Nimmanhaemin Road"]').fill(line1)

  // Selects in order: phone country code (0), province (1), district (2), subdistrict (3)
  await page.locator('select').nth(1).selectOption({ label: province })
  await page.locator('select').nth(2).selectOption({ label: district })
  await page.locator('select').nth(3).selectOption({ label: subdistrict })

  if (overrides.discount_code) {
    await page.locator('input[placeholder="SAVE10"]').fill(overrides.discount_code)
  }
}
