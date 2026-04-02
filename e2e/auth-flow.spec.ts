import { test, expect } from '@playwright/test'
import { resetDb } from './helpers'

test.beforeEach(async () => {
  await resetDb()
})

test.describe('Login flow', () => {
  test('request magic link shows success message', async ({ page }) => {
    await page.goto('/login')
    await page.locator('input[placeholder="you@example.com"]').fill('test@example.com')
    await page.getByRole('button', { name: /send login link/i }).click()

    // Should show success message
    await expect(page.getByText(/check your email/i)).toBeVisible({ timeout: 10000 })
  })

  test('full magic link login flow (dev mode)', async ({ page }) => {
    await page.goto('/login')
    await page.locator('input[placeholder="you@example.com"]').fill('dev@example.com')
    await page.getByRole('button', { name: /send login link/i }).click()

    // In dev mode, a "Dev: Open Magic Link" link should appear
    const devLink = page.getByRole('link', { name: /dev.*magic link/i })
    await expect(devLink).toBeVisible({ timeout: 10000 })

    // Click the dev magic link to verify
    await devLink.click()

    // Should redirect to account page after verification
    await expect(page).toHaveURL(/\/account/, { timeout: 10000 })
    await expect(page.getByText('dev@example.com')).toBeVisible()
  })

  test('account page requires authentication', async ({ page }) => {
    await page.goto('/account')
    // Should redirect to login
    await expect(page).toHaveURL(/\/login/)
  })
})

test.describe('Authenticated user', () => {
  async function loginUser(page: import('@playwright/test').Page, email: string) {
    await page.goto('/login')
    await page.locator('input[placeholder="you@example.com"]').fill(email)
    await page.getByRole('button', { name: /send login link/i }).click()
    const devLink = page.getByRole('link', { name: /dev.*magic link/i })
    await expect(devLink).toBeVisible({ timeout: 10000 })
    await devLink.click()
    await expect(page).toHaveURL(/\/account/, { timeout: 10000 })
  }

  test('can view account page after login', async ({ page }) => {
    await loginUser(page, 'account@example.com')

    await expect(page.getByText('account@example.com')).toBeVisible()
  })

  test('can logout', async ({ page }) => {
    await loginUser(page, 'logout@example.com')

    // Click logout button
    await page.getByRole('button', { name: /log\s?out/i }).first().click()

    // After logout, app should redirect away from account (e.g., to home or login)
    await page.waitForURL((url) => !url.pathname.includes('/account'), { timeout: 10000 })

    // Navigating to /account in a fresh context should require login
    const newPage = await page.context().newPage()
    await newPage.goto('/account')
    await expect(newPage).toHaveURL(/\/login/, { timeout: 10000 })
    await newPage.close()
  })
})
