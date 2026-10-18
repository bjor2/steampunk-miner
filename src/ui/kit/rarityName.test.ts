import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { SeenRarity } from '../../systems/render/seenRarity'
import { rarityNameOf } from '../../systems/views/rarityName'
import { RarityName } from './RarityName'

// Ticket 454 under #139: the name of a seen material carries its rarity, its tint and whether its
// glow pulses as data-* hooks (the contract, never markup shape); reduce motion leaves a static
// colour and frame. The sheet is read as text for the one rule only a stylesheet can keep.

const MYTHIC: SeenRarity = { lead: 4, rarity: 'mythic', tint: [1, 0.94, 0.6], pulse: 0.45 }

function nameHtml(seen: SeenRarity | null, isMotionReduced: boolean): string {
  const rarity = rarityNameOf(seen, isMotionReduced)
  return renderToString(createElement(RarityName, { rarity, children: 'Sunstone' }))
}

describe('rarity name element', () => {
  it('draws an unspecified rarity as the plain name', () => {
    const html = nameHtml(null, false)
    expect(html).toContain('Sunstone')
    expect(html).toContain('data-rarity=""')
    expect(html).not.toContain('--rarity-tint')
  })

  it("draws a seen mythic's name in its tint, pulsing", () => {
    const html = nameHtml(MYTHIC, false)
    expect(html).toContain('data-rarity="mythic"')
    expect(html).toContain('--rarity-tint:rgb(255 240 153)')
    expect(html).toContain('data-pulse="true"')
  })

  it('keeps the colour and frame but drops the pulse with reduce motion', () => {
    const html = nameHtml(MYTHIC, true)
    expect(html).toContain('data-rarity="mythic"')
    expect(html).toContain('data-tinted="true"')
    expect(html).not.toContain('data-pulse')
  })

  it("stills the glow under the system's reduced-motion setting too", () => {
    const sheet = readFileSync(new URL('./RarityName.module.css', import.meta.url), 'utf8')
    const reduced = sheet.slice(sheet.indexOf('@media (prefers-reduced-motion: reduce)'))
    expect(reduced).toMatch(/\[data-pulse\]\s*\{\s*animation:\s*none;/)
  })
})
