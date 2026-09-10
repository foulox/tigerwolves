'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import * as Sentry from '@sentry/nextjs'
import { saveRotationOrder, saveAwayPeriod, removeAwayPeriod, addRunLeaderByEmail, removeRunLeader } from '@/app/run-config/actions'
import type { RunLeader, AwayPeriod } from '@/lib/data'

function upcomingPeriods(periods: AwayPeriod[]): AwayPeriod[] {
  const today = new Date().toISOString().slice(0, 10)
  return periods.filter(p => p.to >= today).sort((a, b) => a.from.localeCompare(b.from))
}

function awayBadgeText(periods: AwayPeriod[]): string | null {
  const future = upcomingPeriods(periods)
  if (!future.length) return null
  const first = `Away ${future[0].from.slice(5)} – ${future[0].to.slice(5)}`
  return future.length > 1 ? `${first} (+${future.length - 1} more)` : first
}

export default function RosterTab({
  runLeaders, runId, currentUserId,
}: { runLeaders: RunLeader[]; runId: string; currentUserId: string }) {
  const router = useRouter()
  const [leaders, setLeaders] = useState(runLeaders)
  const [openAwayId, setOpenAwayId] = useState<number | null>(null)
  const [newFrom, setNewFrom] = useState('')
  const [newTo, setNewTo] = useState('')
  const [banner, setBanner] = useState<{ message: string; isWarning: boolean } | null>(null)
  const [newEmail, setNewEmail] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function moveLeader(idx: number, direction: -1 | 1) {
    const next = [...leaders]
    const swap = idx + direction
    if (swap < 0 || swap >= next.length) return
    ;[next[idx], next[swap]] = [next[swap], next[idx]]
    setLeaders(next)
    startTransition(async () => {
      try {
        await saveRotationOrder(next.map(l => l.id))
      } catch (err) {
        Sentry.captureException(err)
      }
    })
  }

  function handleSaveAway(leaderId: number) {
    if (!newFrom || !newTo) return
    startTransition(async () => {
      try {
        const result = await saveAwayPeriod(leaderId, { from: newFrom, to: newTo })
        if (result.error) return
        const msgs = [`✓ Away period saved · ${result.reassignedCount} schedule entries reassigned`]
        if (result.noLeaderDates.length) msgs.push(`⚠ No available leader for: ${result.noLeaderDates.join(', ')} — assign manually`)
        const hasWarning = result.noLeaderDates.length > 0
        setBanner({ message: msgs.join('\n'), isWarning: hasWarning })
        setTimeout(() => setBanner(null), 6000)
        setNewFrom(''); setNewTo('')
        setOpenAwayId(null)
        setLeaders(prev => prev.map(r => r.id === leaderId
          ? { ...r, awayPeriods: [...r.awayPeriods, { from: newFrom, to: newTo }] }
          : r
        ))
      } catch (err) {
        Sentry.captureException(err)
      }
    })
  }

  function handleAddLeader() {
    if (!newEmail.trim()) return
    setAddError(null)
    startTransition(async () => {
      try {
        const result = await addRunLeaderByEmail(runId, newEmail.trim())
        if (result.error) { setAddError(result.error); return }
        setNewEmail('')
        router.refresh()
      } catch (err) {
        Sentry.captureException(err)
        setAddError('Something went wrong — please try again.')
      }
    })
  }

  return (
    <div className="p-4 flex flex-col gap-4">
      {banner && (
        <div className={`border rounded-xl px-4 py-3 text-sm font-semibold whitespace-pre-line ${banner.isWarning ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-green-50 border-green-200 text-green-800'}`}>{banner.message}</div>
      )}

      <div>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Rotation order</p>
        <div className="bg-white rounded-xl overflow-hidden shadow-sm divide-y divide-gray-100">
          {leaders.map((l, idx) => {
            const badge = awayBadgeText(l.awayPeriods)
            const isOpen = openAwayId === l.id
            const future = upcomingPeriods(l.awayPeriods)
            return (
              <div key={l.id}>
                <div className="flex items-center gap-2 px-3 py-2.5">
                  <span className="text-xs font-bold text-gray-300 w-4 text-center">{idx + 1}</span>
                  <div className="flex flex-col gap-0.5">
                    <button
                      onClick={() => moveLeader(idx, -1)}
                      disabled={idx === 0}
                      className="text-gray-300 text-xs leading-none disabled:opacity-20 touch-manipulation"
                      aria-label="Move up"
                    >▲</button>
                    <button
                      onClick={() => moveLeader(idx, 1)}
                      disabled={idx === leaders.length - 1}
                      className="text-gray-300 text-xs leading-none disabled:opacity-20 touch-manipulation"
                      aria-label="Move down"
                    >▼</button>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-sm font-bold text-gray-500 shrink-0">
                    {l.name[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-gray-900 flex items-center gap-1 flex-wrap">
                      {l.name}
                      {l.clerkUserId === currentUserId && <span className="text-[9px] bg-green-50 text-green-600 font-bold px-1.5 py-0.5 rounded">you</span>}
                      {badge && <span className="text-[9px] bg-yellow-50 text-yellow-700 font-bold px-1.5 py-0.5 rounded">{badge}</span>}
                    </div>
                    {l.email && <div className="text-xs text-gray-400">{l.email}</div>}
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <button
                      onClick={() => { setOpenAwayId(isOpen ? null : l.id); setNewFrom(''); setNewTo('') }}
                      className={`text-[10px] font-bold border rounded-md px-2 py-1 touch-manipulation ${isOpen ? 'border-yellow-300 text-yellow-700 bg-yellow-50' : 'border-gray-200 text-gray-500 bg-white'}`}
                    >Away{isOpen ? ' ▾' : ''}</button>
                    <button
                      onClick={() => { startTransition(async () => { try { await removeRunLeader(l.id); setLeaders(prev => prev.filter(r => r.id !== l.id)) } catch(e) { Sentry.captureException(e) } }) }}
                      className="w-6 h-6 rounded-full bg-red-50 text-orange-600 flex items-center justify-center text-sm touch-manipulation"
                      aria-label={`Remove ${l.name}`}
                    >×</button>
                  </div>
                </div>
                {isOpen && (
                  <div className="bg-yellow-50 border-t border-yellow-100 px-3 py-3 flex flex-col gap-2">
                    {future.map((p, pi) => (
                      <div key={pi} className="flex justify-between items-center bg-white rounded-lg px-3 py-2 border border-yellow-200 text-xs">
                        <span className="font-semibold text-yellow-800">{p.from} – {p.to}</span>
                        <button
                          onClick={() => startTransition(async () => { try { await removeAwayPeriod(l.id, l.awayPeriods.indexOf(p)); setLeaders(prev => prev.map(r => r.id === l.id ? { ...r, awayPeriods: r.awayPeriods.filter((_, i) => i !== r.awayPeriods.indexOf(p)) } : r)) } catch(e) { Sentry.captureException(e) } })}
                          className="text-yellow-700 font-bold touch-manipulation"
                          aria-label={`Remove away period ${p.from} to ${p.to}`}
                        >Remove</button>
                      </div>
                    ))}
                    <div className="flex gap-2 items-center">
                      <label htmlFor={`away-from-${l.id}`} className="text-[10px] font-bold text-yellow-800 w-8">From</label>
                      <input id={`away-from-${l.id}`} type="date" value={newFrom} onChange={e => setNewFrom(e.target.value)} className="flex-1 bg-white border border-yellow-200 rounded-lg px-2 py-1.5 text-xs touch-manipulation" />
                    </div>
                    <div className="flex gap-2 items-center">
                      <label htmlFor={`away-to-${l.id}`} className="text-[10px] font-bold text-yellow-800 w-8">To</label>
                      <input id={`away-to-${l.id}`} type="date" value={newTo} onChange={e => setNewTo(e.target.value)} className="flex-1 bg-white border border-yellow-200 rounded-lg px-2 py-1.5 text-xs touch-manipulation" />
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => setOpenAwayId(null)} className="bg-white border border-yellow-200 text-yellow-800 rounded-lg px-3 py-1.5 text-xs font-bold touch-manipulation">Cancel</button>
                      <button onClick={() => handleSaveAway(l.id)} disabled={isPending || !newFrom || !newTo} className="bg-yellow-600 text-white rounded-lg px-3 py-1.5 text-xs font-bold disabled:opacity-50 touch-manipulation">Save away period</button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="bg-white rounded-xl p-4 shadow-sm">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Add leader</p>
        <div className="flex gap-2">
          <input
            type="email"
            value={newEmail}
            onChange={e => { setNewEmail(e.target.value); setAddError(null) }}
            placeholder="Email address…"
            className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm touch-manipulation"
          />
          <button
            onClick={handleAddLeader}
            disabled={isPending || !newEmail.trim()}
            className="bg-orange-600 text-white rounded-lg px-3 py-2 text-sm font-bold disabled:opacity-50 touch-manipulation"
          >Add</button>
        </div>
        {addError && <p className="mt-2 text-xs font-medium text-red-600">{addError}</p>}
        <p className="mt-2 text-[11px] text-gray-400 leading-snug">A leader must have signed in at least once before they can be added.</p>
      </div>
    </div>
  )
}
