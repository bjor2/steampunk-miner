import { describe, expect, it } from 'vitest'
import type { AuthorityCommand } from '../systems/authority/authorityCommand'
import type { DomainEvent } from '../systems/authority/domainEvent'
import { div, fromSafeInteger, toCanonical } from '../systems/money'
import { NO_DRIVE } from '../systems/vehicle/driveSigns'
import { recordDomainEventsTo } from './domainEventLog'
import { createMemorySink } from './eventSink'
import { createRunLog } from './runLog'
import { createRunProgressSink } from './runProgress'

// The aggregated drill_cut line (ticket 335, TD scope b on #316): a drill step's per-cell
// TileDestroyed and CargoAdded stay per cell as domain events, but the run log writes one line
// for the step, so it grows with ticks and players, not with cells.

const PLACE = { playerId: 'p1', planet: 1, depthTiles: 12 }
const TEN = toCanonical(fromSafeInteger(10))
const FIFTEEN_AND_A_HALF = toCanonical(div(fromSafeInteger(31), fromSafeInteger(2)))
const TICK = 40

function commandAt(seq: number, type: 'drillStep' | 'reportPose'): AuthorityCommand {
  const drillStep = { type: 'drillStep' as const, payload: { x: 0, y: 0, drive: NO_DRIVE } }
  const base = { playerId: 'p1', tick: TICK, seq }
  return (type === 'drillStep' ? { ...base, ...drillStep } : { ...base, type }) as AuthorityCommand
}

/** What one drilling command answered: three broken cells, two of them ore that reached the hold. */
function drilledEvents(seq: number): DomainEvent[] {
  const stamp = { playerId: 'p1', tick: TICK, seq }
  const unit = { resourceTier: 1, amount: 1, oreId: 'copper', depthTiles: 12, chunk: '0,8' }
  return [
    { ...stamp, type: 'DrillDamageDealt', tx: 3, ty: 270, ticks: 1, damage: '1' },
    { ...stamp, type: 'TileDestroyed', tx: 3, ty: 270, kind: 'ground' },
    { ...stamp, type: 'TileDestroyed', tx: 3, ty: 269, kind: 'ore' },
    { ...stamp, type: 'CargoAdded', ...unit, value: TEN },
    { ...stamp, type: 'TileDestroyed', tx: 4, ty: 269, kind: 'ore' },
    { ...stamp, type: 'CargoAdded', ...unit, value: FIFTEEN_AND_A_HALF },
  ]
}

function logAfter(command: AuthorityCommand) {
  const sink = createMemorySink()
  const runLog = createRunLog({ runId: 'run_test', sink, secondsSinceStart: () => 0 })
  runLog.recordCommand(command)
  recordDomainEventsTo(runLog, PLACE, drilledEvents(command.seq))
  return sink.events
}

describe('drill_cut run-log line (ticket 335)', () => {
  it('logs one drill_cut line for a drill step, with its cells, units and their value', () => {
    const lines = logAfter(commandAt(7, 'drillStep'))
    expect(lines.map(({ event }) => event)).toEqual(['drill_damage_dealt', 'drill_cut'])
    expect(lines[1]).toMatchObject({
      tick: TICK,
      cmd: [TICK, 7],
      data: {
        cells: 3,
        units: 2,
        value: toCanonical(div(fromSafeInteger(51), fromSafeInteger(2))),
      },
    })
  })

  it('keeps the per-cell lines for every other drilling command', () => {
    const lines = logAfter(commandAt(7, 'reportPose'))
    expect(lines.map(({ event }) => event)).toEqual([
      'drill_damage_dealt',
      'tile_destroyed',
      'tile_destroyed',
      'resource_collected',
      'tile_destroyed',
      'resource_collected',
    ])
  })

  it('counts a drill_cut line into the run progress as its cells and units', () => {
    const progress = createRunProgressSink()
    for (const line of logAfter(commandAt(7, 'drillStep'))) progress.append(line)
    expect(progress.progress()).toMatchObject({ tilesDestroyed: 3, mineralsCollected: 2 })
  })
})
