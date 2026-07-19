import type { Metadata, Viewport } from 'next'
import { Geist } from 'next/font/google'
import { ClerkProvider } from '@clerk/nextjs'
import { auth } from '@clerk/nextjs/server'
import './globals.css'
import BottomNav from '@/components/BottomNav'
import DemoBanner from '@/components/DemoBanner'
import PostHogInit from '@/components/PostHogInit'
import TourMount from '@/components/TourMount'

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
  const { userId } = await auth()

  return (
    <ClerkProvider>
      <html lang="en" className="h-full">
        <body className={`${geist.className} bg-gray-50 h-full antialiased`}>
          <PostHogInit isLeader={!!userId} />
          <TourMount isLeader={!!userId} />
          <main className="max-w-lg mx-auto pb-20 min-h-full">
            <DemoBanner />
            {children}
          </main>
          <BottomNav />
        </body>
      </html>
    </ClerkProvider>
  )
}
