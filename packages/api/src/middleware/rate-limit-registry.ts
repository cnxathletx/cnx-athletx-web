import type { Env, SiteSettingsMap } from '../lib/types'
import { loadSettingsMap } from '../services/settings'
import { enforceGlobalLimit, enforceLimit, type LimitResult } from './rate-limit'

export type RateLimitPolicyId = 'checkout' | 'magic_link' | 'chat_create' | 'waitlist_signup'

export interface RateLimitBucket {
  max: number
  windowSec: number
}

export interface RateLimitPolicy {
  scope: string
  perIp: RateLimitBucket
  global: RateLimitBucket
}

export const RATE_LIMITS: Record<RateLimitPolicyId, RateLimitPolicy> = {
  checkout: {
    scope: 'checkout',
    perIp: { max: 30, windowSec: 60 * 60 },
    global: { max: 1000, windowSec: 60 * 60 },
  },
  magic_link: {
    scope: 'magic_link',
    perIp: { max: 20, windowSec: 15 * 60 },
    global: { max: 500, windowSec: 15 * 60 },
  },
  chat_create: {
    scope: 'chat_create',
    perIp: { max: 10, windowSec: 24 * 60 * 60 },
    global: { max: 500, windowSec: 24 * 60 * 60 },
  },
  waitlist_signup: {
    scope: 'waitlist_signup',
    perIp: { max: 20, windowSec: 60 * 60 },
    global: { max: 1000, windowSec: 60 * 60 },
  },
}

function positiveIntOverride(settings: SiteSettingsMap | undefined, key: string, fallback: number): number {
  if (!settings) return fallback
  const value = settings[key]
  if (value === undefined) return fallback
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

export function getRateLimitPolicy(id: RateLimitPolicyId, settings?: SiteSettingsMap): RateLimitPolicy {
  const base = RATE_LIMITS[id]
  return {
    scope: base.scope,
    perIp: {
      max: positiveIntOverride(settings, `rate_limit_${id}_per_ip_max`, base.perIp.max),
      windowSec: positiveIntOverride(settings, `rate_limit_${id}_per_ip_window_sec`, base.perIp.windowSec),
    },
    global: {
      max: positiveIntOverride(settings, `rate_limit_${id}_global_max`, base.global.max),
      windowSec: positiveIntOverride(settings, `rate_limit_${id}_global_window_sec`, base.global.windowSec),
    },
  }
}

async function loadOptionalSettings(env: Env, settings?: SiteSettingsMap): Promise<SiteSettingsMap | undefined> {
  if (settings) return settings
  try {
    return await loadSettingsMap(env)
  } catch {
    return undefined
  }
}

export async function enforcePolicyLimit(
  env: Env,
  id: RateLimitPolicyId,
  key: string,
  settings?: SiteSettingsMap,
): Promise<LimitResult> {
  const policy = getRateLimitPolicy(id, await loadOptionalSettings(env, settings))
  return enforceLimit(env, {
    scope: policy.scope,
    key,
    max: policy.perIp.max,
    windowSec: policy.perIp.windowSec,
  })
}

export async function enforcePolicyGlobalLimit(
  env: Env,
  id: RateLimitPolicyId,
  settings?: SiteSettingsMap,
): Promise<LimitResult> {
  const policy = getRateLimitPolicy(id, await loadOptionalSettings(env, settings))
  return enforceGlobalLimit(env, policy.scope, policy.global.max, policy.global.windowSec)
}
