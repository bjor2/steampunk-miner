import { describe, expect, it } from 'vitest'
import { createScriptedSession, GROUND, poseAbove, poseInBay } from '../authority/scriptedSession'
import { buyUpgradeCommand, dockCommand, undockCommand } from '../platform/platformCommands'
import { FACING } from '../vehicle/vehiclePose'
import { EMPTY_HINT_BOARD, observeHints, type HintStep } from './hintBoard'
import type { HintMoment } from './hintConditions'
import { HINT_TABLE } from './hintTable'

// Ticket 792: one first-time plaque that points at the star map's button once the player has
// bought a first upgrade, the core loop learnt, and goes down the moment the map opens. Every
// other hint is already seen here, so only this one can show.

const STAR_MAP_HINT = 'hint_star_map'
const OTHERS_SEEN = HINT_TABLE.hints.map((hint) => hint.id).filter((id) => id !== STAR_MAP_HINT)

/** A session docked at the Upgrade bay with money for the engine's first level. */
function sessionAtUpgradeBay() {
  const session = createScriptedSession()
  session.submit(1, { type: 'debug.grantMoney', payload: { amount: '1e6' } })
  session.submit(2, poseInBay('upgrade'))
  session.submit(3, dockCommand('upgrade'))
  return session
}

function observe(step: HintStep, moment: Omit<HintMoment, 'playerId'>): HintStep {
  return observeHints(step, { ...moment, playerId: 'p1' })
}

describe('star map hint (ticket 792)', () => {
  it('waits until the player buys a first upgrade', () => {
    const session = sessionAtUpgradeBay()
    const step = observe(
      { board: EMPTY_HINT_BOARD, seen: OTHERS_SEEN },
      { state: session.state(), events: [] },
    )
    expect(step.board.shown).toBeNull()
    expect(step.board.queued).toEqual([])
  })

  it('shows once the first upgrade is bought, and stays up until the star map opens', () => {
    const session = sessionAtUpgradeBay()
    const events = session.submit(4, buyUpgradeCommand('engine', 0))
    let step = observe(
      { board: EMPTY_HINT_BOARD, seen: OTHERS_SEEN },
      { state: session.state(), events },
    )
    expect(step.board.shown?.id).toBe(STAR_MAP_HINT)
    step = observe(step, { state: session.state(), events: [], isStarMapOpen: false })
    expect(step.board.shown?.id).toBe(STAR_MAP_HINT)
    step = observe(step, { state: session.state(), events: [], isStarMapOpen: true })
    expect(step.board.shown).toBeNull()
  })

  it('goes down on the next dive off the pad, so it never holds back a later hint', () => {
    const session = sessionAtUpgradeBay()
    const events = session.submit(4, buyUpgradeCommand('engine', 0))
    let step = observe(
      { board: EMPTY_HINT_BOARD, seen: OTHERS_SEEN },
      { state: session.state(), events },
    )
    session.submit(5, undockCommand())
    const diving = session.submit(12, poseAbove(GROUND, FACING.right, { driveTicks: 12 }))
    step = observe(step, { state: session.state(), events: diving })
    expect(step.board.shown).toBeNull()
  })

  it('never shows again once seen', () => {
    const session = sessionAtUpgradeBay()
    const events = session.submit(4, buyUpgradeCommand('engine', 0))
    const step = observe(
      { board: EMPTY_HINT_BOARD, seen: [...OTHERS_SEEN, STAR_MAP_HINT] },
      { state: session.state(), events },
    )
    expect(step.board.shown).toBeNull()
    expect(step.board.queued).toEqual([])
  })
})
