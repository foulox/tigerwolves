export type RoadmapStatus = 'live' | 'upcoming' | 'vision'

export interface RoadmapCard {
  status: RoadmapStatus
  title: string
  description: string
}

const WIKI_URL =
  'https://raw.githubusercontent.com/wiki/foulox/tigerwolves/Release-Roadmap.md'

const STATUS_TAG = /^\[(\w+)\]\s+(.+)/

function toStatus(raw: string): RoadmapStatus {
  if (raw === 'live' || raw === 'upcoming' || raw === 'vision') return raw
  return 'upcoming'
}

export function parseRoadmap(markdown: string): RoadmapCard[] {
  if (!markdown.trim()) return []

  // Split on `## ` at the start of a line; slice(1) drops everything before the first heading
  const sections = markdown.split(/^## /m).slice(1)
  const cards: RoadmapCard[] = []

  for (const section of sections) {
    const newlineIdx = section.indexOf('\n')
    const headingText =
      newlineIdx >= 0 ? section.slice(0, newlineIdx).trim() : section.trim()
    const description =
      newlineIdx >= 0 ? section.slice(newlineIdx + 1).trim() : ''

    const match = headingText.match(STATUS_TAG)
    cards.push(
      match
        ? { status: toStatus(match[1].toLowerCase()), title: match[2].trim(), description }
        : { status: 'upcoming', title: headingText, description }
    )
  }

  return cards
}

export async function fetchRoadmap(): Promise<RoadmapCard[]> {
  try {
    const res = await fetch(WIKI_URL, { next: { revalidate: 86400 } } as RequestInit)
    if (!res.ok) return []
    return parseRoadmap(await res.text())
  } catch {
    return []
  }
}
