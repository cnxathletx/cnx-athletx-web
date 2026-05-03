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

  it('renders the CNX Sports Recovery partner logo and keeps empty slots as placeholders', () => {
    const wrapper = mountPartnersSection()
    const logo = wrapper.get('img[alt="CNX Sports Recovery"]')
    const link = wrapper.get('a[href="https://cnxsportsrecovery.com"]')

    expect(logo.attributes('src')).toBe('/images/partners/cnx-sports-recovery.png')
    expect(link.attributes('target')).toBe('_blank')
    expect(link.attributes('rel')).toBe('noopener noreferrer')
    expect(wrapper.text()).toContain('Partner 2')
    expect(wrapper.text()).toContain('Partner 6')
    expect(wrapper.text()).not.toContain('Partner 1')
  })

  it('randomizes the rendered partner tile order', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)

    const wrapper = mountPartnersSection()
    const tiles = wrapper.findAll('li')

    expect(tiles[0].text()).toContain('Partner 2')
    expect(tiles[5].find('img[alt="CNX Sports Recovery"]').exists()).toBe(true)
  })
})
