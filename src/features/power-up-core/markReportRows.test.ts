import { describe, expect, it } from 'vitest'
import { TICKS_PER_SECOND } from '../../constants/physics'
import { reportRowsOfRun } from '../../logging/reportRows'
import { LOG_SCHEMA_VERSION, type RunEvent } from '../../logging/runEvent'
import { MARK_REPORT_ROWS } from './markReportRows'

const WORLD_SEED = 83921
const MINUTE = 60 * TICKS_PER_SECOND

function line(planet: number, tick: number, event: string, data: object = {}): RunEvent {
  return {
    v: LOG_SCHEMA_VERSION,
    seq: tick,
    tick,
    timestamp: 0,
    runId: 'run_marks',
    playerId: 'p1',
    planet,
    depthTiles: 0,
    event,
    data,
  } as unknown as RunEvent
}

const researched = (planet: number, tick: number, kind: string, cost: string) =>
  line(planet, tick, 'tech-tree.tech_node_unlocked', {
    nodeId: 'tech.mark.power.steam_boost.2',
    lane: 'mobility',
    kind,
    mark: 2,
    cost,
  })

const used = (planet: number, tick: number, mark: number) =>
  line(planet, tick, 'power-up-core.power_up_used', {
    itemId: 'power.grav_anchor',
    mark,
    slot: 'powerup.1',
    origin: { tx: 0, ty: 0 },
    chargesLeft: 0,
  })

/** P3: no power-up used. P4: four uses after the P3 Marks. P5: no core. */
const RUN: readonly RunEvent[] = [
  line(3, 0, 'planet_entered', { planetSeed: 1, generatorVersion: 1, radius: 100 }),
  researched(3, 100, 'mark', '1200'),
  researched(3, 110, 'capability', '500'),
  researched(3, 120, 'mark', '300'),
  line(3, 50 * MINUTE, 'core_completed', { durationTicks: 1 }),
  line(4, 51 * MINUTE, 'planet_entered', { planetSeed: 1, generatorVersion: 1, radius: 100 }),
  used(4, 52 * MINUTE, 4),
  used(4, 53 * MINUTE, 2),
  used(4, 54 * MINUTE, 0),
  used(4, 55 * MINUTE, 4),
  line(4, 99 * MINUTE, 'core_completed', { durationTicks: 1 }),
  line(5, 100 * MINUTE, 'planet_entered', { planetSeed: 1, generatorVersion: 1, radius: 100 }),
]

const rowsOn = (planet: number) => MARK_REPORT_ROWS.rowsOf(RUN, WORLD_SEED, planet)

describe('power-up marks report rows', () => {
  it('counts the Marks researched on a planet and what they cost, capabilities left out', () => {
    expect(rowsOn(3)[0]).toEqual({ label: 'Mark research (nodes · spend)', value: '2 · 1,500' })
    expect(rowsOn(4)[0].value).toBe('0 · 0')
  })

  it('counts the uses that acted above Mark 1 on a planet, by Mark', () => {
    expect(rowsOn(3)[1]).toEqual({ label: 'uses above Mark 1 (by Mark)', value: 'none' })
    expect(rowsOn(4)[1].value).toBe('3 (Mark 2 ×1, Mark 4 ×2)')
  })

  it('puts the same core time beside the pin when no power-up acted before the core', () => {
    expect(rowsOn(3)[2]).toEqual({
      label: 'core with Marks · Marks off',
      value: '50.0 min · 50.0 min (no power-up used)',
    })
  })

  it('says this run cannot tell the Marks-off time once a power-up acted with Marks researched', () => {
    expect(rowsOn(4)[2].value).toBe(
      '48.0 min · not this run (4 power-up uses with Marks researched)',
    )
  })

  it('prints no core row for a planet whose core the run never completed', () => {
    expect(rowsOn(5)).toHaveLength(2)
  })

  it('names no feature-unlock row, so the report keeps every row on the loaded slices', () => {
    const rows = reportRowsOfRun({ worldSeed: WORLD_SEED, events: RUN })
    expect(rows.filter((row) => row.sourceId === 'power-up-core.marks')).toHaveLength(8)
  })
})
