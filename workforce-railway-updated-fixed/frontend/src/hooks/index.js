import { useState, useEffect, useCallback } from 'react'
import { activitiesApi, shiftsApi, usersApi, analyticsApi } from '../lib/api'
import { getErrorMessage } from '../lib/utils'

// ── Generic fetch hook ────────────────────────────────────────────────────────
export function useFetch(fetcher, deps = []) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetcher()
      setData(res.data)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, deps)

  useEffect(() => { load() }, [load])

  return { data, loading, error, refetch: load }
}

// ── Activities ────────────────────────────────────────────────────────────────
export function useActivities(params = {}) {
  const [activities, setActivities] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await activitiesApi.list(params)
      setActivities(data)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [JSON.stringify(params)])

  useEffect(() => { load() }, [load])

  const create = async (payload) => {
    const { data } = await activitiesApi.create(payload)
    setActivities(prev => [data, ...prev])
    return data
  }

  const update = async (id, payload) => {
    const { data } = await activitiesApi.update(id, payload)
    setActivities(prev => prev.map(a => a.id === id ? data : a))
    return data
  }

  const remove = async (id) => {
    await activitiesApi.delete(id)
    setActivities(prev => prev.filter(a => a.id !== id))
  }

  const verify = async (id, payload) => {
    const { data } = await activitiesApi.verify(id, payload)
    setActivities(prev => prev.map(a => a.id === id ? data : a))
    return data
  }

  return { activities, loading, error, refetch: load, create, update, remove, verify }
}

// ── Today's shift ─────────────────────────────────────────────────────────────
export function useTodayShift() {
  const [shift, setShift] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const { data } = await shiftsApi.today()
      setShift(data)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const clockIn = async () => {
    const { data } = await shiftsApi.clockIn()
    setShift(data)
    return data
  }

  const clockOut = async () => {
    const { data } = await shiftsApi.clockOut()
    setShift(data)
    return data
  }

  return { shift, loading, error, clockIn, clockOut, refetch: load }
}

// ── Workers ───────────────────────────────────────────────────────────────────
export function useWorkers() {
  const [workers, setWorkers] = useState([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const { data } = await usersApi.list({ role: 'worker' })
      setWorkers(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const create = async (payload) => {
    const { data } = await usersApi.create(payload)
    setWorkers(prev => [data, ...prev])
    return data
  }

  const toggleActive = async (id, isActive) => {
    const { data } = await usersApi.update(id, { is_active: !isActive })
    setWorkers(prev => prev.map(w => w.id === id ? data : w))
  }

  const remove = async (id) => {
    await usersApi.delete(id)
    setWorkers(prev => prev.filter(w => w.id !== id))
  }

  return { workers, loading, refetch: load, create, toggleActive, remove }
}

// ── Dashboard stats ───────────────────────────────────────────────────────────
export function useDashboardStats() {
  const [stats, setStats] = useState(null)
  const [weekly, setWeekly] = useState([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const [s, w] = await Promise.all([analyticsApi.dashboard(), analyticsApi.weekly()])
      setStats(s.data)
      setWeekly(w.data.points || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  return { stats, weekly, loading, refetch: load }
}

// ── Toast ─────────────────────────────────────────────────────────────────────
export function useToast() {
  const [toasts, setToasts] = useState([])

  const add = (message, type = 'success') => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000)
  }

  const remove = (id) => setToasts(prev => prev.filter(t => t.id !== id))

  return { toasts, toast: add, removeToast: remove }
}

// ── Shift history ─────────────────────────────────────────────────────────────
export function useShiftHistory() {
  const [shifts, setShifts] = useState([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const { data } = await shiftsApi.list()
      setShifts(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])
  return { shifts, loading, refetch: load }
}

// ── Paginated activities ───────────────────────────────────────────────────────
export function usePaginatedActivities(params = {}, pageSize = 20) {
  const [activities, setActivities] = useState([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await activitiesApi.list({ ...params, skip: (page - 1) * pageSize, limit: pageSize })
      setActivities(Array.isArray(data) ? data : data.items || data)
      setTotal(Array.isArray(data) ? data.length : data.total || data.length)
    } finally {
      setLoading(false)
    }
  }, [JSON.stringify(params), page])

  useEffect(() => { load() }, [load])

  const verify = async (id, payload) => {
    const { data } = await activitiesApi.verify(id, payload)
    setActivities(prev => prev.map(a => a.id === id ? data : a))
    return data
  }

  return { activities, loading, total, page, setPage, pageSize, refetch: load, verify }
}
