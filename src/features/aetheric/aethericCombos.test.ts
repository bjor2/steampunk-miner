import { describe, expect, it } from 'vitest'
import { recordDomainEventsTo } from '../../logging/domainEventLog'
import { createMemorySink } from '../../logging/eventSink'
import { createRunLog } from '../../logging/runLog'
import { runEventProblems } from '../../logging/runEventSchema'
import type { DomainEvent } from '../../systems/authority/domainEvent'
import { setVehicleLoadoutCommand } from '../../systems/authority/loadoutCommands'
import { createScriptedSession } from '../../systems/authority/scriptedSession'
import { comboItemOf } from '../combos'
import {
  AETHERIC_COMBO_IDS,
  isComboInPlay,
  PENDULUM_ANCHOR_ID,
  QUENCH_CUTTERS_ID,
  STILL_FOAM_ID,
  WARNING_CHIME_ID,
} from './systems/aethericCombos'

// The aetheric pair combos' ownership rule and log lines (ticket 373; the Horizontal Scaler's rule
// in the GD ruling of 14 Oct): a combo resolves only while the player owns it and both its parent
// items, and each combo use logs one `aetheric.*` line beside the `power_up_used` of its use.

function stateOwning(owned: readonly string[]) {
  const session = createScriptedSession()
  session.submit(0, setVehicleLoadoutCommand({}, owned))
  return session.state()
}

function linesOf(events: readonly DomainEvent[]) {
  const sink = createMemorySink()
  const runLog = createRunLog({ runId: 'run_373', sink, secondsSinceStart: () => 0 })
  recordDomainEventsTo(runLog, { playerId: 'p1', planet: 41, depthTiles: 0 }, events)
  return sink.events
}

const COMBO_EVENTS: readonly DomainEvent[] = [
  {
    tick: 7,
    type: 'aetheric.FoamStilled',
    playerId: 'p1',
    itemId: STILL_FOAM_ID,
    blocks: 2,
    lastTick: 250,
  },
  {
    tick: 7,
    type: 'aetheric.WarningChimed',
    playerId: 'p1',
    itemId: WARNING_CHIME_ID,
    enemyId: 'enemy-1',
    tx: 14,
    ty: 297,
  },
  {
    tick: 7,
    type: 'aetheric.PendulumSwung',
    playerId: 'p1',
    itemId: PENDULUM_ANCHOR_ID,
    tx: 20,
    ty: 297,
  },
  {
    tick: 7,
    type: 'aetheric.CuttersQuenched',
    playerId: 'p1',
    itemId: QUENCH_CUTTERS_ID,
    heat: 400,
    energy: 100,
  },
]

describe('aetheric pair combos: ownership', () => {
  it('plays a combo only while the player owns it and both its parent items', () => {
    AETHERIC_COMBO_IDS.forEach((comboId) => {
      const parents = comboItemOf(comboId)?.parentItemIds ?? []
      expect(parents, comboId).toHaveLength(2)
      expect(isComboInPlay(stateOwning([comboId, ...parents]), 'p1', comboId), comboId).toBe(true)
      expect(isComboInPlay(stateOwning(parents), 'p1', comboId), comboId).toBe(false)
      parents.forEach((parent) => {
        const withoutParent = [comboId, ...parents.filter((other) => other !== parent)]
        expect(isComboInPlay(stateOwning(withoutParent), 'p1', comboId), parent).toBe(false)
      })
    })
  })

  it('plays nothing for a player who is not in the game', () => {
    expect(isComboInPlay(stateOwning([STILL_FOAM_ID]), 'p9', STILL_FOAM_ID)).toBe(false)
  })
})

describe('aetheric pair combos: log lines', () => {
  it('logs each combo use as one aetheric line within the run-event schema', () => {
    const lines = linesOf(COMBO_EVENTS)
    expect(lines.map((line) => line.event)).toEqual([
      'aetheric.foam_stilled',
      'aetheric.warning_chimed',
      'aetheric.pendulum_swung',
      'aetheric.cutters_quenched',
    ])
    expect(lines.flatMap(runEventProblems)).toEqual([])
  })
})
