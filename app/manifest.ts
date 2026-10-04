import type { MetadataRoute } from 'next'

// #466 (NBR reskin): PWA web manifest. Next serves this at /manifest.webmanifest.
// `display: standalone` is what launches the installed app full-screen with no
// address bar. Brand values (name, colors, icons) updated from TigerWolves orange
// to North Brooklyn Runners chrome-dark (#0e0e0e).
//
// iOS note: iOS Safari does NOT honor this manifest for standalone launch — that
// relies on the `appleWebApp` meta tags + apple-icon in app/layout.tsx. This
// manifest drives Android/Chrome and desktop installs.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'North Brooklyn Runners',
    short_name: 'NBR',
    description: 'North Brooklyn Runners — runs, schedules, and workouts',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#0e0e0e',
    theme_color: '#0e0e0e', // chrome dark (NBR brand)
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
