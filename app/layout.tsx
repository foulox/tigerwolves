import type { Metadata, Viewport } from 'next'
import { Geist } from 'next/font/google'
import { ClerkProvider } from '@clerk/nextjs'
import './globals.css'
import BottomNav from '@/components/BottomNav'

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider signInUrl="/sign-in" signInFallbackRedirectUrl="/plan">
      <html lang="en" className="h-full">
        <body className={`${geist.className} bg-gray-50 h-full antialiased`}>
          <main className="max-w-lg mx-auto pb-20 min-h-full">
            {children}
          </main>
          <BottomNav />
        </body>
      </html>
    </ClerkProvider>
  )
}
