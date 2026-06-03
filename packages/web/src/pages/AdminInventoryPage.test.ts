import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AdminInventoryPage from './AdminInventoryPage.vue'
import { adjustInventory, fetchInventory, type AdminInventoryItem } from '../api/admin'

vi.mock('../api/admin', () => ({
  adjustInventory: vi.fn(),
  fetchInventory: vi.fn(),
  AdminApiErrorResponse: class AdminApiErrorResponse extends Error {},
}))

const inventoryItem: AdminInventoryItem = {
  product_id: 1,
  slug: 'plant-protein-500g',
  name: 'CNX Plant Protein 500g',
  price_thb: 89900,
  active: true,
  stock_count: 100,
  reserved_count: 4,
  available_count: 96,
}

function mountPage() {
  return mount(AdminInventoryPage, {
    global: {
      stubs: {
        AdminNav: { template: '<nav />' },
        RouterLink: { template: '<a><slot /></a>' },
      },
    },
  })
}

describe('AdminInventoryPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.mocked(fetchInventory).mockResolvedValue([inventoryItem])
    vi.mocked(adjustInventory).mockResolvedValue({
      product_id: 1,
      stock_count: 110,
      reserved_count: 4,
      available_count: 106,
    })
  })

  it('applies a numeric stock adjustment from the number input', async () => {
    const wrapper = mountPage()

    await flushPromises()
    await wrapper.find('input[type="number"]').setValue(10)
    await wrapper.find('button').trigger('click')
    await flushPromises()

    expect(adjustInventory).toHaveBeenCalledWith(1, {
      adjustment: 10,
      notes: undefined,
    })
    expect(wrapper.text()).toContain('Stock updated.')
  })
})
