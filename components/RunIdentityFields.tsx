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
        <label htmlFor="run-identity-name" className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">
          Name
        </label>
        <input
          id="run-identity-name"
          type="text"
          value={values.name}
          onChange={e => onChange({ name: e.target.value })}
          className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 touch-manipulation"
        />
      </div>

      {/* dayOfWeek */}
      <div className="flex flex-col gap-1">
        <label htmlFor="run-identity-day" className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">
          Day of week
        </label>
        <select
          id="run-identity-day"
          value={values.dayOfWeek}
          onChange={e => onChange({ dayOfWeek: e.target.value })}
          className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 touch-manipulation appearance-none"
        >
          {DAYS_OF_WEEK.map(day => (
            <option key={day} value={day}>{day}</option>
          ))}
        </select>
      </div>

      {/* emoji */}
      <div className="flex flex-col gap-1">
        <label htmlFor="run-identity-emoji" className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">
          Emoji
        </label>
        <input
          id="run-identity-emoji"
          type="text"
          value={values.emoji}
          onChange={e => onChange({ emoji: e.target.value })}
          className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 touch-manipulation"
        />
      </div>

      {/* meetingTime */}
      <div className="flex flex-col gap-1">
        <label htmlFor="run-identity-time" className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">
          Meeting time
        </label>
        <input
          id="run-identity-time"
          type="text"
          value={values.meetingTime}
          onChange={e => onChange({ meetingTime: e.target.value })}
          className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 touch-manipulation"
        />
      </div>

      {/* meetingLocation */}
      <div className="flex flex-col gap-1">
        <label htmlFor="run-identity-location" className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">
          Meeting location
        </label>
        <textarea
          id="run-identity-location"
          value={values.meetingLocation}
          onChange={e => onChange({ meetingLocation: e.target.value })}
          className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 resize-y min-h-[60px] touch-manipulation"
        />
      </div>

      {/* description */}
      <div className="flex flex-col gap-1">
        <label htmlFor="run-identity-description" className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">
          Description
        </label>
        <textarea
          id="run-identity-description"
          value={values.description}
          onChange={e => onChange({ description: e.target.value })}
          className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 resize-y min-h-[60px] touch-manipulation"
        />
      </div>
    </div>
  )
}
