type IconProps = { size?: number; strokeWidth?: number; className?: string }

function svgProps(size: number, strokeWidth: number) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
}

export function BellIcon({ size = 17, strokeWidth = 1.8, className }: IconProps) {
  return (
    <svg {...svgProps(size, strokeWidth)} className={className}>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </svg>
  )
}

export function HelpCircleIcon({ size = 17, strokeWidth = 1.8, className }: IconProps) {
  return (
    <svg {...svgProps(size, strokeWidth)} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.3a2.5 2.5 0 0 1 4.8.9c0 1.6-2.3 1.8-2.3 3.3" />
      <path d="M12 17.2v.1" />
    </svg>
  )
}

export function FeedbackIcon({ size = 17, strokeWidth = 1.8, className }: IconProps) {
  return (
    <svg {...svgProps(size, strokeWidth)} className={className}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}

export function PersonIcon({ size = 22, strokeWidth = 1.8, className }: IconProps) {
  return (
    <svg {...svgProps(size, strokeWidth)} className={className}>
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
    </svg>
  )
}

export function ClipboardCheckIcon({ size = 22, strokeWidth = 1.8, className }: IconProps) {
  return (
    <svg {...svgProps(size, strokeWidth)} className={className}>
      <rect x="6" y="4" width="12" height="17" rx="2" />
      <rect x="9" y="2.5" width="6" height="3" rx="1" />
      <path d="M9 12.5l2 2 4-4" />
    </svg>
  )
}
