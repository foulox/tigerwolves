'use client'
import { useState } from 'react'
import PostTemplateTab from './PostTemplateTab'
import RosterTab from './RosterTab'
import Header from './Header'
import type { RunConfig, RunLeader } from '@/lib/data'

type Props = { runConfig: RunConfig; runLeaders: RunLeader[]; currentUserId: string }

export default function RunConfigClient({ runConfig, runLeaders, currentUserId }: Props) {
  const [tab, setTab] = useState<'template' | 'roster'>('template')
  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="Run Settings" subtitle={runConfig.name} isLeader={true} showBack />
      <div className="flex border-b border-gray-200 bg-white">
        {(['template', 'roster'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2.5 text-sm font-semibold touch-manipulation ${tab === t ? 'text-orange-600 border-b-2 border-orange-600' : 'text-gray-400'}`}
          >
            {t === 'template' ? 'Post template' : 'Roster'}
          </button>
        ))}
      </div>
      {tab === 'template' && <PostTemplateTab runConfig={runConfig} />}
      {tab === 'roster' && <RosterTab runLeaders={runLeaders} runId={runConfig.id} currentUserId={currentUserId} />}
    </div>
  )
}
