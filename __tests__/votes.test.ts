import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Hoist the in-memory store and mocks so vi.mock factories can reference them
const { store, mgetMock, incrMock, decrMock, execMock, pipelineMock, captureServerEventMock } = vi.hoisted(() => {
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

  return { store, mgetMock, incrMock, decrMock, execMock, pipelineMock, captureServerEventMock }
})

vi.mock('@vercel/kv', () => ({
  kv: { mget: mgetMock, incr: incrMock, decr: decrMock, pipeline: pipelineMock },
}))

vi.mock('../lib/analytics', () => ({
  captureServerEvent: captureServerEventMock,
}))

import { getVoteData } from '../lib/votes'
import { POST } from '../app/api/vote/route'

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/api/vote', {
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
})

describe('POST /api/vote', () => {
  it('increments vote:{id}:4 and returns { avg, count } when rating=4 with no previousRating', async () => {
    const res = await POST(makeRequest({ workoutId: 'w1', workoutName: 'Hills', rating: 4 }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ avg: 4, count: 1 })
    expect(store['vote:w1:4']).toBe(1)
  })

  it('decrements vote:{id}:2 and increments vote:{id}:4 when changing from rating=2 to rating=4', async () => {
    store['vote:w1:2'] = 1
    const res = await POST(makeRequest({ workoutId: 'w1', workoutName: 'Hills', rating: 4, previousRating: 2 }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ avg: 4, count: 1 })
    expect(store['vote:w1:2']).toBe(0)
    expect(store['vote:w1:4']).toBe(1)
  })

  it('returns 400 when workoutId is missing', async () => {
    const res = await POST(makeRequest({ rating: 4 }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when rating is 0', async () => {
    const res = await POST(makeRequest({ workoutId: 'w1', rating: 0 }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when rating is 6', async () => {
    const res = await POST(makeRequest({ workoutId: 'w1', rating: 6 }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when rating is a non-integer', async () => {
    const res = await POST(makeRequest({ workoutId: 'w1', rating: 3.5 }))
    expect(res.status).toBe(400)
  })

  it('fires reaction_cast PostHog event with correct properties for a new vote', async () => {
    await POST(makeRequest({ workoutId: 'w1', workoutName: 'Ladder', rating: 5 }))
    expect(captureServerEventMock).toHaveBeenCalledWith('reaction_cast', {
      workoutId: 'w1',
      workoutName: 'Ladder',
      rating: 5,
      emoji: '🥳',
      is_change: false,
    })
  })

  it('fires reaction_cast with is_change=true when previousRating is set', async () => {
    store['vote:w1:3'] = 1
    await POST(makeRequest({ workoutId: 'w1', workoutName: 'Ladder', rating: 4, previousRating: 3 }))
    expect(captureServerEventMock).toHaveBeenCalledWith('reaction_cast', expect.objectContaining({
      is_change: true,
    }))
  })
})

describe('getVoteData', () => {
  it('returns null for a workout with zero votes', async () => {
    const result = await getVoteData(['unknown||'])
    expect(result['unknown||']).toBeNull()
  })

  it('correctly computes weighted average across all 5 rating keys', async () => {
    // 1×😡(1) + 1×😐(3) + 2×😃(4) = total 4, weighted sum=1+3+8=12, avg=3
    store['vote:w1||:1'] = 1
    store['vote:w1||:3'] = 1
    store['vote:w1||:4'] = 2
    const result = await getVoteData(['w1||'])
    expect(result['w1||']).toEqual({ avg: 3, count: 4 })
  })

  it('returns null for a workout with all zero counts', async () => {
    store['vote:w2||:1'] = 0
    store['vote:w2||:2'] = 0
    const result = await getVoteData(['w2||'])
    expect(result['w2||']).toBeNull()
  })

  it('issues a single kv.mget for all keys across multiple workout IDs', async () => {
    await getVoteData(['a||', 'b||'])
    expect(mgetMock).toHaveBeenCalledTimes(1)
    // 2 workouts × 5 rating keys = 10 keys in one call
    expect(mgetMock.mock.calls[0]).toHaveLength(10)
  })

  it('handles empty workoutIds array without calling kv', async () => {
    const result = await getVoteData([])
    expect(result).toEqual({})
    expect(mgetMock).not.toHaveBeenCalled()
  })
})
