import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import i18n from '../../i18n'
import ReviewList from './ReviewList.vue'

const baseReview = (over: Partial<{ id: number; rating: number; body: string | null; locale: 'en' | 'th'; createdAt: string }> = {}) => ({
  id: 1, rating: 5, body: 'Great', locale: 'en' as const, createdAt: '2026-04-20T00:00:00Z',
  ...over,
})

describe('ReviewList', () => {
  it('renders verified buyer label per review', () => {
    const wrapper = mount(ReviewList, { props: { reviews: [baseReview()], page: 1, pageSize: 10, total: 1 }, global: { plugins: [i18n] } })
    expect(wrapper.text()).toContain('Verified buyer')
  })

  it('shows locale flag', () => {
    const wrapper = mount(ReviewList, { props: { reviews: [baseReview({ locale: 'th' })], page: 1, pageSize: 10, total: 1 }, global: { plugins: [i18n] } })
    expect(wrapper.html()).toContain('🇹🇭')
  })

  it('renders pagination next button when more pages', () => {
    const reviews = Array.from({ length: 10 }, (_, i) => baseReview({ id: i + 1 }))
    const wrapper = mount(ReviewList, { props: { reviews, page: 1, pageSize: 10, total: 25 }, global: { plugins: [i18n] } })
    const nextBtn = wrapper.find('button[data-testid="next-page"]')
    expect(nextBtn.exists()).toBe(true)
    expect((nextBtn.element as HTMLButtonElement).disabled).toBe(false)
  })
})
