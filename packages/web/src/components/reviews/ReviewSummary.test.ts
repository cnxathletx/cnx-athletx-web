import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import i18n from '../../i18n'
import ReviewSummary from './ReviewSummary.vue'

describe('ReviewSummary', () => {
  it('renders empty state when count is 0', () => {
    const wrapper = mount(ReviewSummary, {
      props: { summary: { avgRating: null, count: 0, distribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 } } },
      global: { plugins: [i18n] },
    })
    expect(wrapper.text()).toContain('No reviews yet')
  })

  it('renders average and count', () => {
    const wrapper = mount(ReviewSummary, {
      props: { summary: { avgRating: 4.6, count: 18, distribution: { '1': 0, '2': 1, '3': 2, '4': 5, '5': 10 } } },
      global: { plugins: [i18n] },
    })
    expect(wrapper.text()).toContain('4.6')
    expect(wrapper.text()).toContain('18')
  })
})
