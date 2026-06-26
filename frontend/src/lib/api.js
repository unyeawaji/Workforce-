import axios from 'axios'
import { getToken } from '../store/authStore'

const api = axios.create({
  baseURL: (import.meta.env.VITE_API_URL || '') + '/api/v1',
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  const token = getToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      import('../store/authStore').then(({ useAuthStore }) => {
        useAuthStore.getState().logout()
        window.location.href = '/login'
      })
    }
    return Promise.reject(err)
  }
)

export default api

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
  checkinStatus: () => api.get('/shifts/check-ins/status'),
  submitCheckin: (formData) => api.post('/shifts/check-in', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  adminToday: () => api.get('/shifts/admin/today'),
  adminHistory: (params) => api.get('/shifts/admin/history', { params }),
  unblock: (shiftId, reason) => api.post(`/shifts/${shiftId}/unblock`, null, { params: reason ? { reason } : {} }),
  updateNote: (shiftId, workerNote) => api.patch(`/shifts/${shiftId}/note`, { worker_note: workerNote }),
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
  triggerExport: async (params) => {
    const { data } = await api.get('/analytics/export-token')
    const clean = { export_token: data.export_token }
    if (params.fmt) clean.fmt = params.fmt
    if (params.verification_status) clean.verification_status = params.verification_status
    if (params.worker_id) clean.worker_id = params.worker_id
    if (params.date_from) clean.date_from = params.date_from
    if (params.date_to) clean.date_to = params.date_to
    const base = (import.meta.env.VITE_API_URL || '') + '/api/v1/analytics/export'
    const qs = new URLSearchParams(clean).toString()
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

export const applicationsApi = {
  listAdmins:       ()         => api.get('/applications/admins'),
  catalog:          ()         => api.get('/applications/catalog'),
  submit:           (data)     => api.post('/applications', data),
  list:             ()         => api.get('/applications'),
  approve:          (id)       => api.post(`/applications/${id}/approve`),
  reject:           (id)       => api.post(`/applications/${id}/reject`),
  pendingCount:     ()         => api.get('/applications/pending-count'),
  getMyServices:    ()         => api.get('/applications/my-services'),
  updateMyServices: (services) => api.patch('/applications/my-services', { services }),
}

export const clientsApi = {
  list: () => api.get('/clients'),
  create: (data) => api.post('/clients', data),
  assignWorkers: (id, workerIds) => api.patch(`/clients/${id}/workers`, { worker_ids: workerIds }),
  delete: (id) => api.delete(`/clients/${id}`),
  resetPassword: (id, newPassword) => api.post(`/clients/${id}/reset-password`, { new_password: newPassword }),
  suspend:       (id, reason)      => api.patch(`/clients/${id}/suspend`, { reason }),
  feed: () => api.get('/clients/me/feed'),
  history: (params) => api.get('/clients/me/history', { params }),
  submitReview: (workerId, rating, comment) => api.post('/clients/me/reviews', { worker_id: workerId, rating, comment }),
  editReview: (reviewId, rating, comment) => api.patch(`/clients/me/reviews/${reviewId}`, { rating, comment }),
  myReviews: () => api.get('/clients/me/reviews'),
  reviewsAboutMe: () => api.get('/clients/reviews/me'),
  teamReviews: (params) => api.get('/clients/reviews', { params }),
  reviewSummary: () => api.get('/clients/reviews/summary'),
}

export const scheduleApi = {
  window: () => api.get('/schedule/window'),
  days: () => api.get('/schedule/days'),
  updateDay: (dow, data) => api.put(`/schedule/days/${dow}`, data),
  holidays: () => api.get('/schedule/holidays'),
  addHoliday: (data) => api.post('/schedule/holidays', data),
  deleteHoliday: (id) => api.delete(`/schedule/holidays/${id}`),
}

export const payrollApi = {
  rates: () => api.get('/payroll/rates'),
  upsertRate: (data) => api.post('/payroll/rates', data),
  deleteRate: (dept) => api.delete(`/payroll/rates/${dept}`),
  summary: (params) => api.get('/payroll/summary', { params }),
  mySummary: (params) => api.get('/payroll/me/summary', { params }),
}

export const invitesApi = {
  create: (emailHint) => api.post('/invites', { email_hint: emailHint || null }),
  list: () => api.get('/invites'),
  revoke: (id) => api.delete(`/invites/${id}`),
  validate: (token) => api.get(`/invites/validate/${token}`),
  register: (data) => api.post('/invites/register', data),
}

export const sysApi = {
  listAdmins:       ()           => api.get('/sys/admins'),
  getWorkers:       (id)         => api.get(`/sys/admins/${id}/workers`),
  getClients:       (id)         => api.get(`/sys/admins/${id}/clients`),
  getShifts:        (id, params) => api.get(`/sys/admins/${id}/shifts`, { params }),
  getActivities:    (id, params) => api.get(`/sys/admins/${id}/activities`, { params }),
  updateAdmin:      (id, data)   => api.patch(`/sys/admins/${id}`, data),
  deleteAdmin:      (id)         => api.delete(`/sys/admins/${id}`),
}
