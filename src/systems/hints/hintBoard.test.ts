import { describe, expect, it } from 'vitest'
import type { CommandIntent } from '../authority/authorityCommand'
import {
  createScriptedSession,
  GROUND,
  mineTile,
  poseAbove,
  poseInBay,
  SITE,
  surfaceOreTiles,
} from '../authority/scriptedSession'
import type { DomainEvent } from '../authority/domainEvent'
import { buyUpgradeCommand, dockCommand, undockCommand } from '../platform/platformCommands'
import { dockedPoseAt, FACING } from '../vehicle/vehiclePose'
import { EMPTY_HINT_BOARD, observeHints, type HintStep } from './hintBoard'
import { HINT_TABLE } from './hintTable'

const GAP = HINT_TABLE.minTicksBetweenHints

/** A scripted session whose every batch of events goes through the hint board. */
function watchedSession(seen: readonly string[] = []) {
  const session = createScriptedSession()
  let step: HintStep = { board: EMPTY_HINT_BOARD, seen }
  const shownOrder: string[] = []
  const watch = (events: readonly DomainEvent[]) => {
    step = observeHints(step, { state: session.state(), playerId: 'p1', events })
    const shown = step.board.shown
    if (shown !== null && shownOrder.at(-1) !== shown.id) shownOrder.push(shown.id)
    return step
  }
  watch([])
  return {
    session,
    submit: (tick: number, intent: CommandIntent) => watch(session.submit(tick, intent)),
    advanceTo: (tick: number) => watch(session.advanceTo(tick)),
    mine: (tick: number, tile: Parameters<typeof mineTile>[2]) =>
      watch(mineTile(session, tick, tile)),
    step: () => step,
    shownIds: () => shownOrder,
  }
}

const restOnDockPoint = (counts = {}) => {
  const pose = dockedPoseAt(SITE)
  return {
    type: 'reportPose' as const,
    payload: { ...poseAbove(GROUND, 1, counts).payload, ...pose },
  }
}

describe('hint board', () => {
  it('shows hint_move at the first moment of the run', () => {
    const watched = watchedSession()
    expect(watched.step().board.shown).toMatchObject({ id: 'hint_move', shownTick: 0 })
    expect(watched.step().seen).toEqual(['hint_move'])
  })

  it('keeps hint_move up while the vehicle rests on the dock point', () => {
    const watched = watchedSession()
    watched.submit(12, restOnDockPoint())
    expect(watched.step().board.shown?.id).toBe('hint_move')
  })

  it('takes hint_move down at the first movement', () => {
    const watched = watchedSession()
    watched.submit(12, poseAbove(GROUND, FACING.right, { driveTicks: 12 }))
    expect(watched.step().board.shown).toBeNull()
  })

  it('shows the next hint no sooner than 20 s (1200 ticks) after the last one went up', () => {
    const watched = watchedSession()
    watched.submit(12, poseAbove(GROUND, FACING.right, { driveTicks: 12 }))
    watched.advanceTo(GAP - 1)
    expect(watched.step().board.shown).toBeNull()
    watched.advanceTo(GAP)
    expect(watched.step().board.shown).toMatchObject({ id: 'hint_drill', shownTick: GAP })
  })

  it('never shows a second hint while one is up, however long it waits', () => {
    const watched = watchedSession()
    watched.submit(12, restOnDockPoint())
    watched.advanceTo(10 * GAP)
    expect(watched.shownIds()).toEqual(['hint_move'])
  })

  it('takes a hint down only when the player does the thing while it is up', () => {
    const watched = watchedSession()
    const [ore] = surfaceOreTiles(1)
    watched.mine(12, ore)
    expect(watched.step().board.queued.map((hint) => hint.id)).toEqual(['hint_drill', 'hint_cargo'])
    watched.advanceTo(GAP)
    expect(watched.step().board.shown?.id).toBe('hint_drill')
    watched.mine(GAP + 10, GROUND)
    expect(watched.step().board.shown).toBeNull()
  })

  it('shows the move, drill, cargo and dock hints in that order on a first trip', () => {
    const watched = watchedSession()
    const ores = surfaceOreTiles(3)
    watched.mine(12, ores[0])
    watched.advanceTo(GAP)
    watched.mine(GAP + 10, ores[1])
    watched.advanceTo(2 * GAP)
    watched.submit(2 * GAP + 10, restOnDockPoint())
    watched.submit(2 * GAP + 20, dockCommand('sell'))
    watched.submit(2 * GAP + 30, undockCommand())
    watched.mine(2 * GAP + 40, ores[2])
    watched.submit(3 * GAP + 10, restOnDockPoint())
    watched.submit(3 * GAP + 20, dockCommand('sell'))
    expect(watched.shownIds()).toEqual(['hint_move', 'hint_drill', 'hint_cargo', 'hint_dock'])
  })

  it('takes hint_dock down when the first upgrade is bought', () => {
    const watched = watchedSession(['hint_move', 'hint_drill', 'hint_cargo'])
    watched.mine(12, surfaceOreTiles(1)[0])
    watched.submit(60, restOnDockPoint())
    watched.submit(70, dockCommand('sell'))
    expect(watched.step().board.shown?.id).toBe('hint_dock')
    watched.submit(80, { type: 'debug.grantMoney', payload: { amount: '1e9' } })
    watched.submit(85, undockCommand())
    watched.submit(85, poseInBay('upgrade'))
    watched.submit(86, dockCommand('upgrade'))
    watched.submit(90, buyUpgradeCommand('engine'))
    expect(watched.step().board.shown).toBeNull()
  })

  it('shows hint_energy only after energy_low, and takes it down when the player docks', () => {
    const watched = watchedSession(['hint_move', 'hint_drill'])
    watched.submit(12, poseAbove(GROUND, FACING.right, { driveTicks: 12 }))
    expect(watched.step().board.shown).toBeNull()
    watched.submit(20, { type: 'debug.setEnergy', payload: { energy: '38' } })
    watched.submit(140, poseAbove(GROUND, FACING.right, { driveTicks: 120 }))
    expect(watched.step().board.shown).toMatchObject({ id: 'hint_energy', rescueCost: null })
    watched.submit(150, restOnDockPoint())
    watched.submit(160, dockCommand('sell'))
    expect(watched.step().board.shown).toBeNull()
  })

  it('shows hint_energy after a tow with what the tow cost', () => {
    const watched = watchedSession(['hint_move', 'hint_drill'])
    watched.submit(0, { type: 'debug.setEnergy', payload: { energy: '0.05' } })
    watched.submit(12, poseAbove(GROUND, FACING.right, { driveTicks: 12 }))
    watched.submit(50, { type: 'requestRescue', payload: {} })
    expect(watched.step().board.shown).toMatchObject({
      id: 'hint_energy',
      rescueCost: { fee: expect.any(String), cargoLostValue: expect.any(String) },
    })
  })

  it('shows each hint once, even when its condition holds again', () => {
    const watched = watchedSession()
    watched.submit(12, poseAbove(GROUND, FACING.right, { driveTicks: 12 }))
    watched.submit(24, restOnDockPoint())
    watched.advanceTo(5 * GAP)
    expect(watched.shownIds().filter((id) => id === 'hint_move')).toEqual(['hint_move'])
  })

  it('shows no hint the restored seen-set already holds', () => {
    const watched = watchedSession(HINT_TABLE.hints.map((hint) => hint.id))
    watched.mine(12, surfaceOreTiles(1)[0])
    watched.advanceTo(5 * GAP)
    expect(watched.shownIds()).toEqual([])
  })
})
