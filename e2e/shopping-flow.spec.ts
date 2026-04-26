import { test, expect } from '@playwright/test'
import { resetDb, addProductToCart, fillCheckoutForm } from './helpers'

test.beforeEach(async () => {
  await resetDb()
})

test.describe('Product browsing', () => {
  test('homepage loads and has shop link', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/CNX/)
    await expect(page.getByRole('link', { name: /shop/i }).first()).toBeVisible()
  })

  test('shop page lists products', async ({ page }) => {
    await page.goto('/shop')
    // Seed has 2 active products
    await expect(page.getByText('CNX Plant Protein 500g')).toBeVisible()
    await expect(page.getByText('CNX Plant Protein 1kg')).toBeVisible()
  })

  test('product detail page shows info and add to cart', async ({ page }) => {
    await page.goto('/product/plant-protein-500g')
    await expect(page.getByRole('heading', { name: /Plant Protein 500g/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /add to cart/i }).first()).toBeVisible()
  })
})

test.describe('Cart', () => {
  test('adding product shows cart with item', async ({ page }) => {
    await addProductToCart(page, 'plant-protein-500g')
    await page.goto('/cart')
    await expect(page.getByText('CNX Plant Protein 500g')).toBeVisible()
    await expect(page.getByRole('link', { name: /proceed to checkout/i })).toBeVisible()
  })

  test('empty cart shows message', async ({ page }) => {
    await page.goto('/cart')
    await expect(page.getByText(/your cart is empty/i)).toBeVisible()
  })

  test('can remove item from cart', async ({ page }) => {
    await addProductToCart(page, 'plant-protein-500g')
    await page.goto('/cart')
    await page.getByLabel(/remove item/i).click()
    await expect(page.getByText(/your cart is empty/i)).toBeVisible()
  })
})

test.describe('Guest checkout flow', () => {
  test('complete checkout via PromptPay', async ({ page }) => {
    // 1. Add product to cart
    await addProductToCart(page, 'plant-protein-500g')

    // 2. Go to cart and proceed to checkout
    await page.goto('/cart')
    await page.getByRole('link', { name: /proceed to checkout/i }).click()
    await expect(page).toHaveURL(/\/checkout/)

    // 3. Fill in checkout form
    await fillCheckoutForm(page)

    // 4. Pick PromptPay (default first option, but make explicit)
    await page.getByRole('radio', { name: /promptpay/i }).check()

    // 5. Submit order
    await page.getByRole('button', { name: /place order/i }).click()

    // 6. Should redirect to payment page
    await expect(page).toHaveURL(/\/order\/.*\/payment/, { timeout: 10000 })

    // 7. Payment page shows PromptPay number
    await expect(page.getByText(/0812345678/)).toBeVisible()
  })

  test('complete checkout via bank transfer', async ({ page }) => {
    await addProductToCart(page, 'plant-protein-500g')
    await page.goto('/checkout')
    await fillCheckoutForm(page)
    await page.getByRole('radio', { name: /bank transfer/i }).check()
    await page.getByRole('button', { name: /place order/i }).click()

    await expect(page).toHaveURL(/\/order\/.*\/payment/, { timeout: 10000 })
    await expect(page.getByText('123-4-56789-0')).toBeVisible()
    await expect(page.getByText('Kasikorn Bank')).toBeVisible()
  })

  test('checkout with discount code', async ({ page }) => {
    await addProductToCart(page, 'plant-protein-500g')
    await page.goto('/checkout')
    await fillCheckoutForm(page, { discount_code: 'SAVE100' })
    await page.getByRole('button', { name: /place order/i }).click()

    // Should succeed and redirect to payment
    await expect(page).toHaveURL(/\/order\/.*\/payment/, { timeout: 10000 })
  })
})
