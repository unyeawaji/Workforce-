/**
 * Web Push notification helpers.
 *
 * Flow:
 *  1. registerSW()        — called once on app load; registers the service worker
 *  2. requestAndSubscribe() — called after clock-in; asks permission & sends sub to backend
 *  3. unsubscribeAll()    — called on logout
 */

import api from './api'

// Convert VAPID public key (base64url) → Uint8Array for the browser API
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

// ── 1. Register service worker ───────────────────────────────────────────────
export async function registerSW() {
  if (!('serviceWorker' in navigator)) return null
  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
    console.log('[Push] Service worker registered, scope:', reg.scope)
    return reg
  } catch (err) {
    console.warn('[Push] SW registration failed:', err)
    return null
  }
}

// ── 2. Ask permission and subscribe ─────────────────────────────────────────
export async function requestAndSubscribe() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('[Push] Push not supported in this browser')
    return false
  }

  // Ask for notification permission
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    console.warn('[Push] Notification permission denied')
    return false
  }

  try {
    // Fetch VAPID public key from backend
    const { data } = await api.get('/push/vapid-public-key')
    const applicationServerKey = urlBase64ToUint8Array(data.public_key)

    // Get (or create) a push subscription from the browser
    const reg = await navigator.serviceWorker.ready
    let sub = await reg.pushManager.getSubscription()

    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,   // required by all browsers
        applicationServerKey,
      })
    }

    // Send to backend
    const subJson = sub.toJSON()
    await api.post('/push/subscribe', {
      endpoint: subJson.endpoint,
      p256dh: subJson.keys.p256dh,
      auth: subJson.keys.auth,
    })

    console.log('[Push] Subscribed successfully')
    return true
  } catch (err) {
    console.error('[Push] Subscribe error:', err)
    return false
  }
}

// ── 3. Unsubscribe (logout / permission revoked) ─────────────────────────────
export async function unsubscribeAll() {
  if (!('serviceWorker' in navigator)) return

  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (!sub) return

    const subJson = sub.toJSON()
    // FIX: use POST instead of DELETE — some browsers/proxies strip DELETE request bodies
    await api.post('/push/unsubscribe', {
      endpoint: subJson.endpoint,
      p256dh: subJson.keys.p256dh,
      auth: subJson.keys.auth,
    }).catch(() => {})

    await sub.unsubscribe()
    console.log('[Push] Unsubscribed')
  } catch (err) {
    console.warn('[Push] Unsubscribe error:', err)
  }
}

// ── Utility: is push currently active? ──────────────────────────────────────
export async function isPushSubscribed() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    return !!sub && Notification.permission === 'granted'
  } catch {
    return false
  }
}
