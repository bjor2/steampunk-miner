import { describe, expect, it } from 'vitest'
import { LOG_SCHEMA_VERSION, type RunEvent } from '../../logging/runEvent'
import { miningGatesReportRows } from './gateReportRows'

const WORLD_SEED = 83921

let seq = 0

function line(planet: number, event: string, data: Record<string, unknown>): RunEvent {
  seq += 1
  return {
    v: LOG_SCHEMA_VERSION,
    seq,
    tick: seq,
    timestamp: 0,
    runId: 'run_test',
    playerId: 'p1',
    planet,
    depthTiles: 0,
    event,
    data,
  } as unknown as RunEvent
}

const hit = (planet: number, gateKind: string, outcome: string) =>
  line(planet, 'gate_hit', { gateKind, outcome })
const cleared = (planet: number, gateKind: string) =>
  line(planet, 'mining-gates.gate_cleared', { gateKind, method: gateKind })
const lost = (planet: number, cause: string) =>
  line(planet, 'mining-gates.gate_ore_lost', { cause })

function rowsOf(events: RunEvent[], planet: number) {
  return Object.fromEntries(
    miningGatesReportRows.rowsOf(events, WORLD_SEED, planet).map((row) => [row.label, row.value]),
  )
}

describe('mining gates report rows', () => {
  it("counts a planet's gate hits, clears and losses by kind, zeros included", () => {
    const events = [
      hit(12, 'rig', 'refused'),
      hit(12, 'dynamite', 'refused'),
      hit(12, 'rig', 'lost'),
      cleared(12, 'dynamite'),
      cleared(12, 'dynamite'),
      cleared(12, 'drill'),
      lost(12, 'vented'),
      cleared(13, 'dynamite'),
    ]
    expect(rowsOf(events, 12)).toEqual({
      'gate hits by kind': 'drill 0, rig 2, dynamite 1',
      'gated cells cleared by kind': 'drill 1, rig 0, dynamite 2',
      'gated ore lost by cause': 'vented 1',
    })
  })

  it('prints zeros on a planet with gate content and no gate met, so a missing clear reads as 0', () => {
    expect(rowsOf([], 7)).toEqual({
      'gate hits by kind': 'drill 0, rig 0, dynamite 0',
      'gated cells cleared by kind': 'drill 0, rig 0, dynamite 0',
      'gated ore lost by cause': 'none',
    })
  })

  it('prints nothing before planet 7 unless a gate met the drill there', () => {
    expect(rowsOf([], 3)).toEqual({})
    expect(rowsOf([hit(3, 'drill', 'blocked')], 3)['gate hits by kind']).toBe(
      'drill 1, rig 0, dynamite 0',
    )
  })
})
