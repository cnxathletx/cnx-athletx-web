import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import i18n from '../../i18n'
import ChatWidget from './ChatWidget.vue'
import { useChatStore } from '../../stores/chat'
import { useAuthStore } from '../../stores/auth'

const store: Record<string, string> = {}

vi.stubGlobal('localStorage', {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = value },
  removeItem: (key: string) => { delete store[key] },
})

vi.stubGlobal('crypto', {
  getRandomValues: (array: Uint8Array) => {
    for (let i = 0; i < array.length; i++) array[i] = i + 1
    return array
  },
})

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', component: { template: '<div />' } },
    { path: '/admin', component: { template: '<div />' } },
  ],
})

function mountWidget() {
  return mount(ChatWidget, {
    global: { plugins: [router, i18n] },
  })
}

describe('ChatWidget', () => {
  beforeEach(async () => {
    for (const key of Object.keys(store)) delete store[key]
    setActivePinia(createPinia())
    vi.clearAllMocks()
    await router.push('/')
    await router.isReady()

    const auth = useAuthStore()
    auth.setUser(null)
  })

  it('does not load an existing conversation on mount', () => {
    const chat = useChatStore()
    const loadExistingSpy = vi.spyOn(chat, 'loadExisting')

    mountWidget()

    expect(loadExistingSpy).not.toHaveBeenCalled()
  })

  it('opens the widget lazily when the trigger is clicked', async () => {
    const chat = useChatStore()
    const openWidgetSpy = vi.spyOn(chat, 'openWidget').mockResolvedValue()

    const wrapper = mountWidget()
    await wrapper.find('button').trigger('click')

    expect(openWidgetSpy).toHaveBeenCalledOnce()
  })
})
