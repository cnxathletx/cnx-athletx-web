import { ref } from 'vue'

const STORAGE_KEY = 'cnx-theme'
const isDark = ref(!document.documentElement.classList.contains('light'))

export function useTheme() {
  function toggle() {
    isDark.value = !isDark.value
    if (isDark.value) {
      document.documentElement.classList.remove('light')
      localStorage.setItem(STORAGE_KEY, 'dark')
    } else {
      document.documentElement.classList.add('light')
      localStorage.setItem(STORAGE_KEY, 'light')
    }
  }

  return { isDark, toggle }
}
