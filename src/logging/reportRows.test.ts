import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../registries/registrar'
import type { SliceDefinition } from '../registries/sliceDefinition'
import type { RunEventData, RunEventName } from './eventNames'
import type { ReportRowSource } from './registries/reportRows'
import { reportRowLines, reportRowsOfRun, ReportRowRefusedError } from './reportRows'
import { LOG_SCHEMA_VERSION, type RunEvent } from './runEvent'

const WORLD_SEED = 83921

function line<N extends RunEventName>(
  planet: number,
  depthTiles: number,
  event: N,
  data: RunEventData<N>,
): RunEvent {
  return {
    v: LOG_SCHEMA_VERSION,
    seq: depthTiles,
    tick: depthTiles,
    timestamp: 0,
    runId: 'run_test',
    playerId: 'p1',
    planet,
    depthTiles,
    event,
    data,
  } as RunEvent
}

const TWO_PLANETS: readonly RunEvent[] = [
  line(1, 4, 'tile_destroyed', { tx: 3, ty: 290, kind: 'ground' }),
  line(1, 9, 'tile_destroyed', { tx: 3, ty: 285, kind: 'ground' }),
  line(2, 7, 'tile_destroyed', { tx: 5, ty: 300, kind: 'ground' }),
]

/** A probe slice reporting the deepest line it logged on each planet. */
const deepestTile: ReportRowSource = {
  id: 'probe.deepest',
  rowsOf: (events, worldSeed, planet) => [
    {
      label: `deepest tile on seed ${worldSeed}`,
      value: String(
        Math.max(...events.filter((e) => e.planet === planet).map((e) => e.depthTiles)),
      ),
    },
  ],
}

function probeSlice(source: ReportRowSource): SliceDefinition {
  return { id: 'probe', register: (r) => r.reportRows(source) }
}

describe('slice report rows (#223)', () => {
  it('asks a registered source for every planet the run logged, lowest first', () => {
    const rows = withRegistrations([probeSlice(deepestTile)], () =>
      reportRowsOfRun({ worldSeed: WORLD_SEED, events: TWO_PLANETS }),
    )
    expect(rows).toEqual([
      { planet: 1, sourceId: 'probe.deepest', label: 'deepest tile on seed 83921', value: '9' },
      { planet: 2, sourceId: 'probe.deepest', label: 'deepest tile on seed 83921', value: '7' },
    ])
  })

  it('prints each row in the balance report with its seed and planet', () => {
    const lines = withRegistrations([probeSlice(deepestTile)], () =>
      reportRowLines([{ worldSeed: WORLD_SEED, events: TWO_PLANETS }]),
    )
    expect(lines).toEqual([
      'seed 83921 · planet 1 · probe.deepest · deepest tile on seed 83921: 9',
      'seed 83921 · planet 2 · probe.deepest · deepest tile on seed 83921: 7',
    ])
  })

  it('reports nothing while no slice registers a source', () => {
    const lines = withRegistrations([], () =>
      reportRowLines([{ worldSeed: WORLD_SEED, events: TWO_PLANETS }]),
    )
    expect(lines).toEqual([])
  })

  it('refuses a row that reports a feature unlock, which stats.json and feature_unlocked own', () => {
    const unlockRow: ReportRowSource = {
      id: 'probe.unlocks',
      rowsOf: () => [{ label: 'unlocked', value: 'refinery_bay' }],
    }
    const report = () =>
      withRegistrations([probeSlice(unlockRow)], () =>
        reportRowsOfRun({ worldSeed: WORLD_SEED, events: TWO_PLANETS }),
      )
    expect(report).toThrow(ReportRowRefusedError)
    expect(report).toThrow(/refinery_bay/)
  })
})
