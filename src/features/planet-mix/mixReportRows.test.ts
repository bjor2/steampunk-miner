import { describe, expect, it } from 'vitest'
import type { RunEventData, RunEventName } from '../../logging/eventNames'
import { LOG_SCHEMA_VERSION, type RunEvent } from '../../logging/runEvent'
import { oreSalePrice } from '../../systems/economy/oreEconomy'
import { toCanonical } from '../../systems/money'
import { planetMixReportRows } from './mixReportRows'
import { oreMixFor, type OreMixEntry } from './systems/oreMix'

const WORLD_SEED = 83921
const PLANET = 12

let seq = 0

function line<N extends RunEventName>(planet: number, event: N, data: RunEventData<N>): RunEvent {
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
  } as RunEvent
}

function collected(entry: Pick<OreMixEntry, 'typeId' | 'family' | 'tier'>, depth: number) {
  return line(PLANET, 'resource_collected', {
    resourceTier: entry.tier,
    amount: 1,
    value: toCanonical(oreSalePrice(entry.tier)),
    oreId: entry.typeId,
    family: entry.family,
    signature: 'signature' in entry && entry.signature === true,
    oreDepthTiles: depth,
    chunk: '0,9',
  })
}

function rowsOf(events: readonly RunEvent[], planet = PLANET): Record<string, string> {
  const rows = planetMixReportRows.rowsOf(events, WORLD_SEED, planet)
  return Object.fromEntries(rows.map((row) => [row.label, row.value]))
}

const MIX = oreMixFor(PLANET, WORLD_SEED)
const [BAND_FOUR_TYPE] = MIX.bands[3]
const SIGNATURE = MIX.bands[4].find((entry) => entry.signature) as OreMixEntry

describe('planet mix report rows', () => {
  it("names each planet's ore theme from its act, across every act boundary", () => {
    const themes = [7, 8, 16, 17, 24, 25, 30, 32, 33, 40, 41, 45].map(
      (planet) => rowsOf([], planet)['ore theme'],
    )
    expect(themes).toEqual([
      'foothold.heavy',
      'fire',
      'fire',
      'frost',
      'frost',
      'lodestone',
      'lodestone',
      'lodestone',
      'hollow',
      'hollow',
      'fire',
      'foothold.heavy',
    ])
  })

  it('reports the depth each ore type was first collected at, signatures marked', () => {
    const rows = rowsOf([
      collected(BAND_FOUR_TYPE, 120),
      collected(BAND_FOUR_TYPE, 130),
      collected(SIGNATURE, 170),
    ])
    expect(rows['first sighting depth by ore type (tiles below the surface)']).toBe(
      `${BAND_FOUR_TYPE.typeId} 120, ${SIGNATURE.typeId} (signature) 170`,
    )
    expect(rows['signature units collected']).toBe('1 of 3')
  })

  it("finds no off-mix type or early family in the planet's own ores", () => {
    const rows = rowsOf(MIX.bands.flat().map((entry) => collected(entry, 100)))
    expect(rows['ore types off the planet mix']).toBe('none')
    expect(rows['families before their act']).toBe('none')
  })

  it('names a type off the mix and a family that came before its act', () => {
    const exotic = { ...BAND_FOUR_TYPE, typeId: `exotic_t${BAND_FOUR_TYPE.tier}`, family: 'exotic' }
    const rows = rowsOf([collected(BAND_FOUR_TYPE, 100), collected(exotic, 110)])
    expect(rows['ore types off the planet mix']).toBe(exotic.typeId)
    expect(rows['families before their act']).toBe('exotic')
  })

  it('reads only the lines of its own planet', () => {
    const elsewhere = { ...collected(SIGNATURE, 100), planet: PLANET + 1 }
    expect(Object.keys(rowsOf([elsewhere]))).toEqual(['ore theme'])
  })
})
