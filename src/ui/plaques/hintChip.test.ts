import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { HINT_DISMISS_TEST_ID } from './HintChip'
import { PlaquesView } from './PlaquesView'

// #500: on the compact HUD the hint is a one-line chip with a dismiss, drawn where the HUD
// measured room for it; the full HUD keeps its plaque.

const HINT = { id: 'hint_cargo', iconId: 'icon-hint', lines: ['Ore fills your cargo hold.'] }
const MODEL = { hint: HINT, transmission: null }
const PLACE = {
  chip: { left: 8, top: 219, right: 382, bottom: 259 },
  layer: { left: 0, top: 0, right: 390, bottom: 844 },
}

const draw = (props: Partial<Parameters<typeof PlaquesView>[0]>) =>
  renderToString(createElement(PlaquesView, { model: MODEL, ...props }))

describe('hint chip (#500)', () => {
  it('keeps the full HUD hint plaque with no dismiss', () => {
    const html = draw({})
    expect(html).toContain('data-hud="hint"')
    expect(html).not.toContain(HINT_DISMISS_TEST_ID)
  })

  it('draws the compact chip at its measured place, one chip tall, with a dismiss', () => {
    const html = draw({ isCompact: true, chipPlace: PLACE })
    expect(html).toContain('data-hud="hint"')
    expect(html).toContain('top:219px')
    expect(html).toContain('height:40px')
    expect(html).toContain(`data-testid="${HINT_DISMISS_TEST_ID}"`)
  })

  it('draws no chip before the compact HUD has measured its place', () => {
    expect(draw({ isCompact: true, chipPlace: null })).not.toContain('data-hud="hint"')
  })
})
