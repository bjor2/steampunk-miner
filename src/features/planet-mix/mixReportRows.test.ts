import { describe, expect, it } from 'vitest'
import type { DomainEvent } from '../../systems/authority/domainEvent'
import { oreSalePrice } from '../../systems/economy/oreEconomy'
import { toCanonical } from '../../systems/money'
import { planetMixReportRows } from './mixReportRows'
import { oreMixFor, type OreMixEntry } from './systems/oreMix'

const WORLD_SEED = 83921
const PLANET = 12

let seq = 0

/** One unit drilled into the hold, as its domain event names it (ticket 420). */
function collected(entry: Pick<OreMixEntry, 'typeId' | 'family' | 'tier'>, depth: number) {
  seq += 1
  return {
    playerId: 'p1',
    tick: seq,
    seq,
    type: 'CargoAdded',
    resourceTier: entry.tier,
    amount: 1,
    value: toCanonical(oreSalePrice(entry.tier)),
    oreId: entry.typeId,
    family: entry.family,
    signature: 'signature' in entry && entry.signature === true,
    depthTiles: depth,
    chunk: '0,9',
  } satisfies DomainEvent
}

function rowsOf(planetEvents: readonly DomainEvent[], planet = PLANET): Record<string, string> {
  const rows = planetMixReportRows.rowsOf([], WORLD_SEED, planet, planetEvents)
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

  it('has only the theme row when the run kept no domain events', () => {
    expect(Object.keys(rowsOf([]))).toEqual(['ore theme'])
  })
})
