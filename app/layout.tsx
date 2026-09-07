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
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
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
