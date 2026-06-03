import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRouter, createWebHistory } from 'vue-router'
import AdminWaitlistPage from './AdminWaitlistPage.vue'
import { fetchAdminWaitlist } from '../api/admin'

vi.mock('../api/admin', async () => {
  const actual = await vi.importActual<typeof import('../api/admin')>('../api/admin')
  return {
    ...actual,
    fetchAdminWaitlist: vi.fn(),
  }
})

async function mountPage() {
  const router = createRouter({
    history: createWebHistory(),
    routes: [{ path: '/admin/waitlist', component: AdminWaitlistPage }],
  })
  router.push('/admin/waitlist')
  await router.isReady()
  const wrapper = mount(AdminWaitlistPage, {
    global: { plugins: [router], stubs: { AdminNav: true } },
  })
  await flushPromises()
  return wrapper
}

describe('AdminWaitlistPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.mocked(fetchAdminWaitlist).mockResolvedValue([
      {
        id: 1,
        product_id: 1,
        product_slug: 'plant-protein-500g',
        product_name: 'CNX Plant Protein 500g',
        email: 'buyer@example.com',
        locale: 'en',
        marketing_consent: true,
        notified_at: null,
        created_at: '2026-06-03T00:00:00.000Z',
        updated_at: '2026-06-03T00:00:00.000Z',
      },
    ])
  })

  it('loads active waitlist rows by default', async () => {
    const wrapper = await mountPage()
    expect(fetchAdminWaitlist).toHaveBeenCalledWith('active')
    expect(wrapper.text()).toContain('buyer@example.com')
    expect(wrapper.text()).toContain('CNX Plant Protein 500g')
  })

  it('switches to notified filter', async () => {
    const wrapper = await mountPage()
    await wrapper.get('button[data-status="notified"]').trigger('click')
    await flushPromises()
    expect(fetchAdminWaitlist).toHaveBeenLastCalledWith('notified')
  })
})
