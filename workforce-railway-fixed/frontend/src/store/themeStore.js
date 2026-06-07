import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useThemeStore = create(
  persist(
    (set, get) => ({
      dark: false,
      toggle: () => {
        const next = !get().dark
        document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light')
        set({ dark: next })
      },
      init: () => {
        const { dark } = get()
        document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
      },
    }),
    { name: 'wft-theme' }
  )
)
