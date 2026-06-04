import { format, formatDistanceToNow } from 'date-fns'

export const fmtDate = (d) => d ? format(new Date(d), 'dd MMM yyyy') : '—'
export const fmtTime = (d) => d ? format(new Date(d), 'HH:mm') : '—'
export const fmtDateTime = (d) => d ? format(new Date(d), 'dd MMM yyyy, HH:mm') : '—'
export const fmtRelative = (d) => d ? formatDistanceToNow(new Date(d), { addSuffix: true }) : '—'

export const fmtMinutes = (m) => {
  if (m === null || m === undefined) return '—'
  const h = Math.floor(m / 60)
  const min = m % 60
  if (h === 0) return `${min}m`
  if (min === 0) return `${h}h`
  return `${h}h ${min}m`
}

export const getDuration = (start, end) => {
  if (!start || !end) return null
  return Math.round((new Date(end) - new Date(start)) / 60000)
}

export const getErrorMessage = (err) => {
  return err?.response?.data?.detail || err?.message || 'Something went wrong'
}

export const cls = (...args) => args.filter(Boolean).join(' ')
