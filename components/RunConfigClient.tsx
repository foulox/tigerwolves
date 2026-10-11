'use client'
import { useState } from 'react'
import PostTemplateTab from './PostTemplateTab'
import RosterTab from './RosterTab'
import AboutRunTab from './AboutRunTab'
import CardTemplateTab from './CardTemplateTab'
import Header from './Header'
import type { RunConfig, RunLeader, ScheduleEntry, WorkoutVariantRow } from '@/lib/data'

type Props = { runConfig: RunConfig; runLeaders: RunLeader[]; currentUserId: string; nextEntry: ScheduleEntry | null; roster: string[]; variants: WorkoutVariantRow[] }

const TAB_LABELS = { about: 'About the run', template: 'Post template', 'card-layout': 'Card layout', roster: 'Roster' } as const

export default function RunConfigClient({ runConfig, runLeaders, currentUserId, nextEntry, roster, variants }: Props) {
  const [tab, setTab] = useState<'about' | 'template' | 'card-layout' | 'roster'>('about')
  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="Run Settings" subtitle={runConfig.name} isLeader={true} showBack />
      <div className="flex border-b border-gray-200 bg-white">
        {(['about', 'template', 'card-layout', 'roster'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2.5 text-xs sm:text-sm font-semibold whitespace-nowrap touch-manipulation ${tab === t ? 'text-orange-600 border-b-2 border-orange-600' : 'text-gray-400'}`}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>
      {tab === 'about' && <AboutRunTab runConfig={runConfig} runLeaders={runLeaders} />}
      {/* #382 / #505: both the Post template and Card layout editors stay MOUNTED (just
          hidden when inactive) so switching tabs and back doesn't discard in-flight unsaved
          edits. Their sources of truth differ — PostTemplateTab's is its contenteditable DOM,
          CardTemplateTab's is React state — but either way the editor must survive the switch.
          About/Roster keep their existing unmount-on-switch behavior. */}
      <div className={tab === 'template' ? '' : 'hidden'}>
        <PostTemplateTab runConfig={runConfig} nextEntry={nextEntry} roster={roster} variants={variants} />
      </div>
      <div className={tab === 'card-layout' ? '' : 'hidden'}>
        <CardTemplateTab runConfig={runConfig} />
      </div>
      {tab === 'roster' && <RosterTab runLeaders={runLeaders} runId={runConfig.id} currentUserId={currentUserId} />}
    </div>
  )
}
