// __tests__/masthead.test.ts
import { describe, test, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import Masthead from '../components/Masthead'

const render = (props: Partial<Parameters<typeof Masthead>[0]> = {}) =>
  renderToStaticMarkup(
    React.createElement(Masthead, {
      photoSrc: '/hero/my-plan.jpg',
      photoAlt: 'NBR runners',
      title: 'My Plan',
      ...props,
    } as any),
  )

describe('Masthead (#513)', () => {
  test('renders the title inside an h1 within a header landmark', () => {
    const html = render({ title: 'My Plan' })
    expect(html).toMatch(/<header[^>]*>/)
    expect(html).toMatch(/<h1[^>]*>My Plan<\/h1>/)
  })
  test('renders the kicker when provided, omits it otherwise', () => {
    expect(render({ kicker: 'Your week' })).toContain('Your week')
    expect(render()).not.toContain('Your week')
  })
  test('renders the subtitle in a <p> when provided, omits it otherwise', () => {
    const withSub = render({ subtitle: 'Tuesday · 6:30 AM' })
    expect(withSub).toMatch(/<p[^>]*>Tuesday · 6:30 AM<\/p>/)
    expect(render()).not.toContain('Tuesday · 6:30 AM')
  })
  test('applies the warm photo scrim', () => {
    expect(render()).toContain('rgba(32,26,22,0.6)')
  })
  test('carries a solid fallback bg so the title reads if the photo fails', () => {
    expect(render()).toContain('bg-[#111]')
  })
  test('renders the photo with its alt and tuned object-position', () => {
    const html = render({ photoAlt: 'NBR Sunday Funday', objectPosition: 'center 8%' })
    expect(html).toContain('alt="NBR Sunday Funday"')
    expect(html).toContain('center 8%')
  })
  test('defaults the brand row to the NBR white logo; renders brandEnd', () => {
    const html = render({ brandEnd: React.createElement('span', null, 'CONTROLS') })
    expect(html).toContain('src="/nbr-logo.png"')
    expect(html).toContain('CONTROLS')
  })
  test('renders the underline only when underline is true', () => {
    expect(render({ underline: true })).toContain('w-[46px]')
    expect(render({ underline: false })).not.toContain('w-[46px]')
  })
})
