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
import { UPGRADE_IDS } from '../economy/economyDefinition'
import { upgradePrice } from '../economy/upgradePrices'
import { cmp, fromCanonical, sub, toCanonical } from '../money'
import { dockCommand, undockCommand } from '../platform/platformCommands'
import { dockedPoseAt, FACING } from '../vehicle/vehiclePose'
import { EMPTY_HINT_BOARD, observeHints, type HintStep } from './hintBoard'
import { HINT_TABLE } from './hintTable'

const GAP = HINT_TABLE.minTicksBetweenHints

/** The cheapest first level of any track; the casing grade (48) costs more. */
function cheapestLevel0Price() {
  const prices = UPGRADE_IDS.map((upgradeId) => upgradePrice(upgradeId, 0, 1))
  return prices.reduce((cheapest, price) => (cmp(price, cheapest) < 0 ? price : cheapest))
}

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

  it('takes hint_dock down when the player leaves the Sell bay', () => {
    const watched = watchedSession(['hint_move', 'hint_drill', 'hint_cargo'])
    watched.mine(12, surfaceOreTiles(1)[0])
    watched.submit(60, restOnDockPoint())
    watched.submit(70, dockCommand('sell'))
    expect(watched.step().board.shown?.id).toBe('hint_dock')
    watched.submit(85, undockCommand())
    expect(watched.step().board.shown).toBeNull()
  })

  it('points hint_dock at the Sell bay: docking with cargo at the Upgrade bay does not show it', () => {
    const watched = watchedSession(['hint_move', 'hint_drill', 'hint_cargo'])
    watched.mine(12, surfaceOreTiles(1)[0])
    watched.submit(60, poseInBay('upgrade'))
    watched.submit(70, dockCommand('upgrade'))
    expect(watched.step().board.shown).toBeNull()
    expect(watched.step().board.queued).toEqual([])
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

describe('hint board: the Upgrade bay hint (#58)', () => {
  const EARLY_HINTS = ['hint_move', 'hint_drill', 'hint_cargo', 'hint_dock']
  const grant = (amount: string) => ({ type: 'debug.grantMoney', payload: { amount } }) as const

  /** Docked at the Sell bay with `money`, the earlier hints already seen. */
  function atSellBayWith(money: string) {
    const watched = watchedSession(EARLY_HINTS)
    watched.submit(5, grant(money))
    watched.submit(10, dockCommand('sell'))
    return watched
  }

  it('fires once when money covers the cheapest upgrade while docked at the Sell bay', () => {
    const watched = atSellBayWith('24')
    expect(watched.step().board.shown?.id).toBe('hint_upgrade_bay')
    watched.submit(20, undockCommand())
    watched.submit(30, dockCommand('sell'))
    expect(watched.shownIds()).toEqual(['hint_upgrade_bay'])
    expect(watched.step().seen).toEqual([...EARLY_HINTS, 'hint_upgrade_bay'])
  })

  it('waits while the money is short of every upgrade and of the next casing grade', () => {
    const watched = atSellBayWith(toCanonical(sub(cheapestLevel0Price(), fromCanonical('0.001'))))
    expect(watched.step().board.shown).toBeNull()
    expect(watched.step().board.queued).toEqual([])
  })

  it('never fires at the Upgrade bay, however much money there is', () => {
    const watched = watchedSession(EARLY_HINTS)
    watched.submit(5, grant('1e9'))
    watched.submit(6, poseInBay('upgrade'))
    watched.submit(10, dockCommand('upgrade'))
    expect(watched.step().board.shown).toBeNull()
    expect(watched.step().board.queued).toEqual([])
  })

  it('counts the next casing grade: casing alone can fire it when every track costs more', () => {
    const watched = watchedSession(EARLY_HINTS)
    for (const upgradeId of [
      'drill_power',
      'drill_tip',
      'engine',
      'boiler',
      'cargo_hold',
      'hull',
    ]) {
      watched.submit(1, { type: 'debug.setUpgrade', payload: { upgradeId, level: 6 } })
    }
    watched.submit(5, grant('48'))
    watched.submit(10, dockCommand('sell'))
    expect(watched.step().board.shown?.id).toBe('hint_upgrade_bay')
  })

  it('goes down once the vehicle is docked at the Upgrade bay', () => {
    const watched = atSellBayWith('100')
    watched.submit(20, undockCommand())
    watched.submit(20, poseInBay('upgrade'))
    expect(watched.step().board.shown?.id).toBe('hint_upgrade_bay')
    watched.submit(21, dockCommand('upgrade'))
    expect(watched.step().board.shown).toBeNull()
  })
})
