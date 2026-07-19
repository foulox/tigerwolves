'use client'

export default function HowToUseButton() {
  function handleClick() {
    document.dispatchEvent(new CustomEvent('tw:launch-tour'))
  }

  return (
    <button
      onClick={handleClick}
      className="text-xs text-gray-400 underline touch-manipulation"
      data-tour="how-to-use"
    >
      How to use this
    </button>
  )
}
