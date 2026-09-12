'use client'
import { useState } from 'react'
import PostTemplateTab from './PostTemplateTab'
import RosterTab from './RosterTab'
import AboutRunTab from './AboutRunTab'
import Header from './Header'
import type { RunConfig, RunLeader } from '@/lib/data'

type Props = { runConfig: RunConfig; runLeaders: RunLeader[]; currentUserId: string }

const TAB_LABELS = { about: 'About the run', template: 'Post template', roster: 'Roster' } as const

export default function RunConfigClient({ runConfig, runLeaders, currentUserId }: Props) {
  const [tab, setTab] = useState<'about' | 'template' | 'roster'>('about')
  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="Run Settings" subtitle={runConfig.name} isLeader={true} showBack />
      <div className="flex border-b border-gray-200 bg-white">
        {(['about', 'template', 'roster'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2.5 text-sm font-semibold touch-manipulation ${tab === t ? 'text-orange-600 border-b-2 border-orange-600' : 'text-gray-400'}`}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>
      {tab === 'about' && <AboutRunTab runConfig={runConfig} runLeaders={runLeaders} />}
      {tab === 'template' && <PostTemplateTab runConfig={runConfig} />}
      {tab === 'roster' && <RosterTab runLeaders={runLeaders} runId={runConfig.id} currentUserId={currentUserId} />}
    </div>
  )
}
