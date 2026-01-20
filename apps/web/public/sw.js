/**
 * Horalix Service Worker
 *
 * Provides:
 * - Offline functionality via caching
 * - Background sync for pending operations
 * - Push notifications
 * - Fast loading via cache-first strategy
 */

const CACHE_NAME = 'horalix-v1';
const RUNTIME_CACHE = 'horalix-runtime-v1';

// Assets to cache immediately on install
const PRECACHE_ASSETS = [
  '/',
  '/manifest.json',
  '/offline.html',
  // Add other critical assets
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[ServiceWorker] Install');

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[ServiceWorker] Precaching app shell');
      return cache.addAll(PRECACHE_ASSETS);
    }).then(() => {
      return self.skipWaiting();
    })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[ServiceWorker] Activate');

  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE) {
            console.log('[ServiceWorker] Removing old cache', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip cross-origin requests
  if (url.origin !== location.origin) {
    return;
  }

  // API requests - network first, cache fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirstStrategy(request));
    return;
  }

  // Static assets - cache first
  event.respondWith(cacheFirstStrategy(request));
});

/**
 * Cache-first strategy (for static assets)
 */
async function cacheFirstStrategy(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  if (cached) {
    return cached;
  }

  try {
    const response = await fetch(request);

    // Cache successful responses
    if (response && response.status === 200) {
      cache.put(request, response.clone());
    }

    return response;
  } catch (error) {
    console.error('[ServiceWorker] Fetch failed:', error);

    // Return offline page for navigations
    if (request.mode === 'navigate') {
      return cache.match('/offline.html');
    }

    throw error;
  }
}

/**
 * Network-first strategy (for API requests)
 */
async function networkFirstStrategy(request) {
  const cache = await caches.open(RUNTIME_CACHE);

  try {
    const response = await fetch(request);

    // Cache successful responses
    if (response && response.status === 200) {
      cache.put(request, response.clone());
    }

    return response;
  } catch (error) {
    console.log('[ServiceWorker] Network failed, serving from cache');

    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }

    throw error;
  }
}

// Background sync - retry failed requests when back online
self.addEventListener('sync', (event) => {
  console.log('[ServiceWorker] Background sync:', event.tag);

  if (event.tag === 'sync-prescriptions') {
    event.waitUntil(syncPrescriptions());
  }
});

async function syncPrescriptions() {
  // Get pending operations from IndexedDB
  const pending = await getPendingOperations();

  for (const operation of pending) {
    try {
      await fetch(operation.url, {
        method: operation.method,
        headers: operation.headers,
        body: operation.body,
      });

      // Remove from pending queue
      await removePendingOperation(operation.id);
    } catch (error) {
      console.error('[ServiceWorker] Sync failed:', error);
    }
  }
}

// Placeholder functions for IndexedDB operations
async function getPendingOperations() {
  // In production, read from IndexedDB
  return [];
}

async function removePendingOperation(id) {
  // In production, remove from IndexedDB
}

// Push notifications
self.addEventListener('push', (event) => {
  console.log('[ServiceWorker] Push received');

  const data = event.data ? event.data.json() : {};
  const title = data.title || 'Horalix Notification';
  const options = {
    body: data.body || 'You have a new notification',
    icon: '/icon-192x192.png',
    badge: '/badge-72x72.png',
    data: data.data,
    actions: data.actions || [],
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Notification click
self.addEventListener('notificationclick', (event) => {
  console.log('[ServiceWorker] Notification click:', event.action);

  event.notification.close();

  event.waitUntil(
    clients.openWindow(event.notification.data?.url || '/')
  );
});

console.log('[ServiceWorker] Loaded');
