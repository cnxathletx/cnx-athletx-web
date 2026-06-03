import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AdminIncomePage from './AdminIncomePage.vue'
import { fetchAdminIncomeReport, type IncomeReport } from '../api/admin'

vi.mock('../api/admin', () => ({
  fetchAdminIncomeReport: vi.fn(),
  AdminApiErrorResponse: class AdminApiErrorResponse extends Error {},
}))

const canvasContext = {
  arc: vi.fn(),
  beginPath: vi.fn(),
  closePath: vi.fn(),
  fill: vi.fn(),
  fillText: vi.fn(),
  moveTo: vi.fn(),
  scale: vi.fn(),
  stroke: vi.fn(),
}

function incomeReport(overrides: Partial<IncomeReport> = {}): IncomeReport {
  return {
    year: 2026,
    month: 5,
    total_revenue: 200000,
    total_orders: 4,
    products: [
      { product_name: 'Whey Protein', total_revenue: 200000, total_quantity: 2 },
    ],
    ...overrides,
  }
}

function mountPage() {
  return mount(AdminIncomePage, {
    global: {
      stubs: {
        AdminNav: { template: '<nav />' },
        RouterLink: { template: '<a><slot /></a>' },
        SecondaryButton: { template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>', props: ['disabled'] },
      },
    },
  })
}

describe('AdminIncomePage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.mocked(fetchAdminIncomeReport).mockResolvedValue(incomeReport())
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(canvasContext as unknown as CanvasRenderingContext2D)
  })

  it('renders the platform cut as 10 percent of total revenue', async () => {
    const wrapper = mountPage()

    await flushPromises()

    expect(wrapper.text()).toContain('Platform Cut')
    expect(wrapper.text()).toContain('฿200')
  })

  it('renders income report revenue in baht instead of raw satang', async () => {
    const wrapper = mountPage()

    await flushPromises()

    expect(wrapper.text()).toContain('฿2,000')
    expect(wrapper.text()).not.toContain('฿200,000')
  })
})
