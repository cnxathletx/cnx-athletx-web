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

export interface LoyaltyEntry {
  id: number
  order_id: string | null
  points_delta: number
  kind: 'earn' | 'redeem' | 'restore' | 'reverse_earn' | 'manual_adjustment'
  reason: string
  created_at: string
}

export interface LoyaltySummary {
  balance_points: number
  point_value_satang: number
  earn_rate_label: string
  max_redemption_percent: number
  entries: LoyaltyEntry[]
}
