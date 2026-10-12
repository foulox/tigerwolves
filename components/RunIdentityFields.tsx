'use client'
import React from 'react'
import { DAYS_OF_WEEK, RunIdentityValues } from '@/lib/runIdentity'

export default function RunIdentityFields(props: {
  values: RunIdentityValues
  onChange: (patch: Partial<RunIdentityValues>) => void
}): React.JSX.Element {
  const { values, onChange } = props

  return (
    <div className="flex flex-col gap-3">
      {/* name */}
      <div className="flex flex-col gap-1">
        <label htmlFor="run-identity-name" className="font-display uppercase tracking-[0.1em] text-[10px] font-medium text-muted">
          Name
        </label>
        <input
          id="run-identity-name"
          type="text"
          value={values.name}
          onChange={e => onChange({ name: e.target.value })}
          className="bg-card border border-line px-3 py-2 text-sm text-ink touch-manipulation"
        />
      </div>

      {/* dayOfWeek */}
      <div className="flex flex-col gap-1">
        <label htmlFor="run-identity-day" className="font-display uppercase tracking-[0.1em] text-[10px] font-medium text-muted">
          Day of week
        </label>
        <select
          id="run-identity-day"
          value={values.dayOfWeek}
          onChange={e => onChange({ dayOfWeek: e.target.value })}
          className="bg-card border border-line px-3 py-2 text-sm text-ink touch-manipulation appearance-none"
        >
          {DAYS_OF_WEEK.map(day => (
            <option key={day} value={day}>{day}</option>
          ))}
        </select>
      </div>

      {/* emoji */}
      <div className="flex flex-col gap-1">
        <label htmlFor="run-identity-emoji" className="font-display uppercase tracking-[0.1em] text-[10px] font-medium text-muted">
          Emoji
        </label>
        <input
          id="run-identity-emoji"
          type="text"
          value={values.emoji}
          onChange={e => onChange({ emoji: e.target.value })}
          className="bg-card border border-line px-3 py-2 text-sm text-ink touch-manipulation"
        />
      </div>

      {/* meetingTime */}
      <div className="flex flex-col gap-1">
        <label htmlFor="run-identity-time" className="font-display uppercase tracking-[0.1em] text-[10px] font-medium text-muted">
          Meeting time
        </label>
        <input
          id="run-identity-time"
          type="text"
          value={values.meetingTime}
          onChange={e => onChange({ meetingTime: e.target.value })}
          className="bg-card border border-line px-3 py-2 text-sm text-ink touch-manipulation"
        />
      </div>

      {/* meetingLocation */}
      <div className="flex flex-col gap-1">
        <label htmlFor="run-identity-location" className="font-display uppercase tracking-[0.1em] text-[10px] font-medium text-muted">
          Meeting location
        </label>
        <textarea
          id="run-identity-location"
          value={values.meetingLocation}
          onChange={e => onChange({ meetingLocation: e.target.value })}
          className="bg-card border border-line px-3 py-2 text-sm text-ink resize-y min-h-[60px] touch-manipulation"
        />
      </div>

      {/* description */}
      <div className="flex flex-col gap-1">
        <label htmlFor="run-identity-description" className="font-display uppercase tracking-[0.1em] text-[10px] font-medium text-muted">
          Description
        </label>
        <textarea
          id="run-identity-description"
          value={values.description}
          onChange={e => onChange({ description: e.target.value })}
          className="bg-card border border-line px-3 py-2 text-sm text-ink resize-y min-h-[60px] touch-manipulation"
        />
      </div>
    </div>
  )
}
