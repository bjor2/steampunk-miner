import { describe, expect, it } from 'vitest'
import type { RunEventData, RunEventName } from '../../logging/eventNames'
import { LOG_SCHEMA_VERSION, type RunEvent } from '../../logging/runEvent'
import { oreSalePrice, oreTier } from '../../systems/economy/oreEconomy'
import { toCanonical } from '../../systems/money'
import { bandOfTile } from '../../systems/world/planetGeometry'
import { planetParamsFor } from '../../systems/world/planetParams'
import type { TilePoint } from '../../systems/world/tileGrid'
import { oreReportRows } from './oreReportRows'

const WORLD_SEED = 83921
const PLANET = 3

let seq = 0

function line<N extends RunEventName>(tick: number, event: N, data: RunEventData<N>): RunEvent {
  seq += 1
  return {
    v: LOG_SCHEMA_VERSION,
    seq,
    tick,
    timestamp: 0,
    runId: 'run_test',
    playerId: 'p1',
    planet: PLANET,
    depthTiles: 0,
    event,
    data,
  } as RunEvent
}

/** The tiles of a band down the planet's middle column, from its top. */
function tilesOfBand(band: number): TilePoint[] {
  const params = planetParamsFor(WORLD_SEED, PLANET)
  return Array.from({ length: params.radiusTiles }, (_, at) => ({ tx: 0, ty: at }))
    .filter(({ tx, ty }) => bandOfTile(params, tx, ty) === band)
    .reverse()
}

/** One ore tile drilled for `ticks` (none: blasted) and its unit at `band`'s tier plus `lead`. */
function minedUnit(tick: number, tile: TilePoint, band: number, lead: number, ticks: number) {
  const tier = oreTier(PLANET, band) + lead
  return [
    ...(ticks > 0 ? [line(tick, 'drill_damage_dealt', { ...tile, ticks, damage: '1e+0' })] : []),
    line(tick, 'tile_destroyed', { ...tile, kind: 'ore' }),
    line(tick, 'resource_collected', {
      resourceTier: tier,
      amount: 1,
      value: toCanonical(oreSalePrice(tier)),
      oreId: `metal_t${tier}`,
      family: 'metal',
      signature: false,
      oreDepthTiles: 300 - tile.ty,
      chunk: '0,9',
    }),
  ]
}

function rowsOf(events: readonly RunEvent[]): Record<string, string> {
  const rows = oreReportRows.rowsOf(events, WORLD_SEED, PLANET)
  return Object.fromEntries(rows.map((row) => [row.label, row.value]))
}

const [B4_FIRST, B4_SECOND] = tilesOfBand(4)
const [B5_FIRST, B5_SECOND, B5_THIRD, B5_FOURTH] = tilesOfBand(5)
const PREVIEW_TIER = oreTier(PLANET, 4) + 2

describe('ore report rows', () => {
  it('reports the depth each tier was first collected at', () => {
    const rows = rowsOf([
      ...minedUnit(10, B4_FIRST, 4, 0, 30),
      ...minedUnit(20, B4_SECOND, 4, 0, 30),
      ...minedUnit(30, B5_FIRST, 5, 0, 30),
    ])
    expect(rows['first sighting depth by tier (tiles below the surface)']).toBe(
      `t${oreTier(PLANET, 4)} ${300 - B4_FIRST.ty}, t${oreTier(PLANET, 5)} ${300 - B5_FIRST.ty}`,
    )
  })

  it("says whether band 4's +2 tier was collected before the core was reached", () => {
    const preview = minedUnit(50, B4_FIRST, 4, 2, 30)
    const coreAt = (tick: number) => line(tick, 'core_reached', {})
    const label = `tier ${PREVIEW_TIER} collected before the core`
    expect(rowsOf([...preview, coreAt(60)])[label]).toBe('yes')
    expect(rowsOf([coreAt(40), ...preview])[label]).toBe('no')
  })

  it('counts the +1 and +2 units of each band, read from the tile and the tier', () => {
    const rows = rowsOf([
      ...minedUnit(10, B4_FIRST, 4, 1, 30),
      ...minedUnit(20, B5_FIRST, 5, 0, 30),
      ...minedUnit(30, B5_SECOND, 5, 2, 30),
      ...minedUnit(40, B5_THIRD, 5, 1, 0),
    ])
    expect(rows['lead units by band (+1 / +2 of all)']).toBe('b4 1 / 0 of 1, b5 1 / 1 of 3')
  })

  it("prints each band's mean value per unit over V(t_b) beside #140's multiplier", () => {
    const rows = rowsOf([
      ...minedUnit(10, B4_FIRST, 4, 0, 30),
      ...minedUnit(20, B4_SECOND, 4, 2, 30),
    ])
    expect(rows['mean value per unit over V(t_b) by band (expected)']).toBe('b4 x1.625 (x1.065)')
  })

  it("prints band 5's median drill ticks per tile by lead, blasted tiles left out", () => {
    const rows = rowsOf([
      ...minedUnit(10, B5_FIRST, 5, 0, 30),
      line(15, 'drill_damage_dealt', { ...B5_SECOND, ticks: 20, damage: '1e+0' }),
      ...minedUnit(20, B5_SECOND, 5, 1, 18),
      ...minedUnit(30, B5_THIRD, 5, 2, 0),
      ...minedUnit(40, B5_FOURTH, 5, 0, 34),
    ])
    expect(rows['band 5 median drill ticks per tile by lead (H ratio)']).toBe(
      '+0 32 (x1.000), +1 38 (x1.254), +2 - (x1.574)',
    )
  })

  it('has no rows for a planet with no ore collected', () => {
    expect(oreReportRows.rowsOf([line(1, 'core_reached', {})], WORLD_SEED, PLANET)).toEqual([])
  })
})
