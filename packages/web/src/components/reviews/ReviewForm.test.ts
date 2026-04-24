import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import i18n from '../../i18n'

vi.mock('../../api/reviews', () => ({
  submitReview: vi.fn(async () => ({ id: 1, productLineId: 1, productLineName: 'X', rating: 5, body: 'Hi', locale: 'en', status: 'pending', rejectedReason: null, createdAt: '', moderatedAt: null })),
  ReviewApiError: class extends Error { status = 0 },
}))

import ReviewForm from './ReviewForm.vue'
import { submitReview } from '../../api/reviews'

describe('ReviewForm', () => {
  it('updates rating when star clicked', async () => {
    const wrapper = mount(ReviewForm, { props: { productLineId: 1 }, global: { plugins: [i18n] } })
    await wrapper.findAll('button[data-testid^="star-"]')[3].trigger('click')
    expect(wrapper.find('[data-testid="rating-value"]').text()).toBe('4')
  })

  it('shows char count and caps at 1000', async () => {
    const wrapper = mount(ReviewForm, { props: { productLineId: 1 }, global: { plugins: [i18n] } })
    const ta = wrapper.find('textarea')
    await ta.setValue('hello world')
    expect(wrapper.text()).toContain('11 / 1000')
  })

  it('calls submitReview on submit', async () => {
    const wrapper = mount(ReviewForm, { props: { productLineId: 7 }, global: { plugins: [i18n] } })
    await wrapper.findAll('button[data-testid^="star-"]')[4].trigger('click')
    await wrapper.find('textarea').setValue('Great')
    await wrapper.find('form').trigger('submit.prevent')
    await flushPromises()
    expect(submitReview).toHaveBeenCalledWith({ productLineId: 7, rating: 5, body: 'Great', locale: 'en' })
  })
})
