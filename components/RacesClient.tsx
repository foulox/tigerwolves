'use client'

import { useState, useTransition } from 'react'
import { Target, Wrench, PartyPopper, Flag, Clock, Check, Plus, Loader2 } from 'lucide-react'
import type { Race } from '@/lib/data'
import type { RaceTier, RaceTally } from '@/lib/raceTags'
import { addRace, flagRaceIssue, verifyRace, fixRaceAndClearFlag } from '@/app/actions'

const STORAGE_KEY = 'tw_race_tags'

function readStoredTag(raceId: number): RaceTier | undefined {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return undefined
    const map = JSON.parse(raw) as Record<string, RaceTier>
    return map[raceId]
  } catch {
    return undefined
  }
}

function writeStoredTag(raceId: number, tier: RaceTier | null) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const map: Record<string, RaceTier> = raw ? (JSON.parse(raw) as Record<string, RaceTier>) : {}
    if (tier) map[String(raceId)] = tier
    else delete map[String(raceId)]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    // localStorage unavailable in some privacy modes — silently skip
  }
}

function formatDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'long', day: 'numeric', year: 'numeric',
  })
}

function daysUntil(iso: string) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.ceil((new Date(iso + 'T00:00:00').getTime() - today.getTime()) / 86400000)
}

const TIER_META: Record<RaceTier, { label: string; icon: typeof Target; pill: string; ring: string }> = {
  target: { label: 'Target', icon: Target, pill: 'bg-orange-100 text-orange-700', ring: 'ring-2 ring-orange-400' },
  tuneup: { label: 'Tune-Up', icon: Wrench, pill: 'bg-blue-100 text-blue-800', ring: 'ring-2 ring-blue-400' },
  fun: { label: 'Fun', icon: PartyPopper, pill: 'bg-green-100 text-green-800', ring: 'ring-2 ring-green-400' },
}

type SheetState =
  | { type: 'add' }
  | { type: 'flag'; raceId: number }
  | { type: 'view'; raceId: number }
  | { type: 'fix'; raceId: number }
  | null

async function postRaceTag(raceId: number, tier: RaceTier | null, previousTier?: RaceTier): Promise<RaceTally | null> {
  try {
    const res = await fetch('/api/race-tag', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ raceId, tier, previousTier }),
    })
    if (!res.ok) return null
    return await res.json() as RaceTally
  } catch {
    return null
  }
}

type Props = {
  initialRaces: Race[]
  initialTallies: Record<number, RaceTally>
  isLeader: boolean
}

