import { describe, expect, it } from 'vitest'
import type { CommandIntent } from '../../../systems/authority/authorityCommand'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { createScriptedSession } from '../../../systems/authority/scriptedSession'
import type { ScriptedCommand } from '../../../systems/fastForward'
import { ofType } from '../drillGearTestSession'
import { TWIN_BIT_ID } from './twinBit'
import {
  diagonalCellOnStep,
  DIAGONAL_STEPS,
  TWIN_BIT_DIAGONAL_PLANET,
  twinBitDiagonalScriptOf,
  type DiagonalBore,
} from './twinBitDiagonal'

// The scenario `drill-gear.twin-bit-diagonal` (GD lock on #257, ticket 281), played as the debug
// API's `fastForward` plays it: advance to each command's tick, then submit it.

function playScript(commands: readonly ScriptedCommand[]) {
  const session = createScriptedSession()
  for (const { tick, ...intent } of commands) {
    session.advanceTo(tick)
    session.submit(tick, intent as CommandIntent)
  }
  return session
}

type DiagonalCellCut = Extract<DomainEvent, { type: 'drill-gear.DiagonalCellCut' }>

/** Facing down, the facing's left is the vehicle's local right (`aheadBearingLatch.ts`). */
const LOGGED_BEARING_OF = { 'down-right': 'left', 'down-left': 'right' } as const

function diagonalCutsOf(events: readonly DomainEvent[]) {
  return ofType(events, 'drill-gear.DiagonalCellCut')
    .map((event) => event as DiagonalCellCut)
    .map(({ tx, ty, bearing }) => ({ tx, ty, bearing }))
}

function expectedCutsOf(bore: DiagonalBore) {
  return Array.from({ length: DIAGONAL_STEPS }, (_, step) => ({
    ...diagonalCellOnStep(bore, step),
    bearing: LOGGED_BEARING_OF[bore.side],
  }))
}

describe('twin-bit diagonal scenario', () => {
  const script = twinBitDiagonalScriptOf(1)
  const session = playScript(script.commands)

  it('starts on planet 19 with the twin-bit head in drill.head', () => {
    expect(session.state().planet.index).toBe(TWIN_BIT_DIAGONAL_PLANET)
    expect(session.vehicle().loadout.slots['drill.head']).toBe(TWIN_BIT_ID)
  })

  it('cuts one down-right and one down-left bore', () => {
    expect(script.bores.map((bore) => bore.side)).toEqual(['down-right', 'down-left'])
  })

  it('leaves 45-degree bores, each cell one column over and one row lower than the last', () => {
    expect(diagonalCutsOf(session.events())).toEqual(script.bores.flatMap(expectedCutsOf))
  })

  it('is refused nowhere on the way', () => {
    expect(ofType(session.events(), 'CommandRejected')).toEqual([])
    expect(ofType(session.events(), 'DrillGated')).toEqual([])
  })

  it('ends on its last command', () => {
    expect(script.endTick).toBe(script.commands[script.commands.length - 1].tick)
  })
})
