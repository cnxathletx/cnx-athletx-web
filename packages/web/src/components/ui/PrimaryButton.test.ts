import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PrimaryButton from './PrimaryButton.vue'

describe('PrimaryButton', () => {
  it('renders slot content', () => {
    const wrapper = mount(PrimaryButton, { slots: { default: 'Click Me' } })
    expect(wrapper.text()).toBe('Click Me')
  })

  it('applies default size classes (md)', () => {
    const wrapper = mount(PrimaryButton)
    expect(wrapper.classes()).toContain('px-6')
    expect(wrapper.classes()).toContain('py-3')
    expect(wrapper.classes()).toContain('text-base')
  })

  it('applies sm size classes', () => {
    const wrapper = mount(PrimaryButton, { props: { size: 'sm' } })
    expect(wrapper.classes()).toContain('px-4')
    expect(wrapper.classes()).toContain('py-2')
    expect(wrapper.classes()).toContain('text-sm')
  })

  it('applies lg size classes', () => {
    const wrapper = mount(PrimaryButton, { props: { size: 'lg' } })
    expect(wrapper.classes()).toContain('px-8')
    expect(wrapper.classes()).toContain('py-4')
    expect(wrapper.classes()).toContain('text-lg')
  })

  it('applies full width class', () => {
    const wrapper = mount(PrimaryButton, { props: { fullWidth: true } })
    expect(wrapper.classes()).toContain('w-full')
  })

  it('does not apply full width class by default', () => {
    const wrapper = mount(PrimaryButton)
    expect(wrapper.classes()).not.toContain('w-full')
  })

  it('sets disabled attribute', () => {
    const wrapper = mount(PrimaryButton, { props: { disabled: true } })
    expect(wrapper.attributes('disabled')).toBeDefined()
  })

  it('is not disabled by default', () => {
    const wrapper = mount(PrimaryButton)
    expect(wrapper.attributes('disabled')).toBeUndefined()
  })

  it('applies default variant styles', () => {
    const wrapper = mount(PrimaryButton)
    expect(wrapper.classes()).toContain('bg-primary')
    expect(wrapper.classes()).toContain('text-background')
  })

  it('applies inverse variant styles', () => {
    const wrapper = mount(PrimaryButton, { props: { variant: 'inverse' } })
    expect(wrapper.classes()).toContain('bg-surface')
    expect(wrapper.classes()).toContain('text-primary')
  })

  it('emits click event', async () => {
    const wrapper = mount(PrimaryButton)
    await wrapper.trigger('click')
    expect(wrapper.emitted('click')).toHaveLength(1)
  })
})
