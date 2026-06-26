import { useState, useEffect, useCallback } from 'react'
import { activitiesApi, shiftsApi, usersApi, analyticsApi, applicationsApi } from '../lib/api'
import { getErrorMessage } from '../lib/utils'

// ── Activities ────────────────────────────────────────────────────────────────
export function useActivities(params = {}) {
  const skip = params === null
  const [activities, setActivities] = useState([])
  const [loading, setLoading] = useState(!skip)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    if (skip) return
    setLoading(true)
    setError(null)
    try {
      const { data } = await activitiesApi.list(params || {})
      setActivities(data)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [skip, JSON.stringify(params)])

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

  const clockIn = async (clientName) => {
    const { data } = await shiftsApi.clockIn(clientName)
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
export function useWorkers(skip = false) {
  const [workers, setWorkers] = useState([])
  const [loading, setLoading] = useState(!skip)

  const load = async () => {
    if (skip) return
    setLoading(true)
    try {
      const { data } = await usersApi.list({ role: 'worker' })
      setWorkers(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [skip])

  const create = async (payload) => {
    const { data } = await usersApi.create(payload)
    setWorkers(prev => [data, ...prev])
    return data
  }

  const toggleActive = async (id, isActive, reason) => {
    const payload = isActive
      ? { is_active: false, deactivation_reason: reason || null }
      : { is_active: true }
    const { data } = await usersApi.update(id, payload)
    setWorkers(prev => prev.map(w => w.id === id ? data : w))
  }

  const remove = async (id) => {
    await usersApi.delete(id)
    setWorkers(prev => prev.filter(w => w.id !== id))
  }

  return { workers, loading, refetch: load, create, toggleActive, remove }
}

// ── Dashboard stats ───────────────────────────────────────────────────────────
export function useDashboardStats(skip = false) {
  const [stats, setStats] = useState(null)
  const [weekly, setWeekly] = useState([])
  const [loading, setLoading] = useState(!skip)

  const load = async () => {
    if (skip) return
    setLoading(true)
    try {
      const [s, w] = await Promise.all([analyticsApi.dashboard(), analyticsApi.weekly()])
      setStats(s.data)
      setWeekly(w.data.points || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [skip])

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

// ── Pending applications count (sidebar badge) ────────────────────────────────
export function usePendingApplicationsCount(pollMs = 30000) {
  const [count, setCount] = useState(0)

  const load = useCallback(async () => {
    try {
      const { data } = await applicationsApi.pendingCount()
      setCount(data.pending)
    } catch { /* silent — badge just won't update this cycle */ }
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, pollMs)
    return () => clearInterval(id)
  }, [load, pollMs])

  return { count, refetch: load }
}
