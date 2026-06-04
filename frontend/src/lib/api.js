import axios from 'axios'

const api = axios.create({
  baseURL: (import.meta.env.VITE_API_URL || '') + '/api/v1',
  headers: { 'Content-Type': 'application/json' },
})

// Attach JWT on every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('wft_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// On 401, clear session and reload
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('wft_token')
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
  clockIn: () => api.post('/shifts/clock-in'),
  clockOut: () => api.post('/shifts/clock-out'),
  today: () => api.get('/shifts/today'),
  list: (params) => api.get('/shifts', { params }),
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
   * via window.open(). This avoids putting the long-lived session JWT in
   * a URL query param where it would appear in server logs and browser history.
   */
  triggerExport: async (params) => {
    const { data } = await api.get('/analytics/export-token')
    const base = (import.meta.env.VITE_API_URL || '') + '/api/v1/analytics/export'
    const qs = new URLSearchParams({ ...params, export_token: data.export_token }).toString()
    window.open(`${base}?${qs}`, '_blank')
  },
}
