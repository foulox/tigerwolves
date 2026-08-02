'use client'

import { HelpCircleIcon } from './icons'

export default function HowToUseButton() {
  function handleClick() {
    document.dispatchEvent(new CustomEvent('tw:launch-tour'))
  }

  return (
    <button
      onClick={handleClick}
      title="How to use this"
      data-tour="how-to-use"
      className="w-9 h-9 flex-none rounded-full border border-[#e8eaef] bg-white flex items-center justify-center text-[#8b93a1] touch-manipulation"
    >
      <HelpCircleIcon size={17} />
    </button>
  )
}
