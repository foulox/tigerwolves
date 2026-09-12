import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

const isPublicRoute = createRouteMatcher([
  '/',
  '/all-runs',
  '/library',
  '/races',
  '/roadmap(.*)',
  '/runner(.*)',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/vote',
  '/api/e2e-revalidate',
  '/api/preview-seed',
])

export default clerkMiddleware(
  async (auth, req) => {
    if (!isPublicRoute(req)) {
      await auth.protect()
    }
  },
  { signInUrl: '/sign-in' }
)

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
