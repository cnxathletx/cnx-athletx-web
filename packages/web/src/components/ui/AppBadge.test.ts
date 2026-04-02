import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AppBadge from './AppBadge.vue'

describe('AppBadge', () => {
  it('renders label text', () => {
    const wrapper = mount(AppBadge, { props: { label: '500g' } })
    expect(wrapper.text()).toBe('500g')
  })

  it('renders as a span element', () => {
    const wrapper = mount(AppBadge, { props: { label: 'test' } })
    expect(wrapper.element.tagName).toBe('SPAN')
  })

  it('applies badge styling classes', () => {
    const wrapper = mount(AppBadge, { props: { label: 'test' } })
    expect(wrapper.classes()).toContain('rounded-full')
    expect(wrapper.classes()).toContain('uppercase')
    expect(wrapper.classes()).toContain('text-xs')
  })
})
