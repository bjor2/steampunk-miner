import { describe, expect, it } from 'vitest'
import { LOCKED_SCHEDULE } from '../unlocks/unlockSchedule'
import { dockSiteOf, dockSiteTiles } from './dockSite'
import { planetParamsFor } from './planetParams'
import { DOCK_COUNTER_BUILDING_PLANETS } from './planetTable'
import { INDESTRUCTIBLE_CELL } from './worldCell'

const SEED = 83921

function padSpanOf(planetIndex: number): [number, number] {
  const site = dockSiteOf(planetParamsFor(SEED, planetIndex))
  return [site.firstColumn, site.lastColumn]
}

describe('dock site', () => {
  it('spans -8..+12 on planets 1 to 9, Refinery or not', () => {
    for (let planet = 1; planet <= 9; planet++) expect(padSpanOf(planet)).toEqual([-8, 12])
  })

  it('grows the pad 6 columns east at each counter building planet', () => {
    expect(padSpanOf(10)).toEqual([-8, 18])
    expect(padSpanOf(27)).toEqual([-8, 18])
    expect(padSpanOf(28)).toEqual([-8, 24])
    expect(padSpanOf(37)).toEqual([-8, 24])
    expect(padSpanOf(38)).toEqual([-8, 30])
    expect(padSpanOf(100)).toEqual([-8, 30])
  })

  it('gives the same pad for the same seed and planet', () => {
    expect(dockSiteOf(planetParamsFor(SEED, 12))).toEqual(dockSiteOf(planetParamsFor(SEED, 12)))
  })

  it('takes the counter planets from the locked schedule rows', () => {
    const planetOf = (id: string) => LOCKED_SCHEDULE.rows.find((row) => row.id === id)?.planetIndex
    expect(DOCK_COUNTER_BUILDING_PLANETS).toEqual([
      planetOf('merchants'),
      planetOf('quest_office'),
      planetOf('core_forge'),
    ])
  })

  it('stamps the indestructible pad over exactly its span', () => {
    const params = planetParamsFor(SEED, 1)
    const site = dockSiteOf(params)
    const padColumns = dockSiteTiles(params)
      .filter((tile) => tile.cell === INDESTRUCTIBLE_CELL)
      .map((tile) => tile.tx)
    expect(padColumns).toEqual(Array.from({ length: 21 }, (_, at) => site.firstColumn + at))
  })

  it('covers no more than a quarter of the surface columns on planets 1 to 100', () => {
    for (let planet = 1; planet <= 100; planet++) {
      const params = planetParamsFor(SEED, planet)
      const site = dockSiteOf(params)
      const padColumns = site.lastColumn - site.firstColumn + 1
      expect(padColumns * 4).toBeLessThanOrEqual(2 * params.radiusTiles + 1)
    }
  })
})
