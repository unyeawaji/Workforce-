import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { authApi } from '../lib/api'

// Single source of truth for the token: Zustand persist (localStorage key 'wft-auth').
// api.js reads from this same store via getToken() so there is no duplicate storage.
let _getToken = () => null

export const getToken = () => _getToken()

export const useAuthStore = create(
  persist(
    (set, get) => {
      // Wire up the module-level accessor after store creation
      _getToken = () => get().token

      return {
        user: null,
        token: null,
        loading: false,

        login: async (email, password) => {
          set({ loading: true })
          try {
            const { data } = await authApi.login(email, password)
            set({ user: data.user, token: data.access_token, loading: false })
            return data.user
          } catch (err) {
            set({ loading: false })
            throw err
          }
        },

        logout: () => {
          set({ user: null, token: null })
        },

        fetchMe: async () => {
          if (!get().token) return
          try {
            const { data } = await authApi.me()
            set({ user: data })
          } catch {
            set({ user: null, token: null })
          }
        },
      }
    },
    {
      name: 'wft-auth',
      partialize: (s) => ({ token: s.token, user: s.user }),
    }
  )
)
