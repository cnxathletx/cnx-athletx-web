import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { startWorker, stopWorker, resetDb, workerFetch, loginAs, checkoutBody } from '../test/helpers'

beforeAll(async () => { await startWorker() })
afterAll(async () => { await stopWorker() })
beforeEach(async () => { await resetDb() })

describe('Authenticated checkout', () => {
  it('creates order with user_id when logged in', async () => {
    const email = 'buyer@example.com'
    const cookie = await loginAs(email)

    const res = await workerFetch('/api/checkout', {
      cookie,
      body: checkoutBody({
        customer: {
          name: 'Buyer Name',
          email,
          phone: '+66899999999',
          address: { line1: '123 Auth Street, Apt 4', district: 'Mueang', province: 'Chiang Mai', postal_code: '50200' },
        },
      }),
    })
    expect(res.status).toBe(201)

    const data = await res.json() as { order_id: string }

    // Verify order is linked to user via account orders
    const ordersRes = await workerFetch('/api/account/orders', { cookie })
    const ordersData = await ordersRes.json() as { orders: Array<{ id: string }> }
    expect(ordersData.orders.some((o) => o.id === data.order_id)).toBe(true)
  })

  it('rejects checkout when email does not match logged-in user', async () => {
    const cookie = await loginAs('real@example.com')

    const res = await workerFetch('/api/checkout', {
      cookie,
      body: checkoutBody({
        customer: {
          name: 'Mismatch',
          email: 'different@example.com',
          phone: '+66811111111',
          address: { line1: '456 Mismatch Road, Suite 1', district: 'Mueang', province: 'Chiang Mai', postal_code: '50200' },
        },
      }),
    })
    expect(res.status).toBe(400)

    const data = await res.json() as { details: Array<{ field: string; message: string }> }
    expect(data.details[0].field).toBe('customer.email')
    expect(data.details[0].message).toContain('match')
  })

  it('updates user profile (name, phone) on checkout', async () => {
    const email = 'profile-update@example.com'
    const cookie = await loginAs(email)

    await workerFetch('/api/checkout', {
      cookie,
      body: checkoutBody({
        customer: {
          name: 'New Checkout Name',
          email,
          phone: '+66877777777',
          address: { line1: '789 Profile Update Blvd, Unit 3', district: 'San Sai', province: 'Chiang Mai', postal_code: '50210' },
        },
      }),
    })

    // Verify profile was updated
    const meRes = await workerFetch('/api/auth/me', { cookie })
    const meData = await meRes.json() as { user: { name: string; phone: string } }
    expect(meData.user.name).toBe('New Checkout Name')
    expect(meData.user.phone).toBe('+66877777777')
  })

  it('authenticated user can submit payment proof on their order', async () => {
    const email = 'proof@example.com'
    const cookie = await loginAs(email)

    const checkoutRes = await workerFetch('/api/checkout', {
      cookie,
      body: checkoutBody({
        customer: {
          name: 'Proof User',
          email,
          phone: '+66866666666',
          address: { line1: '321 Proof Lane, Building A', district: 'Mueang', province: 'Chiang Mai', postal_code: '50200' },
        },
      }),
    })
    const { order_id } = await checkoutRes.json() as { order_id: string }

    const proofRes = await workerFetch(`/api/orders/${order_id}/payment-proof`, {
      body: { proof_value: 'REF-AUTH-001' },
    })
    expect(proofRes.status).toBe(201)

    // Verify via order detail
    const orderRes = await workerFetch(`/api/orders/${order_id}`)
    const orderData = await orderRes.json() as { order: { payment_submitted: boolean; latest_payment_proof: { proof_value: string } } }
    expect(orderData.order.payment_submitted).toBe(true)
    expect(orderData.order.latest_payment_proof.proof_value).toBe('REF-AUTH-001')
  })

  it('guest orders are linked to user after first login', async () => {
    const email = 'latejoin@example.com'

    // Place order as guest
    const guestRes = await workerFetch('/api/checkout', {
      body: checkoutBody({
        customer: {
          name: 'Late Joiner',
          email,
          phone: '+66855555555',
          address: { line1: '555 Guest Road, Floor 2', district: 'Mueang', province: 'Chiang Mai', postal_code: '50200' },
        },
      }),
    })
    const { order_id } = await guestRes.json() as { order_id: string }

    // Login for the first time
    const cookie = await loginAs(email)

    // Guest order should now be linked
    const ordersRes = await workerFetch('/api/account/orders', { cookie })
    const ordersData = await ordersRes.json() as { orders: Array<{ id: string }> }
    expect(ordersData.orders.some((o) => o.id === order_id)).toBe(true)
  })

  it('authenticated checkout with discount code', async () => {
    const email = 'discount-auth@example.com'
    const cookie = await loginAs(email)

    const res = await workerFetch('/api/checkout', {
      cookie,
      body: checkoutBody({
        discount_code: 'PERCENT20',
        customer: {
          name: 'Discount Auth',
          email,
          phone: '+66844444444',
          address: { line1: '444 Discount Drive, Apt 10', district: 'Hang Dong', province: 'Chiang Mai', postal_code: '50230' },
        },
      }),
    })
    expect(res.status).toBe(201)

    const data = await res.json() as { discount_thb: number; subtotal_thb: number }
    expect(data.discount_thb).toBe(Math.floor(data.subtotal_thb * 20 / 100))
  })
})
