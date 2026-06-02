export const FORM_CATEGORIES = ['Easy', 'Long', 'Quality']

export const FORM_TYPES = [
  'Hills', 'Broken Tempo', 'Intervals', 'Progression',
  'Ladder', 'Superset', 'Straight Tempo', 'Threshold',
]

export const chipBase = 'px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors touch-manipulation'
export const chipDark = 'bg-gray-900 text-white border-gray-900'
export const chipOrange = 'bg-orange-500 text-white border-orange-500'
export const chipOff = 'bg-white text-gray-600 border-gray-200'

export function toggleItem(list: string[], item: string) {
  return list.includes(item) ? list.filter(x => x !== item) : [...list, item]
}
