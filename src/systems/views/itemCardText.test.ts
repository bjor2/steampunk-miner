import { describe, expect, it } from 'vitest'
import type { StatLine } from '../registries/itemDescriber'
import { itemCardTextOf } from './itemCardText'

const DRILL: StatLine = { label: 'Drill power', kind: 'geometric', now: '57', next: '70' }

function lineOf(line: StatLine) {
  return itemCardTextOf({ flavour: 'A brass bit.', statLines: [line] }).lines[0]
}

describe('item card text', () => {
  it('prints a rise with its share as "+13 (+22.8%)"', () => {
    expect(lineOf({ ...DRILL, delta: '13', deltaPct: '22.8%' }).change).toBe('+13 (+22.8%)')
  })

  it('keeps the minus of a falling stat and prints a lone delta or share alone', () => {
    expect(lineOf({ ...DRILL, delta: '-2', deltaPct: '-3.5%' }).change).toBe('-2 (-3.5%)')
    expect(lineOf({ ...DRILL, deltaPct: '0.0165%' }).change).toBe('+0.0165%')
    expect(lineOf(DRILL).change).toBeNull()
  })

  it('names the next major and the cap headroom where the line has them', () => {
    const line = lineOf({
      ...DRILL,
      kind: 'saturating',
      major: { levelsTo: 3, value: '1.20e6' },
      cap: { value: '14', headroomPct: '12.5%' },
    })
    expect([line.major, line.cap]).toEqual(['Next major in 3: 1.20e6', 'Cap 14, 12.5% to go'])
  })

  it('carries the flavour, unlock line and gate note, null where the description has none', () => {
    const text = itemCardTextOf({ flavour: 'A brass bit.', statLines: [], unlock: 'From planet 8' })
    expect([text.flavour, text.unlock, text.gateNote]).toEqual([
      'A brass bit.',
      'From planet 8',
      null,
    ])
  })
})
