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

  it('renders six linked partner logos when there are overflow partners', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)

    const wrapper = mountPartnersSection()
    const rxCafeLogo = wrapper.get('img[alt="Rx Cafe"]')
    const rxCafeLink = wrapper.get('a[href="https://www.rxcafechiangmai.com"]')
    const bikeZoneLogo = wrapper.get('img[alt="Bike Zone"]')
    const bikeZoneLink = wrapper.get('a[href="https://www.facebook.com/bikezonecm/"]')
    const padelCnxLogo = wrapper.get('img[alt="PADEL.CNX"]')
    const padelCnxLink = wrapper.get('a[href="https://www.instagram.com/padel.cnx"]')
    const greenAthleteLogo = wrapper.get('img[alt="The Green Athlete in Chiang Mai"]')
    const greenAthleteLink = wrapper.get('a[href="https://www.instagram.com/thegreenathletecnx"]')
    const trainingBoxLogo = wrapper.get('img[alt="Training Box Chiang Mai"]')
    const trainingBoxLink = wrapper.get('a[href="https://www.instagram.com/trainingboxchiangmai"]')
    const crossFitLogo = wrapper.get('img[alt="CrossFit Chiang Mai"]')
    const crossFitLink = wrapper.get('a[href="https://www.cfcnxfitness.com"]')

    expect(wrapper.findAll('li')).toHaveLength(6)
    expect(rxCafeLogo.attributes('src')).toBe('/images/partners/rx-cafe.png')
    expect(rxCafeLink.attributes('target')).toBe('_blank')
    expect(rxCafeLink.attributes('rel')).toBe('noopener noreferrer')
    expect(bikeZoneLogo.attributes('src')).toBe('/images/partners/bike-zone.png')
    expect(bikeZoneLink.attributes('target')).toBe('_blank')
    expect(bikeZoneLink.attributes('rel')).toBe('noopener noreferrer')
    expect(padelCnxLogo.attributes('src')).toBe('/images/partners/padel-cnx.png')
    expect(padelCnxLink.attributes('target')).toBe('_blank')
    expect(padelCnxLink.attributes('rel')).toBe('noopener noreferrer')
    expect(greenAthleteLogo.attributes('src')).toBe('/images/partners/the-green-athlete-chiang-mai.png')
    expect(greenAthleteLink.attributes('target')).toBe('_blank')
    expect(greenAthleteLink.attributes('rel')).toBe('noopener noreferrer')
    expect(trainingBoxLogo.attributes('src')).toBe('/images/partners/training-box-chiang-mai.png')
    expect(trainingBoxLink.attributes('target')).toBe('_blank')
    expect(trainingBoxLink.attributes('rel')).toBe('noopener noreferrer')
    expect(crossFitLogo.attributes('src')).toBe('/images/partners/crossfit-chiang-mai.png')
    expect(crossFitLink.attributes('target')).toBe('_blank')
    expect(crossFitLink.attributes('rel')).toBe('noopener noreferrer')
    expect(wrapper.text()).not.toContain('Partner 1')
    expect(wrapper.text()).not.toContain('Partner 2')
    expect(wrapper.text()).not.toContain('Partner 3')
    expect(wrapper.text()).not.toContain('Partner 4')
    expect(wrapper.text()).not.toContain('Partner 5')
    expect(wrapper.text()).not.toContain('Partner 6')
  })

  it('randomizes the rendered partner tile order', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)

    const wrapper = mountPartnersSection()
    const tiles = wrapper.findAll('li')

    expect(tiles[0].find('img[alt="Rx Cafe"]').exists()).toBe(true)
    expect(tiles[5].find('img[alt="CrossFit Chiang Mai"]').exists()).toBe(true)
  })
})
