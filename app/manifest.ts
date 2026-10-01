import type { MetadataRoute } from 'next'

// #478 (Story A): PWA web manifest. Next serves this at /manifest.webmanifest.
// `display: standalone` is what launches the installed app full-screen with no
// address bar. Brand values (name, colors, icons) are hardcoded here now and
// migrate into the Phase 1 tenant config during the NBR rebrand (see issue).
//
// iOS note: iOS Safari does NOT honor this manifest for standalone launch — that
// relies on the `appleWebApp` meta tags + apple-icon in app/layout.tsx. This
// manifest drives Android/Chrome and desktop installs.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'TigerWolves',
    short_name: 'TigerWolves',
    description: 'Run club workout planner',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#f97316', // brand orange (orange-500)
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        // Android adaptive icon: emoji centered inside the ~80% safe zone so the
        // circle/squircle mask doesn't clip it.
        src: '/icon-512-maskable.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
