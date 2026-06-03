import { describe, expect, it } from 'vitest'
import en from './en.json'
import th from './th.json'

describe('i18n messages', () => {
  it('escapes @ in waitlist email placeholders for vue-i18n linked-message parsing', () => {
    expect(en.product.waitlistEmailPlaceholder).toBe("you{'@'}example.com")
    expect(th.product.waitlistEmailPlaceholder).toBe("you{'@'}example.com")
  })
})
