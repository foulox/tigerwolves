import type { Metadata, Viewport } from 'next'
import { Geist } from 'next/font/google'
import { ClerkProvider } from '@clerk/nextjs'
import { currentUser } from '@clerk/nextjs/server'
import './globals.css'
import ConditionalBottomNav from '@/components/ConditionalBottomNav'
import PostHogInit from '@/components/PostHogInit'

const geist = Geist({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'TigerWolves',
  description: 'Run club workout planner',
  // #478 (Story A): PWA install + iOS standalone.
  manifest: '/manifest.webmanifest',
  // iOS Safari ignores the manifest — these meta tags are what launch the
  // home-screen app full-screen with no address bar on iOS.
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'TigerWolves',
  },
  // Next 16's `appleWebApp.capable` emits only the modern `mobile-web-app-capable`
  // tag; add the legacy apple-prefixed one too so iOS versions that predate web-
  // manifest `display` support still launch standalone (issue #478 flags iOS as
  // mandatory). Harmless alongside the modern tag.
  other: {
    'apple-mobile-web-app-capable': 'yes',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#f97316', // brand orange — tints the status/title bar
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser()
  const isLeader = user?.publicMetadata?.role === 'leader'

  return (
    <ClerkProvider>
      <html lang="en" className="h-full">
        <body className={`${geist.className} bg-gray-50 h-full antialiased`}>
          <PostHogInit isLeader={isLeader} />
          <main className="max-w-lg mx-auto pb-20 min-h-full">
            {children}
          </main>
          <ConditionalBottomNav isLeader={isLeader} />
        </body>
      </html>
    </ClerkProvider>
  )
}
