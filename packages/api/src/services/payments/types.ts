import type {
  Env,
  ProviderId,
  PaymentIntent,
  WebhookResult,
  CheckoutOrderForIntent,
  SiteSettingsMap,
} from '../../lib/types'

export interface InstructionsBlockRow {
  label: string
  value: string
  mono?: boolean
}

export interface InstructionsBlock {
  title: string
  rows: InstructionsBlockRow[]
  qrImageUrl?: string
  ctaUrl?: string
  ctaLabel?: string
  footnote?: string
}

export interface PaymentProvider {
  id: ProviderId
  displayName: { en: string; th: string }
  requiredSettingKeys: readonly string[]
  isEnabled(settings: SiteSettingsMap): boolean
  createIntent(args: {
    order: CheckoutOrderForIntent
    settings: SiteSettingsMap
    env: Env
  }): Promise<PaymentIntent>
  renderInstructions(args: {
    order: CheckoutOrderForIntent
    settings: SiteSettingsMap
  }): InstructionsBlock | null
  verifyWebhook?(req: Request, env: Env): Promise<WebhookResult>
}
