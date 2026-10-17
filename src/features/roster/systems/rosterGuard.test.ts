import { describe, expect, it } from 'vitest'
import { freshPlanetParamsFor, type PlanetParams } from '../../../systems/world/planetParams'
import { BAND_COUNT } from '../../../systems/world/planetGeometry'
import type { ResourceFamily } from '../../../systems/world/worldCell'
import { oreFamilies, ORE_ROWS, rarityTiers } from '../../ores'
import { oreMixOf } from '../../planet-mix'
import { planetRosterOf } from './planetRoster'
import { liveRosterIndicesOf } from './rosterFold'

// Systems' family-first rule on ticket 446 (6226198316), with the Vertical Scaler's bounds
// (6226208534) and the TD's test list (6226236698 section 5 C): a kind's share of a band trip is
// `tierShare x familyShare / nLive`, every painted (band, tier, family) cell has
// `nLive >= max(1, ceil(tierShareBp x familyShareBp / 10000 / boundBp))` live kinds, and the bounds
// are asserts on the real roster. Checked on every planet whose roster holds kinds (P1 and P2 while
// the mixed table is empty; P3 to P5 join when Systems attaches it).

const SEED = 83921
const PLANETS = [1, 2, 3, 4, 5]
const BANDS = Array.from({ length: BAND_COUNT }, (_, at) => at + 1)
const BASIS_POINTS = 10000
/** Common kind: at most 5000 bp of a band trip; any other kind at most 1500 bp (VS bounds). */
const COMMON_BOUND_BP = 5000
const RARE_BOUND_BP = 1500
const MEAN_TOLERANCE_BP = 0.5

/** One painted (band, lead, family) cell of the planet's mix with its live kinds. */
interface PaintedCell {
  band: number
  lead: number
  family: string
  /** Its share of the band's ore patches, in basis points (fractional on P1 and P2). */
  weightBp: number
  nLive: number
}

function paintedCellsOf(params: PlanetParams): PaintedCell[] {
  return oreMixOf(params).bands.flatMap((entries, at) =>
    mergedByFamilyAndLead(entries).map(({ family, lead, weightBp }) => ({
      band: at + 1,
      lead,
      family,
      weightBp,
      nLive: liveRosterIndicesOf(params, at + 1, { family: codeOf(family), tierOffset: at + lead })
        .length,
    })),
  )
}

function codeOf(family: string): ResourceFamily {
  return (oreFamilies().find((row) => row.id === family)?.cellCode ?? 0) as ResourceFamily
}

/** A signature entry shares its cell with a lead entry of its family and tier, if any. */
function mergedByFamilyAndLead(
  entries: readonly { family: string; lead: number; weightBp: number }[],
): { family: string; lead: number; weightBp: number }[] {
  const merged = new Map<string, { family: string; lead: number; weightBp: number }>()
  for (const { family, lead, weightBp } of entries) {
    const key = `${family}:${lead}`
    const kept = merged.get(key)
    merged.set(key, { family, lead, weightBp: (kept?.weightBp ?? 0) + weightBp })
  }
  return [...merged.values()]
}

/** `1.5^lead`, the value multiplier of the cell's rarity over its band's own ore. */
function valueRatioOf(lead: number): number {
  return 1.5 ** lead
}

/** The band's mean ore value over its own tier's, from its painted cells. */
function bandMeanOf(cells: readonly PaintedCell[], band: number): number {
  const ofBand = cells.filter((cell) => cell.band === band)
  return (
    ofBand.reduce((sum, cell) => sum + cell.weightBp * valueRatioOf(cell.lead), 0) / BASIS_POINTS
  )
}

/** Each live kind's share of the band trip's value, in basis points, unrounded. */
function kindTripShareBpOf(cells: readonly PaintedCell[], cell: PaintedCell): number {
  return (cell.weightBp * valueRatioOf(cell.lead)) / bandMeanOf(cells, cell.band) / cell.nLive
}

