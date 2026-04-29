export interface AuthUser {
  id: string
  email: string
  name: string | null
  phone: string | null
}

export interface AccountOrder {
  id: string
  status: string
  total_thb: number
  items_count: number
  created_at: string
  shipment: { carrier: string; tracking_number: string } | null
}

export interface SavedAddress {
  line1: string
  line2: string | null
  subdistrict: string
  district: string
  province: string
  postal_code: string
}
