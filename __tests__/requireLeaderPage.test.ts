import { describe, it, expect, vi, beforeEach } from 'vitest'

// requireLeaderPage() is the route-level leader gate (#337) in front of the
// leader-only pages (/plan, /library/add, /library/edit). It mirrors the
// action-level requireAuth() guard, one layer up: currentUser() + a
// publicMetadata.role === 'leader' check, redirecting anyone else to '/'.
//
// currentUser() and redirect() are server context with no request in vitest, so
// both are mocked. redirect() is stubbed as a plain spy (it does not throw here),
// which is enough to assert whether — and with what target — the gate fired.
const { currentUserMock } = vi.hoisted(() => ({ currentUserMock: vi.fn() }))
const { redirectMock } = vi.hoisted(() => ({ redirectMock: vi.fn() }))
vi.mock('@clerk/nextjs/server', () => ({ currentUser: currentUserMock }))
vi.mock('next/navigation', () => ({ redirect: redirectMock }))

import { requireLeaderPage } from '../lib/requireLeaderPage'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('requireLeaderPage (#337 route-level leader gate)', () => {
  it('returns the user and does NOT redirect when role is "leader"', async () => {
    const leader = { id: 'user_leader_1', publicMetadata: { role: 'leader' } }
    currentUserMock.mockResolvedValue(leader)

    const result = await requireLeaderPage()

    expect(redirectMock).not.toHaveBeenCalled()
    expect(result).toBe(leader)
  })

  it('redirects to "/" when role is "runner"', async () => {
    currentUserMock.mockResolvedValue({ id: 'u', publicMetadata: { role: 'runner' } })
    await requireLeaderPage()
    expect(redirectMock).toHaveBeenCalledWith('/')
  })

  it('redirects to "/" when role is "member"', async () => {
    currentUserMock.mockResolvedValue({ id: 'u', publicMetadata: { role: 'member' } })
    await requireLeaderPage()
    expect(redirectMock).toHaveBeenCalledWith('/')
  })

  it('redirects to "/" when publicMetadata has no role', async () => {
    currentUserMock.mockResolvedValue({ id: 'u', publicMetadata: {} })
    await requireLeaderPage()
    expect(redirectMock).toHaveBeenCalledWith('/')
  })

  it('redirects to "/" when currentUser() returns null (signed out)', async () => {
    currentUserMock.mockResolvedValue(null)
    await requireLeaderPage()
    expect(redirectMock).toHaveBeenCalledWith('/')
  })
})
