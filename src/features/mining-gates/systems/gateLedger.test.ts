import { describe, expect, it } from 'vitest'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { oreSalePrice } from '../../../systems/economy/oreEconomy'
import { toCanonical } from '../../../systems/money'
import { saleTierOf } from '../../../systems/registries/oreTypes'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { recordDomainEventsTo } from '../../../logging/domainEventLog'
import { createMemorySink } from '../../../logging/eventSink'
import { createRunLog } from '../../../logging/runLog'
import { runEventProblems } from '../../../logging/runEventSchema'
import { paramsOn, sessionOn, worldCellOfGate } from './gateFixtures'
import { gateLedger } from './gateLedger'
import type { CellGate, CellGateKind } from './gateTable'

const TICK = 50

function destroyed(tile: TilePoint, cause?: 'blast'): DomainEvent {
  return {
    type: 'TileDestroyed',
    ...tile,
    kind: 'ore',
    ...(cause === undefined ? {} : { cause }),
    tick: TICK,
    playerId: 'p1',
  }
}

function lostAt(tile: TilePoint): DomainEvent {
  return {
    type: 'DrillGated',
    ...tile,
    oreId: 'any',
    family: 'any',
    tier: 1,
    gateKind: 'rig',
    outcome: 'lost',
    required: 'rig.containment',
    have: 'none',
    tick: TICK,
    playerId: 'p1',
  }
}

/** What the ledger records for a planet's first generated cell of `kind`, heard as `heard(tile)`. */
function ledgerOf(
  planet: number,
  kind: CellGateKind,
  heard: (tile: TilePoint) => DomainEvent[],
  also: (gate: CellGate) => boolean = () => true,
) {
  const session = sessionOn(planet)
  const found = worldCellOfGate(paramsOn(session), (gate) => gate.kind === kind && also(gate))
  const before = session.state()
  return { found, events: gateLedger.react(before, before, heard(found.tile)).events }
}

describe('gate ledger', () => {
  it('records a dense cell the drill broke as cleared by the drill, at its sale price', () => {
    const { found, events } = ledgerOf(7, 'dense', (tile) => [destroyed(tile)])
    expect(events).toEqual([
      {
        type: 'mining-gates.GateCleared',
        ...found.tile,
        oreId: found.ore.id,
        tier: found.ore.tier,
        gateKind: 'drill',
        method: 'drill',
        units: 1,
        value: toCanonical(oreSalePrice(saleTierOf(found.ore))),
      },
    ])
  })

  it('records a shell a charge broke as cleared by dynamite', () => {
    const { events } = ledgerOf(7, 'dynamite', (tile) => [destroyed(tile, 'blast')])
    expect(events).toEqual([
      expect.objectContaining({ gateKind: 'dynamite', method: 'dynamite', units: 1 }),
    ])
  })

  it('records an extractor-gated cell the drill broke as cleared with the extractor', () => {
    const { events } = ledgerOf(7, 'rig', (tile) => [destroyed(tile)])
    expect(events).toEqual([expect.objectContaining({ gateKind: 'rig', method: 'rig' })])
  })

  it('records a containment cell lost without the hood as vented ore', () => {
    const { found, events } = ledgerOf(
      12,
      'rig',
      (tile) => [destroyed(tile), lostAt(tile)],
      isContainment,
    )
    expect(events).toEqual([
      {
        type: 'mining-gates.GateOreLost',
        ...found.tile,
        oreId: found.ore.id,
        tier: found.ore.tier,
        units: 1,
        cause: 'vented',
      },
    ])
  })

  it('records nothing for an ungated cell', () => {
    expect(ledgerOf(7, 'none', (tile) => [destroyed(tile)]).events).toEqual([])
  })

  it('logs both lines with every field the run-event schema asks for', () => {
    const cleared = ledgerOf(7, 'dense', (tile) => [destroyed(tile)]).events
    const lost = ledgerOf(12, 'rig', (tile) => [destroyed(tile), lostAt(tile)], isContainment)
    const lines = linesOf([...cleared, ...lost.events].map((body) => ({ ...body, tick: TICK })))
    expect(lines.map((line) => line.event)).toEqual([
      'mining-gates.gate_cleared',
      'mining-gates.gate_ore_lost',
    ])
    expect(lines.flatMap(runEventProblems)).toEqual([])
  })
})

function linesOf(events: readonly DomainEvent[]) {
  const sink = createMemorySink()
  const runLog = createRunLog({ runId: 'run_236', sink, secondsSinceStart: () => 0 })
  recordDomainEventsTo(runLog, { playerId: 'p1', planet: 7, depthTiles: 0 }, events)
  return sink.events
}

function isContainment(gate: CellGate): boolean {
  return gate.kind === 'rig' && gate.rig.id === 'rig.containment'
}
