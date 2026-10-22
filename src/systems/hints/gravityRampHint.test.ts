import { describe, expect, it } from 'vitest'
import { createScriptedSession } from '../authority/scriptedSession'
import { EMPTY_HINT_BOARD, observeHints, type HintStep } from './hintBoard'
import type { HintMoment } from './hintConditions'
import { HINT_TABLE } from './hintTable'

// Bjor's ruling on #724, HS: one first-time plaque the first time a dig is gravity-limited, and no
// pop-up after it. Every other hint is already seen here, so only this one can show.

const GRAVITY_HINT = 'hint_gravity_ramp'
const OTHERS_SEEN = HINT_TABLE.hints.map((hint) => hint.id).filter((id) => id !== GRAVITY_HINT)

function momentAt(tick: number, isDigGravityLimited: boolean): HintMoment {
  const session = createScriptedSession()
  session.advanceTo(tick)
  return { state: session.state(), playerId: 'p1', events: [], isDigGravityLimited }
}

describe('gravity ramp hint (#724)', () => {
  it('never shows while no dig is gravity-limited', () => {
    const step = observeHints({ board: EMPTY_HINT_BOARD, seen: OTHERS_SEEN }, momentAt(1, false))
    expect(step.board.shown).toBeNull()
    expect(step.seen).not.toContain(GRAVITY_HINT)
  })

  it('shows the first time a dig is gravity-limited, then never again', () => {
    let step: HintStep = { board: EMPTY_HINT_BOARD, seen: OTHERS_SEEN }
    step = observeHints(step, momentAt(1, true))
    expect(step.board.shown?.id).toBe(GRAVITY_HINT)
    expect(step.seen).toContain(GRAVITY_HINT)
    const later = observeHints({ board: EMPTY_HINT_BOARD, seen: step.seen }, momentAt(5000, true))
    expect(later.board.shown).toBeNull()
    expect(later.board.queued).toEqual([])
  })
})
