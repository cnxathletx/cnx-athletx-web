import type {
  Env,
  ProviderId,
  PaymentIntent,
  WebhookResult,
  CheckoutOrderForIntent,
  SiteSettingsMap,
} from '../../lib/types'

export interface PaymentProvider {
  id: ProviderId
  displayName: { en: string; th: string }
  isEnabled(settings: SiteSettingsMap): boolean
  createIntent(args: {
    order: CheckoutOrderForIntent
    settings: SiteSettingsMap
    env: Env
  }): Promise<PaymentIntent>
  verifyWebhook?(req: Request, env: Env): Promise<WebhookResult>
}
