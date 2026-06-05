import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { authApi } from '../lib/api'

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      loading: false,

      login: async (email, password) => {
        set({ loading: true })
        try {
          const { data } = await authApi.login(email, password)
          localStorage.setItem('wft_token', data.access_token)
          set({ user: data.user, token: data.access_token, loading: false })
          return data.user
        } catch (err) {
          set({ loading: false })
          throw err
        }
      },

      logout: () => {
        localStorage.removeItem('wft_token')
        set({ user: null, token: null })
      },

      fetchMe: async () => {
        const token = localStorage.getItem('wft_token')
        if (!token) return
        try {
          const { data } = await authApi.me()
          set({ user: data })
        } catch {
          localStorage.removeItem('wft_token')
          set({ user: null, token: null })
        }
      },
    }),
    {
      name: 'wft-auth',
      partialize: (s) => ({ token: s.token, user: s.user }),
    }
  )
)
