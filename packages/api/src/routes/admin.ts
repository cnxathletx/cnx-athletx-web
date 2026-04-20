import type { RouterType } from 'itty-router'
import { registerAdminOrderRoutes } from './admin/orders'
import { registerAdminInventoryRoutes } from './admin/inventory'
import { registerAdminProductRoutes } from './admin/products'
import { registerAdminPriceTierRoutes } from './admin/price-tiers'
import { registerAdminDiscountRoutes } from './admin/discounts'
import { registerAdminProductLineRoutes } from './admin/product-lines'
import { registerAdminSettingsRoutes } from './admin/settings'
import { registerAdminReportRoutes } from './admin/reports'
import { registerAdminChatRoutes } from './admin/chat'
import { registerAdminUploadRoutes } from './admin/uploads'

export function registerAdminRoutes(router: RouterType) {
  registerAdminOrderRoutes(router)
  registerAdminInventoryRoutes(router)
  registerAdminProductRoutes(router)
  registerAdminPriceTierRoutes(router)
  registerAdminProductLineRoutes(router)
  registerAdminDiscountRoutes(router)
  registerAdminSettingsRoutes(router)
  registerAdminReportRoutes(router)
  registerAdminChatRoutes(router)
  registerAdminUploadRoutes(router)
}
