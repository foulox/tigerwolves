import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Stub revalidateTag and revalidatePath — both are called by the route;
// they throw outside a Next.js request context, so they must be mocked.
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}))

import { revalidatePath, revalidateTag } from 'next/cache'
import { POST } from '@/app/api/e2e-revalidate/route'

describe('POST /api/e2e-revalidate', () => {
  const originalVercelEnv = process.env.VERCEL_ENV

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    if (originalVercelEnv === undefined) {
      delete process.env.VERCEL_ENV
    } else {
      process.env.VERCEL_ENV = originalVercelEnv
    }
  })

  it('Test A: returns 403 and does NOT call cache functions when VERCEL_ENV=production', async () => {
    process.env.VERCEL_ENV = 'production'

    const response = await POST()
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body).toEqual({ error: 'not available in production' })
    expect(revalidateTag).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('Test B: returns 200 and calls both cache functions when VERCEL_ENV=preview', async () => {
    process.env.VERCEL_ENV = 'preview'

    const response = await POST()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ ok: true })
    expect(revalidateTag).toHaveBeenCalledWith('tigerwolves-data', 'max')
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout')
  })
})
