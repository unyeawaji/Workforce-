import axios from 'axios'
import { getToken } from '../store/authStore'

const api = axios.create({
  baseURL: (import.meta.env.VITE_API_URL || '') + '/api/v1',
  headers: { 'Content-Type': 'application/json' },
})

// Attach JWT on every request — reads from Zustand persist (single source of truth)
api.interceptors.request.use((config) => {
  const token = getToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// On 401, clear session and reload
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      // Import dynamically to avoid circular dependency at module load time
      import('../store/authStore').then(({ useAuthStore }) => {
        useAuthStore.getState().logout()
      })
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api

// Typed helpers
export const authApi = {
  login: (email, password) => api.post('/auth/login', { email, password }),
  me: () => api.get('/auth/me'),
}

export const usersApi = {
  list: (params) => api.get('/users', { params }),
  create: (data) => api.post('/users', data),
  update: (id, data) => api.patch(`/users/${id}`, data),
  delete: (id) => api.delete(`/users/${id}`),
}

export const shiftsApi = {
  clockIn: (clientName) => api.post('/shifts/clock-in', null, { params: clientName ? { client_name: clientName } : {} }),
  clockOut: () => api.post('/shifts/clock-out'),
  today: () => api.get('/shifts/today'),
  list: (params) => api.get('/shifts', { params }),
  uploadScreenshot: (formData) => api.post('/shifts/upload-screenshot', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
}

export const activitiesApi = {
  list: (params) => api.get('/activities', { params }),
  get: (id) => api.get(`/activities/${id}`),
  create: (data) => api.post('/activities', data),
  update: (id, data) => api.patch(`/activities/${id}`, data),
  delete: (id) => api.delete(`/activities/${id}`),
  verify: (id, data) => api.post(`/activities/${id}/verify`, data),
}

export const analyticsApi = {
  dashboard: () => api.get('/analytics/dashboard'),
  weekly: () => api.get('/analytics/weekly'),
  /**
   * Fetch a short-lived export token (60s), then trigger a file download
   * via fetch+blob. This avoids putting the long-lived session JWT in a
   * URL query param where it would appear in server logs and browser history.
   */
  triggerExport: async (params) => {
    // Step 1: get a short-lived export token via authenticated request
    const { data } = await api.get('/analytics/export-token')

    // Step 2: build query string, filtering out undefined/empty values
    const clean = { export_token: data.export_token }
    if (params.fmt) clean.fmt = params.fmt
    if (params.verification_status) clean.verification_status = params.verification_status
    if (params.worker_id) clean.worker_id = params.worker_id
    if (params.date_from) clean.date_from = params.date_from
    if (params.date_to) clean.date_to = params.date_to

    const base = (import.meta.env.VITE_API_URL || '') + '/api/v1/analytics/export'
    const qs = new URLSearchParams(clean).toString()

    // Step 3: fetch as blob to avoid CORS issues with window.open
    const resp = await fetch(`${base}?${qs}`)
    if (!resp.ok) throw new Error('Export failed')
    const blob = await resp.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = params.fmt === 'xlsx' ? 'activities.xlsx' : 'activities.csv'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  },
}

export const profileApi = {
  changePassword: (data) => api.post('/users/me/change-password', data),
}
