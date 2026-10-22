import { beforeEach, describe, expect, it } from 'vitest'
import { resetGameStore, useGameStore } from '../../../store/gameStore'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { CLICK_CHAIN } from '../../../systems/authority/purchaseChain'
import { createScriptedSession, dockInBay } from '../../../systems/authority/scriptedSession'
import { buyGunCommand, buyUpgradeCommand } from '../../../systems/platform/platformCommands'
import { grantMoneyCommand } from '../../../systems/startScenarioCommands'
import { REVEAL } from '../systems/revealData'
import { resetRevealStore, useRevealStore } from './revealStore'

// The unlock reveal's store (ticket 718): a new capability bought starts the reveal and steps a
// phone's full sheet aside; the reveal ends on time, on a tap or on leaving the dock, and the
// sheet comes back on its tab.

const reveal = () => useRevealStore.getState()
const game = () => useGameStore.getState()

function dockedRich() {
  const session = createScriptedSession()
  session.submit(1, grantMoneyCommand('1e30'))
  dockInBay(session, 2, 'upgrade')
  return session
}

function hearTurretMount(): void {
  reveal().hearRevealBatch(dockedRich().submit(5, buyGunCommand(CLICK_CHAIN)), 'p1')
}

const LEFT_DOCK: DomainEvent = {
  type: 'DockLeft',
  bay: 'upgrade',
  durationTicks: 20,
  playerId: 'p1',
  tick: 25,
  seq: 9,
}

beforeEach(() => {
  resetGameStore()
  resetRevealStore()
})

describe('unlock reveal store', () => {
  it('starts the reveal on a new capability and steps the full sheet aside', () => {
    hearTurretMount()
    expect(reveal().reveal?.revealed.name).toBe('Guns')
    expect(game().isSheetSteppedAside).toBe(true)
  })

  it('starts nothing on a stat step and leaves the sheet where it is', () => {
    const events = dockedRich().submit(5, buyUpgradeCommand('hull', CLICK_CHAIN))
    reveal().hearRevealBatch(events, 'p1')
    expect(reveal().reveal).toBeNull()
    expect(game().isSheetSteppedAside).toBe(false)
  })

  it('skips on a tap and brings the sheet back', () => {
    hearTurretMount()
    reveal().skipReveal()
    expect(reveal().reveal).toBeNull()
    expect(game().isSheetSteppedAside).toBe(false)
  })

  it('ends once its time has run, and not a tick before', () => {
    hearTurretMount()
    const { endTick } = reveal().reveal!
    reveal().advanceRevealTo(endTick - 1)
    expect(reveal().reveal).not.toBeNull()
    reveal().advanceRevealTo(endTick)
    expect(reveal().reveal).toBeNull()
    expect(game().isSheetSteppedAside).toBe(false)
  })

  it('ends when the rig leaves the dock', () => {
    hearTurretMount()
    reveal().hearRevealBatch([LEFT_DOCK], 'p1')
    expect(reveal().reveal).toBeNull()
  })

  it('drops a reveal a restore took back to before its buy', () => {
    hearTurretMount()
    reveal().advanceRevealTo(reveal().reveal!.startTick - 1)
    expect(reveal().reveal).toBeNull()
  })

  it.each([30, 144])('shows for the same ticks at %i frames a second', (framesPerSecond) => {
    hearTurretMount()
    const { startTick, endTick } = reveal().reveal!
    const shownTicks = framesUntilEnded(startTick, framesPerSecond)
    expect(Math.max(...shownTicks)).toBeLessThan(endTick)
    expect(Math.max(...shownTicks)).toBeGreaterThanOrEqual(
      endTick - Math.ceil(60 / framesPerSecond),
    )
    expect(endTick - startTick).toBe(REVEAL.revealTicks)
  })
})

/** Steps the store once a frame on the 60 Hz authority tick; the ticks the reveal was shown at. */
function framesUntilEnded(startTick: number, framesPerSecond: number): number[] {
  const shown: number[] = []
  for (let frame = 0; reveal().reveal !== null; frame += 1) {
    const tick = startTick + Math.floor((frame * 60) / framesPerSecond)
    reveal().advanceRevealTo(tick)
    if (reveal().reveal !== null) shown.push(tick)
  }
  return shown
}

describe('unlock reveal store: the debug hold', () => {
  it('keeps a held reveal past its time until a tap', () => {
    hearTurretMount()
    reveal().holdReveal()
    reveal().advanceRevealTo(reveal().reveal!.endTick + 600)
    expect(reveal().reveal).not.toBeNull()
    reveal().skipReveal()
    expect(reveal().reveal).toBeNull()
  })

  it('lets time end it again once let run', () => {
    hearTurretMount()
    reveal().holdReveal()
    reveal().letRevealRun()
    reveal().advanceRevealTo(reveal().reveal!.endTick)
    expect(reveal().reveal).toBeNull()
  })
})
