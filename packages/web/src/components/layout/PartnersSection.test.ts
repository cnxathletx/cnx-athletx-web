import { afterEach, describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import PartnersSection from './PartnersSection.vue'
import i18n from '../../i18n'

function mountPartnersSection() {
  return mount(PartnersSection, {
    global: { plugins: [i18n] },
  })
}

describe('PartnersSection', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders partner logos and keeps empty slots as placeholders', () => {
    const wrapper = mountPartnersSection()
    const recoveryLogo = wrapper.get('img[alt="CNX Sports Recovery"]')
    const recoveryLink = wrapper.get('a[href="https://cnxsportsrecovery.com"]')
    const rxCafeLogo = wrapper.get('img[alt="Rx Cafe"]')
    const rxCafeLink = wrapper.get('a[href="https://www.rxcafechiangmai.com"]')

    expect(recoveryLogo.attributes('src')).toBe('/images/partners/cnx-sports-recovery.png')
    expect(recoveryLink.attributes('target')).toBe('_blank')
    expect(recoveryLink.attributes('rel')).toBe('noopener noreferrer')
    expect(rxCafeLogo.attributes('src')).toBe('/images/partners/rx-cafe.png')
    expect(rxCafeLink.attributes('target')).toBe('_blank')
    expect(rxCafeLink.attributes('rel')).toBe('noopener noreferrer')
    expect(wrapper.text()).toContain('Partner 3')
    expect(wrapper.text()).toContain('Partner 6')
    expect(wrapper.text()).not.toContain('Partner 2')
    expect(wrapper.text()).not.toContain('Partner 1')
  })

  it('randomizes the rendered partner tile order', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)

    const wrapper = mountPartnersSection()
    const tiles = wrapper.findAll('li')

    expect(tiles[0].find('img[alt="Rx Cafe"]').exists()).toBe(true)
    expect(tiles[5].find('img[alt="CNX Sports Recovery"]').exists()).toBe(true)
  })
})
