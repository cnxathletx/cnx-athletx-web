import type { RouterType } from 'itty-router'
import { registerAdminOrderRoutes } from './admin/orders'
import { registerAdminInventoryRoutes } from './admin/inventory'
import { registerAdminProductRoutes } from './admin/products'
import { registerAdminDiscountRoutes } from './admin/discounts'
import { registerAdminProductLineRoutes } from './admin/product-lines'
import { registerAdminSettingsRoutes } from './admin/settings'
import { registerAdminReportRoutes } from './admin/reports'

export function registerAdminRoutes(router: RouterType) {
  registerAdminOrderRoutes(router)
  registerAdminInventoryRoutes(router)
  registerAdminProductRoutes(router)
  registerAdminProductLineRoutes(router)
  registerAdminDiscountRoutes(router)
  registerAdminSettingsRoutes(router)
  registerAdminReportRoutes(router)
}
