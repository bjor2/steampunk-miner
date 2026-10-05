import { describe, expect, it } from 'vitest'
import SHIPPED from '../../data/hints/hints.json'
import { HINT_TABLE, hintTableProblems } from './hintTable'

const withHint = (patch: Record<string, unknown>) => ({
  ...SHIPPED,
  hints: [{ ...SHIPPED.hints[0], ...patch }, ...SHIPPED.hints.slice(1)],
})

describe('hint table', () => {
  it('ships the five #16 hints, #58 hint_upgrade_bay and the three #2 transmissions', () => {
    expect(HINT_TABLE.hints.map((hint) => hint.id)).toEqual([
      'hint_move',
      'hint_drill',
      'hint_cargo',
      'hint_dock',
      'hint_upgrade_bay',
      'hint_energy',
    ])
    expect(HINT_TABLE.transmissions).toHaveLength(3)
    expect(HINT_TABLE.minTicksBetweenHints).toBe(1200)
  })

  it('refuses a hint of more than two lines', () => {
    expect(hintTableProblems(withHint({ lines: ['a', 'b', 'c'] }))).toEqual([
      'hints[0].lines must be 1 to 2 lines of text',
    ])
  })

  it('refuses a condition the rules do not know', () => {
    expect(hintTableProblems(withHint({ shownWhen: 'moonRise' }))).toEqual([
      'hints[0].shownWhen: "moonRise" is not a condition',
    ])
  })

  it('refuses a placeholder that is neither an action nor the tow cost', () => {
    expect(hintTableProblems(withHint({ lines: ['Press {KeyW}'] }))).toEqual([
      'hints[0].lines: {KeyW} is neither an action id nor fee/cargoLost',
    ])
  })

  it('refuses an id listed twice', () => {
    expect(hintTableProblems(withHint({ id: 'hint_drill' }))).toContain(
      '"hint_drill" is listed twice',
    )
  })
})
