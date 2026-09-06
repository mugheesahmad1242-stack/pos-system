// Service Worker for SSG Store POS System
const CACHE_NAME = 'ssg-store-v1.0'
const STATIC_CACHE = 'ssg-store-static-v1.0'
const DYNAMIC_CACHE = 'ssg-store-dynamic-v1.0'

// Assets to cache immediately
const STATIC_ASSETS = [
  '/',
  '/orders',
  '/inventory',
  '/bill-history',
  '/settings',
  '/manifest.json',
  '/offline.html'
]

// API endpoints to cache
const API_CACHE_PATTERNS = [
  /^https:\/\/.*\.supabase\.co\/rest\/v1\//,
  /^https:\/\/.*\.supabase\.co\/storage\/v1\//
]

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('Service Worker installing...')
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('Caching static assets')
        return cache.addAll(STATIC_ASSETS)
      })
      .then(() => {
        return self.skipWaiting()
      })
  )
})

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker activating...')
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE) {
              console.log('Deleting old cache:', cacheName)
              return caches.delete(cacheName)
            }
          })
        )
      })
      .then(() => {
        return self.clients.claim()
      })
  )
})

// Fetch event - serve from cache with network fallback
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return
  }

  // Handle API requests
  if (API_CACHE_PATTERNS.some(pattern => pattern.test(request.url))) {
    event.respondWith(
      caches.open(DYNAMIC_CACHE)
        .then((cache) => {
          return fetch(request)
            .then((response) => {
              // Cache successful responses
              if (response.status === 200) {
                cache.put(request, response.clone())
              }
              return response
            })
            .catch(() => {
              // Return cached version if network fails
              return cache.match(request)
            })
        })
    )
    return
  }

  // Handle static assets and pages
  event.respondWith(
    caches.match(request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse
        }

        return fetch(request)
          .then((response) => {
            // Don't cache non-successful responses
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response
            }

            // Cache the response
            const responseToCache = response.clone()
            caches.open(DYNAMIC_CACHE)
              .then((cache) => {
                cache.put(request, responseToCache)
              })

            return response
          })
          .catch(() => {
            // Return offline page for navigation requests
            if (request.destination === 'document') {
              return caches.match('/offline.html')
            }
          })
      })
  )
})

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  console.log('Background sync triggered:', event.tag)
  
  if (event.tag === 'background-sync') {
    event.waitUntil(
      // Handle offline actions when back online
      handleBackgroundSync()
    )
  }
})

async function handleBackgroundSync() {
  try {
    // Get pending actions from IndexedDB
    const pendingActions = await getPendingActions()
    
    for (const action of pendingActions) {
      try {
        await processAction(action)
        await removePendingAction(action.id)
      } catch (error) {
        console.error('Failed to process action:', error)
      }
    }
  } catch (error) {
    console.error('Background sync failed:', error)
  }
}

// Placeholder functions for offline functionality
async function getPendingActions() {
  // Implement IndexedDB logic to get pending actions
  return []
}

async function processAction(action) {
  // Process the pending action (e.g., sync data to Supabase)
  console.log('Processing action:', action)
}

async function removePendingAction(actionId) {
  // Remove processed action from IndexedDB
  console.log('Removing action:', actionId)
}

// Push notification handling
self.addEventListener('push', (event) => {
  if (event.data) {
    const data = event.data.json()
    
    event.waitUntil(
      self.registration.showNotification(data.title, {
        body: data.body,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: 'ssg-store-notification',
        actions: [
          {
            action: 'view',
            title: 'View'
          },
          {
            action: 'dismiss',
            title: 'Dismiss'
          }
        ]
      })
    )
  }
})

// Notification click handling
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  
  if (event.action === 'view') {
    event.waitUntil(
      clients.openWindow('/')
    )
  }
})
