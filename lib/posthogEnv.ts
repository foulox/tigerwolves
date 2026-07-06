// Names are doubled (NEXT_PUBLIC_NEXT_PUBLIC_POSTHOG_POSTHOG_...) because the Vercel Marketplace
// integration's own variable names already started with NEXT_PUBLIC_POSTHOG_, and our custom
// prefix got prepended on top rather than replacing it. Cosmetic only - left as provisioned.
export const POSTHOG_KEY = process.env.NEXT_PUBLIC_NEXT_PUBLIC_POSTHOG_POSTHOG_PROJECT_TOKEN
export const POSTHOG_HOST = process.env.NEXT_PUBLIC_NEXT_PUBLIC_POSTHOG_POSTHOG_HOST ?? 'https://us.i.posthog.com'