export default function RacesClient({ initialRaces, initialTallies, isLeader }: Props) {
  const [races, setRaces] = useState(initialRaces)
  const [tallies, setTallies] = useState(initialTallies)
  const [myTags, setMyTags] = useState<Record<number, RaceTier | null | undefined>>({})
  const [sheet, setSheet] = useState<SheetState>(null)
  const [isPending, startTransition] = useTransition()

  const [addForm, setAddForm] = useState({ name: '', date: '', distance: '', location: '', organizer: '', tier: null as RaceTier | null })
  const [addError, setAddError] = useState<string | undefined>()
  const [flagText, setFlagText] = useState('')
  const [flagError, setFlagError] = useState<string | undefined>()
  const [fixForm, setFixForm] = useState({ name: '', date: '', distance: '', location: '' })

  function myTagFor(raceId: number): RaceTier | null | undefined {
    if (raceId in myTags) return myTags[raceId]
    return readStoredTag(raceId)
  }

  async function handleTag(raceId: number, tier: RaceTier) {
    const previousTier = myTagFor(raceId)
    const newTier = previousTier === tier ? null : tier
    setMyTags(prev => ({ ...prev, [raceId]: newTier }))
    writeStoredTag(raceId, newTier)

    const result = await postRaceTag(raceId, newTier, previousTier ?? undefined)
    if (result) {
      setTallies(prev => ({ ...prev, [raceId]: result }))
    }
  }

  function openAdd() {
    setAddForm({ name: '', date: '', distance: '', location: '', organizer: '', tier: null })
    setAddError(undefined)
    setSheet({ type: 'add' })
  }

  function openFlag(raceId: number) {
    setFlagText('')
    setFlagError(undefined)
    setSheet({ type: 'flag', raceId })
  }

  function openIssue(raceId: number) {
    setSheet({ type: isLeader ? 'fix' : 'view', raceId })
    if (isLeader) {
      const r = races.find(r => r.id === raceId)
      if (r) setFixForm({ name: r.name, date: r.date, distance: r.distance, location: r.location })
    }
  }

  function closeSheet() {
    setSheet(null)
  }

  function submitAdd() {
    if (!addForm.name.trim() || !addForm.date.trim()) {
      setAddError(!addForm.name.trim() ? 'Race name is required' : 'Date is required')
      return
    }
    setAddError(undefined)
    startTransition(async () => {
      const result = await addRace({
        name: addForm.name,
        date: addForm.date,
        distance: addForm.distance,
        location: addForm.location,
        organizer: addForm.organizer,
      })
      if ('error' in result) {
        setAddError(result.error)
        return
      }
      const newRace: Race = {
        id: result.id,
        name: addForm.name.trim(),
        date: addForm.date.trim(),
        distance: addForm.distance.trim(),
        location: addForm.location.trim(),
        organizer: addForm.organizer.trim() || 'a club member',
        verified: false,
        flagged: false,
        flagNote: '',
      }
      setRaces(prev => [newRace, ...prev].sort((a, b) => a.date.localeCompare(b.date)))
      setTallies(prev => ({ ...prev, [newRace.id]: { target: 0, tuneup: 0, fun: 0 } }))
      if (addForm.tier) {
        setMyTags(prev => ({ ...prev, [newRace.id]: addForm.tier }))
        writeStoredTag(newRace.id, addForm.tier)
        const tallyResult = await postRaceTag(newRace.id, addForm.tier)
        if (tallyResult) setTallies(prev => ({ ...prev, [newRace.id]: tallyResult }))
      }
      setSheet(null)
    })
  }

  function submitFlag() {
    if (!flagText.trim()) {
      setFlagError('Description is required')
      return
    }
    if (sheet?.type !== 'flag') return
    const raceId = sheet.raceId
    setFlagError(undefined)
    startTransition(async () => {
      const result = await flagRaceIssue(raceId, flagText)
      if (result && 'error' in result) {
        setFlagError(result.error)
        return
      }
      setRaces(prev => prev.map(r => r.id === raceId ? { ...r, flagged: true, flagNote: flagText.trim() } : r))
      setSheet(null)
    })
  }

  function submitVerify(raceId: number) {
    startTransition(async () => {
      await verifyRace(raceId)
      setRaces(prev => prev.map(r => r.id === raceId ? { ...r, verified: true } : r))
    })
  }

  function submitFix() {
    if (sheet?.type !== 'fix') return
    const raceId = sheet.raceId
    startTransition(async () => {
      await fixRaceAndClearFlag(raceId, fixForm)
      setRaces(prev => prev.map(r => r.id === raceId ? { ...r, ...fixForm, verified: true, flagged: false, flagNote: '' } : r))
      setSheet(null)
    })
  }

  const activeRace = sheet && 'raceId' in sheet ? races.find(r => r.id === sheet.raceId) : undefined

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs font-bold text-gray-500">{races.length} upcoming</div>
        <button
          type="button"
          onClick={openAdd}
          className="touch-manipulation flex items-center gap-1.5 bg-orange-600 text-white rounded-full pl-3 pr-4 py-2 text-sm font-bold shadow-sm shadow-orange-600/25"
        >
          <Plus size={15} strokeWidth={3} />
          Add a race
        </button>
      </div>

      <div className="flex flex-col gap-3">
        {races.length === 0 && (
          <p className="text-gray-400 italic text-sm">No upcoming races added yet.</p>
        )}
        {races.map(race => {
          const days = daysUntil(race.date)
          const tally = tallies[race.id] ?? { target: 0, tuneup: 0, fun: 0 }
          const myTag = myTagFor(race.id)
          return (
            <div key={race.id} className="relative bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
              <div className="absolute top-3 right-3 w-[22px] h-[22px] rounded-full flex items-center justify-center shadow-sm">
                {race.verified ? (
                  <div className="w-full h-full rounded-full bg-green-500 flex items-center justify-center">
                    <Check size={12} className="text-white" strokeWidth={3} />
                  </div>
                ) : race.flagged ? (
                  <div className="w-full h-full rounded-full bg-red-500 flex items-center justify-center">
                    <Flag size={11} className="text-white" fill="white" strokeWidth={2} />
                  </div>
                ) : (
                  <div className="w-full h-full rounded-full bg-yellow-500 flex items-center justify-center">
                    <Clock size={12} className="text-white" strokeWidth={2} />
                  </div>
                )}
              </div>

              <div className="pr-7">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <div className="font-bold text-gray-900">{race.name}</div>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full shrink-0 ${days <= 30 ? 'bg-red-100 text-red-700' : 'bg-blue-50 text-blue-600'}`}>
                    {days}d
                  </span>
                  {race.verified ? (
                    <span className="text-[10.5px] font-bold text-green-800 bg-green-100 rounded-full px-2 py-0.5">Verified</span>
                  ) : (
                    <span className="text-[10.5px] font-bold text-gray-500 bg-gray-200 rounded-full px-2 py-0.5">Unverified</span>
                  )}
                </div>
                <div className="text-sm text-gray-500 mt-1">{formatDate(race.date)}</div>
                <div className="flex gap-2 mt-1.5 text-xs text-gray-400">
                  <span>{race.distance || '—'}</span>
                  <span>·</span>
                  <span>{race.location || '—'}</span>
                </div>
                <div className="mt-1 text-xs text-gray-400">Organized by {race.organizer || 'a club member'}</div>
              </div>

              <div className="flex gap-1.5 mt-3 flex-wrap">
                {(Object.keys(TIER_META) as RaceTier[]).map(tier => {
                  const meta = TIER_META[tier]
                  const Icon = meta.icon
                  const selected = myTag === tier
                  return (
                    <button
                      key={tier}
                      type="button"
                      onClick={() => handleTag(race.id, tier)}
                      className={`touch-manipulation inline-flex items-center gap-1 text-xs font-bold rounded-full pl-2 pr-2.5 py-1.5 ${meta.pill} ${selected ? meta.ring : ''}`}
                    >
                      <Icon size={13} />
                      {meta.label} · {tally[tier]}
                    </button>
                  )
                })}
              </div>

              <div className="flex items-center gap-2 mt-3 pt-2.5 border-t border-dashed border-gray-100 flex-wrap">
                {race.flagged ? (
                  <button
                    type="button"
                    onClick={() => openIssue(race.id)}
                    className="touch-manipulation flex items-center gap-1.5 bg-red-100 text-red-800 rounded-full px-3 py-1.5 text-xs font-bold"
                  >
                    <Flag size={12} />
                    Issue reported
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => openFlag(race.id)}
                    className="touch-manipulation border border-dashed border-gray-300 text-gray-400 rounded-full px-2.5 py-1.5 text-xs font-semibold"
                  >
                    Flag an issue
                  </button>
                )}
                {isLeader && !race.verified && (
                  <button
                    type="button"
                    onClick={() => submitVerify(race.id)}
                    disabled={isPending}
                    className="touch-manipulation flex items-center gap-1.5 bg-green-100 text-green-800 rounded-full px-3 py-1.5 text-xs font-bold disabled:opacity-50"
                  >
                    <Check size={12} />
                    Mark as verified
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {sheet && (
        <div className="fixed inset-0 z-50 flex items-end" onClick={closeSheet}>
          <div
            className="w-full bg-white rounded-t-2xl shadow-xl max-h-[85vh] overflow-y-auto flex flex-col px-5 pt-3 pb-6"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-center pb-3">
              <div className="w-9 h-1 rounded-full bg-gray-200" />
            </div>

            {sheet.type === 'add' && (
              <div className="flex flex-col gap-3">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Add a race</h2>
                  <p className="text-sm text-gray-500">Anyone in the club can add one</p>
                </div>
                <label className="flex flex-col gap-1 text-xs font-bold text-gray-500">
                  Race name
                  <input
                    value={addForm.name}
                    onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. NYC Marathon"
                    className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 font-normal"
                  />
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <label className="flex flex-col gap-1 text-xs font-bold text-gray-500 min-w-0">
                    Date
                    <input
                      type="date"
                      value={addForm.date}
                      onChange={e => setAddForm(f => ({ ...f, date: e.target.value }))}
                      className="w-full rounded-xl border border-gray-300 px-2 py-2.5 text-sm text-gray-900 font-normal min-w-0"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-bold text-gray-500 min-w-0">
                    Distance
                    <input
                      value={addForm.distance}
                      onChange={e => setAddForm(f => ({ ...f, distance: e.target.value }))}
                      placeholder="26.2 mi"
                      className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 font-normal min-w-0"
                    />
                  </label>
                </div>
                <label className="flex flex-col gap-1 text-xs font-bold text-gray-500">
                  Location
                  <input
                    value={addForm.location}
                    onChange={e => setAddForm(f => ({ ...f, location: e.target.value }))}
                    placeholder="e.g. Central Park, NYC"
                    className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 font-normal"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs font-bold text-gray-500">
                  Organizer (optional)
                  <input
                    value={addForm.organizer}
                    onChange={e => setAddForm(f => ({ ...f, organizer: e.target.value }))}
                    placeholder="e.g. NYRR"
                    className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 font-normal"
                  />
                </label>
                <div className="flex flex-col gap-1.5">
                  <div className="text-xs font-bold text-gray-500">Your priority (optional)</div>
                  <div className="flex gap-1.5 flex-wrap">
                    {(Object.keys(TIER_META) as RaceTier[]).map(tier => {
                      const meta = TIER_META[tier]
                      const Icon = meta.icon
                      const selected = addForm.tier === tier
                      return (
                        <button
                          key={tier}
                          type="button"
                          onClick={() => setAddForm(f => ({ ...f, tier: f.tier === tier ? null : tier }))}
                          className={`touch-manipulation inline-flex items-center gap-1 text-xs font-bold rounded-full px-3 py-1.5 ${meta.pill} ${selected ? meta.ring : ''}`}
                        >
                          <Icon size={13} />
                          {meta.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
                {addError && <p className="text-sm text-red-600">{addError}</p>}
                <button
                  type="button"
                  onClick={submitAdd}
                  disabled={isPending}
                  className="touch-manipulation w-full bg-orange-600 text-white rounded-2xl py-3 font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isPending && <Loader2 size={15} className="animate-spin" />}
                  Add race
                </button>
                <p className="text-center text-xs text-gray-400 italic">New races start Unverified until someone confirms the details.</p>
              </div>
            )}

            {sheet.type === 'flag' && (
              <div className="flex flex-col gap-3">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Flag an issue</h2>
                  <p className="text-sm text-gray-500">{activeRace?.name}</p>
                </div>
                <label className="flex flex-col gap-1.5 text-xs font-bold text-gray-500">
                  What&apos;s wrong?
                  <textarea
                    value={flagText}
                    onChange={e => setFlagText(e.target.value)}
                    placeholder="e.g. the date's wrong, this year it's May 17"
                    rows={4}
                    className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 font-normal resize-none"
                  />
                </label>
                {flagError && <p className="text-sm text-red-600">{flagError}</p>}
                <div className="flex gap-2.5">
                  <button type="button" onClick={closeSheet} className="touch-manipulation flex-1 bg-gray-100 text-gray-700 rounded-2xl py-3 font-bold text-sm">
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={submitFlag}
                    disabled={isPending}
                    className="touch-manipulation flex-1 bg-orange-600 text-white rounded-2xl py-3 font-bold text-sm disabled:opacity-50"
                  >
                    Submit
                  </button>
                </div>
              </div>
            )}

            {sheet.type === 'view' && activeRace && (
              <div className="flex flex-col gap-3">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Reported issue</h2>
                  <p className="text-sm text-gray-500">{activeRace.name}</p>
                </div>
                <div className="text-sm text-red-800 bg-red-100 rounded-xl px-3.5 py-3">
                  <div className="text-[10.5px] font-bold uppercase tracking-wide opacity-75 mb-1">Reported by a runner</div>
                  {activeRace.flagNote}
                </div>
                <p className="text-xs text-gray-400 italic">Only run leaders can edit race details.</p>
                <button type="button" onClick={closeSheet} className="touch-manipulation w-full bg-gray-100 text-gray-700 rounded-2xl py-3 font-bold text-sm">
                  Close
                </button>
              </div>
            )}

            {sheet.type === 'fix' && activeRace && (
              <div className="flex flex-col gap-3">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Review &amp; fix</h2>
                  <p className="text-sm text-gray-500">{activeRace.name}</p>
                </div>
                <div className="text-xs text-red-800 bg-red-100 rounded-lg px-3 py-2.5">
                  <div className="text-[10.5px] font-bold uppercase tracking-wide opacity-75 mb-0.5">Reported by a runner</div>
                  {activeRace.flagNote}
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <label className="flex flex-col gap-1 text-[10.5px] font-bold text-gray-500">
                    Name
                    <input value={fixForm.name} onChange={e => setFixForm(f => ({ ...f, name: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-2.5 py-2 text-sm text-gray-900 font-normal" />
                  </label>
                  <label className="flex flex-col gap-1 text-[10.5px] font-bold text-gray-500">
                    Date
                    <input type="date" value={fixForm.date} onChange={e => setFixForm(f => ({ ...f, date: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-2.5 py-2 text-sm text-gray-900 font-normal" />
                  </label>
                  <label className="flex flex-col gap-1 text-[10.5px] font-bold text-gray-500">
                    Distance
                    <input value={fixForm.distance} onChange={e => setFixForm(f => ({ ...f, distance: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-2.5 py-2 text-sm text-gray-900 font-normal" />
                  </label>
                  <label className="flex flex-col gap-1 text-[10.5px] font-bold text-gray-500">
                    Location
                    <input value={fixForm.location} onChange={e => setFixForm(f => ({ ...f, location: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-2.5 py-2 text-sm text-gray-900 font-normal" />
                  </label>
                </div>
                <div className="flex gap-2.5">
                  <button type="button" onClick={closeSheet} className="touch-manipulation flex-1 bg-gray-100 text-gray-700 rounded-2xl py-3 font-bold text-sm">
                    Dismiss
                  </button>
                  <button
                    type="button"
                    onClick={submitFix}
                    disabled={isPending}
                    className="touch-manipulation flex-1 bg-orange-600 text-white rounded-2xl py-3 font-bold text-sm disabled:opacity-50"
                  >
                    Save fix &amp; clear flag
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
