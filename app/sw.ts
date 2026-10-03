// app/sw.ts
/// <reference lib="webworker" />
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist'
import { CacheFirst, NetworkOnly, Serwist, StaleWhileRevalidate } from 'serwist'
import { classifyRoute } from '@/lib/sw-cache-policy'

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}
declare const self: ServiceWorkerGlobalScope

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // Content-hashed build assets: cache-first (new build = new URL).
    {
      matcher: ({ url, sameOrigin }: { url: URL; sameOrigin: boolean }) =>
        sameOrigin && url.pathname.startsWith('/_next/static'),
      handler: new CacheFirst({ cacheName: 'next-static' }),
    },
    // Story A PWA icons + other same-origin static images: cache-first.
    {
      matcher: ({ request, sameOrigin }: { request: Request; sameOrigin: boolean }) =>
        sameOrigin && request.destination === 'image',
      handler: new CacheFirst({ cacheName: 'images' }),
    },
    // The four public read-only routes + their RSC/data payloads: SWR.
    {
      matcher: ({ url, sameOrigin }: { url: URL; sameOrigin: boolean }) =>
        sameOrigin && classifyRoute(url.pathname) === 'stale-while-revalidate',
      handler: new StaleWhileRevalidate({ cacheName: 'public-pages' }),
    },
    // Auth/write/api: explicit network-only so the scope guard is visible.
    {
      matcher: ({ url, sameOrigin }: { url: URL; sameOrigin: boolean }) =>
        sameOrigin && classifyRoute(url.pathname) === 'network-only',
      handler: new NetworkOnly(),
    },
  ],
  fallbacks: {
    entries: [
      {
        url: '/offline',
        matcher: ({ request }: { request: Request }) => request.destination === 'document',
      },
    ],
  },
})

serwist.addEventListeners()
