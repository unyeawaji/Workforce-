/**
 * Service Worker — handles Web Push notifications.
 *
 * This file must live at the root of the served domain so its scope covers
 * the entire app. Vite copies everything from /public to the build output root.
 */

self.addEventListener("install", () => {
  // Activate immediately — no need to wait for old tabs to close
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(clients.claim());
});

// ── Receive a push from the server ──────────────────────────────────────────
self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Workforce Tracker", body: event.data.text(), url: "/" };
  }

  const { title, body, url = "/" } = payload;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/favicon.svg",
      badge: "/favicon.svg",
      tag: "checkin-reminder",          // replaces previous notification instead of stacking
      renotify: true,                    // vibrate/sound even if same tag
      requireInteraction: false,         // auto-dismiss after ~20s on desktop
      data: { url },
    })
  );
});

// ── User taps the notification ───────────────────────────────────────────────
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        // If the app is already open in a tab, focus it
        for (const client of windowClients) {
          if (new URL(client.url).origin === self.location.origin) {
            client.focus();
            return;
          }
        }
        // Otherwise open a new tab
        return clients.openWindow(targetUrl);
      })
  );
});
