// A map-link cell may hold "URL_A OR URL_B" — take URL_A. Shared by every provider.
export function takeFirstUrl(raw: string): string {
  return raw.split(/\s+OR\s+/i)[0]?.trim() ?? ''
}
