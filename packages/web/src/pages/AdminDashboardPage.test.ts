import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { createRouter, createWebHistory } from 'vue-router'
import AdminDashboardPage from './AdminDashboardPage.vue'

async function mountPage() {
  const router = createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/admin', component: AdminDashboardPage },
      { path: '/admin/waitlist', component: { template: '<div />' } },
      { path: '/', component: { template: '<div />' } },
    ],
  })
  router.push('/admin')
  await router.isReady()
  return mount(AdminDashboardPage, {
    global: { plugins: [router] },
  })
}

describe('AdminDashboardPage', () => {
  it('links to the waitlist admin page', async () => {
    const wrapper = await mountPage()

    const link = wrapper.get('a[href="/admin/waitlist"]')
    expect(link.text()).toContain('Waitlist')
    expect(link.text()).toContain('back-in-stock requests')
  })
})
