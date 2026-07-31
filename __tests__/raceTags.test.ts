process.env.VERCEL_ENV = 'test'

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Hoist the in-memory store and mocks so vi.mock factories can reference them
const { store, mgetMock, incrMock, decrMock, execMock, pipelineMock, captureServerEventMock, authMock } = vi.hoisted(() => {
  const store: Record<string, number> = {}

  const incrMock = vi.fn((key: string) => {
    store[key] = (store[key] ?? 0) + 1
    return Promise.resolve(store[key])
  })
  const decrMock = vi.fn((key: string) => {
    store[key] = (store[key] ?? 0) - 1
    return Promise.resolve(store[key])
  })
  const execMock = vi.fn(() => Promise.resolve([]))
  const pipelineMock = vi.fn(() => ({ incr: incrMock, decr: decrMock, exec: execMock }))
  const mgetMock = vi.fn((...keys: string[]) =>
    Promise.resolve(keys.map(k => store[k] ?? null))
  )
  const captureServerEventMock = vi.fn().mockResolvedValue(undefined)
  const authMock = vi.fn().mockResolvedValue({ userId: null })

  return { store, mgetMock, incrMock, decrMock, execMock, pipelineMock, captureServerEventMock, authMock }
})

vi.mock('@vercel/kv', () => ({
  kv: { mget: mgetMock, incr: incrMock, decr: decrMock, pipeline: pipelineMock },
}))

vi.mock('../lib/analytics', () => ({
  captureServerEvent: captureServerEventMock,
}))

vi.mock('@clerk/nextjs/server', () => ({
  auth: authMock,
}))

import { getRaceTallies } from '../lib/raceTags'
import { POST } from '../app/api/race-tag/route'

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/api/race-tag', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  for (const key of Object.keys(store)) delete store[key]
  vi.clearAllMocks()
  mgetMock.mockImplementation((...keys: string[]) =>
    Promise.resolve(keys.map(k => store[k] ?? null))
  )
  incrMock.mockImplementation((key: string) => {
    store[key] = (store[key] ?? 0) + 1
    return Promise.resolve(store[key])
  })
  decrMock.mockImplementation((key: string) => {
    store[key] = (store[key] ?? 0) - 1
    return Promise.resolve(store[key])
  })
  pipelineMock.mockImplementation(() => ({ incr: incrMock, decr: decrMock, exec: execMock }))
  execMock.mockResolvedValue([])
  captureServerEventMock.mockResolvedValue(undefined)
  authMock.mockResolvedValue({ userId: null })
})

describe('POST /api/race-tag', () => {
  it('increments race-tag:{id}:target and returns the tally when tagging with no previousTier', async () => {
    const res = await POST(makeRequest({ raceId: 1, tier: 'target' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ target: 1, tuneup: 0, fun: 0 })
    expect(store['race-tag:test:1:target']).toBe(1)
  })

  it('decrements the previous tier and increments the new tier when changing tags', async () => {
    store['race-tag:test:1:target'] = 1
    const res = await POST(makeRequest({ raceId: 1, tier: 'fun', previousTier: 'target' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ target: 0, tuneup: 0, fun: 1 })
  })

  it('untags without adding a new count when tier is null', async () => {
    store['race-tag:test:1:tuneup'] = 1
    const res = await POST(makeRequest({ raceId: 1, tier: null, previousTier: 'tuneup' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ target: 0, tuneup: 0, fun: 0 })
  })

  it('returns 400 when raceId is missing', async () => {
    const res = await POST(makeRequest({ tier: 'target' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when raceId is not an integer', async () => {
    const res = await POST(makeRequest({ raceId: 1.5, tier: 'target' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when tier is an invalid string', async () => {
    const res = await POST(makeRequest({ raceId: 1, tier: 'gold' }))
    expect(res.status).toBe(400)
  })

  it('fires race_tag_cast with tier=none and anonymous by default', async () => {
    await POST(makeRequest({ raceId: 1, tier: null }))
    expect(captureServerEventMock).toHaveBeenCalledWith('race_tag_cast', 'anonymous-runner', {
      raceId: 1,
      tier: 'none',
      is_change: false,
      isLeader: false,
    })
  })

  it('fires race_tag_cast with the real userId and isLeader=true for a signed-in leader', async () => {
    authMock.mockResolvedValue({ userId: 'user_leader_123' })
    await POST(makeRequest({ raceId: 1, tier: 'target' }))
    expect(captureServerEventMock).toHaveBeenCalledWith('race_tag_cast', 'user_leader_123', expect.objectContaining({
      isLeader: true,
    }))
  })

  it('does not go negative when previousTier bucket is already zero', async () => {
    const res = await POST(makeRequest({ raceId: 1, tier: 'target', previousTier: 'fun' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.fun).toBeGreaterThanOrEqual(0)
  })
})

describe('getRaceTallies', () => {
  it('returns zeroed tally for a race with no tags', async () => {
    const result = await getRaceTallies([1])
    expect(result[1]).toEqual({ target: 0, tuneup: 0, fun: 0 })
  })

  it('returns the correct counts across all three tiers', async () => {
    store['race-tag:test:1:target'] = 3
    store['race-tag:test:1:tuneup'] = 1
    store['race-tag:test:1:fun'] = 2
    const result = await getRaceTallies([1])
    expect(result[1]).toEqual({ target: 3, tuneup: 1, fun: 2 })
  })

  it('issues a single kv.mget for all keys across multiple race IDs', async () => {
    await getRaceTallies([1, 2])
    expect(mgetMock).toHaveBeenCalledTimes(1)
    // 2 races × 3 tier keys = 6 keys in one call
    expect(mgetMock.mock.calls[0]).toHaveLength(6)
  })

  it('handles empty raceIds array without calling kv', async () => {
    const result = await getRaceTallies([])
    expect(result).toEqual({})
    expect(mgetMock).not.toHaveBeenCalled()
  })
})