function guardOf(cell: PaintedCell): number {
  const bound = cell.lead === 0 ? COMMON_BOUND_BP : RARE_BOUND_BP
  return Math.max(1, Math.ceil(cell.weightBp / bound))
}

function liveCountOf(params: PlanetParams, family: string, rarity: string, band: number): number {
  const lead = rarityTiers().findIndex((tier) => tier.id === rarity)
  const content = { family: codeOf(family), tierOffset: band - 1 + lead }
  return liveRosterIndicesOf(params, band, content).length
}

const ROSTERED = PLANETS.map((index) => freshPlanetParamsFor(SEED, index)).filter(
  (params) => planetRosterOf(params).length > 0,
)

describe('roster guard (Systems, ticket 446)', () => {
  it('checks planets 1 and 2 at least', () => {
    expect(ROSTERED.map((params) => params.planetIndex)).toEqual(expect.arrayContaining([1, 2]))
  })

  it.each(ROSTERED.map((params) => [params.planetIndex, params] as const))(
    'gives every painted (band, tier, family) cell of planet %i the live kinds its bound needs',
    (_, params) => {
      const short = paintedCellsOf(params).filter((cell) => cell.nLive < guardOf(cell))
      expect(short).toEqual([])
    },
  )

  it.each(ROSTERED.map((params) => [params.planetIndex, params] as const))(
    'holds every kind of planet %i within its band-trip bound, in whole basis points',
    (_, params) => {
      const cells = paintedCellsOf(params)
      const over = cells.filter((cell) => {
        const bound = cell.lead === 0 ? COMMON_BOUND_BP : RARE_BOUND_BP
        return Math.round(kindTripShareBpOf(cells, cell)) > bound
      })
      expect(over).toEqual([])
    },
  )

  it.each(ROSTERED.map((params) => [params.planetIndex, params] as const))(
    'keeps the band mean of planet %i: its kinds share out the whole band trip, within 0.5 bp',
    (_, params) => {
      const cells = paintedCellsOf(params)
      for (const band of BANDS) {
        const shares = cells
          .filter((cell) => cell.band === band)
          .reduce((sum, cell) => sum + kindTripShareBpOf(cells, cell) * cell.nLive, 0)
        expect(Math.abs(shares - BASIS_POINTS)).toBeLessThanOrEqual(MEAN_TOLERANCE_BP)
      }
    },
  )

  it("matches Systems' worst commons: 3611 bp of a P1 band trip, 3210 of a P2 one", () => {
    const worstOf = (planetIndex: number) => {
      const cells = paintedCellsOf(freshPlanetParamsFor(SEED, planetIndex))
      const commons = cells.filter((cell) => cell.lead === 0)
      return Math.max(...commons.map((cell) => Math.round(kindTripShareBpOf(cells, cell))))
    }
    expect([worstOf(1), worstOf(2)]).toEqual([3611, 3210])
  })

  it('keeps 2 metal and 2 crystal commons live in every band of the legacy roster', () => {
    const params = freshPlanetParamsFor(SEED, 1)
    for (const band of BANDS) {
      expect(liveCountOf(params, 'metal', 'common', band)).toBeGreaterThanOrEqual(2)
      expect(liveCountOf(params, 'crystal', 'common', band)).toBeGreaterThanOrEqual(2)
    }
  })

  it('keeps an uncommon of each family live in every band, and a rare of each in bands 3 to 5', () => {
    const params = freshPlanetParamsFor(SEED, 2)
    for (const family of ['metal', 'crystal']) {
      for (const band of BANDS)
        expect(liveCountOf(params, family, 'uncommon', band)).toBeGreaterThanOrEqual(1)
      for (const band of [3, 4, 5])
        expect(liveCountOf(params, family, 'rare', band)).toBeGreaterThanOrEqual(1)
    }
  })

  it('never lets a kind sit on a family the planet does not paint', () => {
    const painted = new Set(['metal', 'crystal'])
    expect(ORE_ROWS.kinds.slotsBySet.legacy.filter((slot) => !painted.has(slot.family))).toEqual([])
  })
})
