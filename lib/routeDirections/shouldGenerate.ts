export function shouldGenerateDirections(args: {
  routeUrl: string
  storedUrl: string | null
  hasStoredNarrative: boolean
}): boolean {
  const url = args.routeUrl.trim()
  if (!url) return false
  if (!args.hasStoredNarrative) return true
  return url !== (args.storedUrl ?? '').trim()
}
