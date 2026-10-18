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
// are asserts on the real roster. Checked on every planet whose roster holds kinds: P1 and P2 on
// the legacy table, P3 to P7 on the mixed one (#453), each on the three pacing seeds so a swapped
// band 3 (fossil commons, from P4) is read too. A cell only the relic signature paints is the
// slotless 16th material and asks for no kind (E1, Systems and TD on #453).

const SEED = 83921
const SEEDS = [83921, 31415, 27182]
const PLANETS = [1, 2, 3, 4, 5, 6, 7]
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
  isSignatureOnly: boolean
}

interface MixCell {
  family: string
  lead: number
  weightBp: number
  isSignatureOnly: boolean
}

function paintedCellsOf(params: PlanetParams): PaintedCell[] {
  return oreMixOf(params).bands.flatMap((entries, at) =>
    mergedByFamilyAndLead(entries).map(({ family, lead, weightBp, isSignatureOnly }) => ({
      band: at + 1,
      lead,
      family,
      weightBp,
      nLive: liveRosterIndicesOf(params, at + 1, { family: codeOf(family), tierOffset: at + lead })
        .length,
      isSignatureOnly,
    })),
  )
}

/** The cells a kind is drawn on: every painted cell but those the signature paints alone. */
function kindedCellsOf(params: PlanetParams): PaintedCell[] {
  return paintedCellsOf(params).filter((cell) => !cell.isSignatureOnly)
}

function codeOf(family: string): ResourceFamily {
  return (oreFamilies().find((row) => row.id === family)?.cellCode ?? 0) as ResourceFamily
}

/** A signature entry shares its cell with a lead entry of its family and tier, if any. */
function mergedByFamilyAndLead(
  entries: readonly { family: string; lead: number; weightBp: number; signature: boolean }[],
): MixCell[] {
  const merged = new Map<string, MixCell>()
  for (const { family, lead, weightBp, signature } of entries) {
    const key = `${family}:${lead}`
    const kept = merged.get(key)
    merged.set(key, {
      family,
      lead,
      weightBp: (kept?.weightBp ?? 0) + weightBp,
      isSignatureOnly: (kept?.isSignatureOnly ?? true) && signature,
    })
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

/** The cell's whole share of the band trip: its kinds' shares summed, or the signature's own. */
function cellTripShareBpOf(cells: readonly PaintedCell[], cell: PaintedCell): number {
  if (cell.isSignatureOnly)
    return (cell.weightBp * valueRatioOf(cell.lead)) / bandMeanOf(cells, cell.band)
  return kindTripShareBpOf(cells, cell) * cell.nLive
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

const ROSTERED = SEEDS.flatMap((seed) =>
  PLANETS.map((index) => freshPlanetParamsFor(seed, index)),
).filter((params) => planetRosterOf(params).length > 0)

function labelOf(params: PlanetParams): string {
  return `P${params.planetIndex} seed ${params.worldSeed}`
}

const MIXED = ROSTERED.filter((params) => params.planetIndex >= 3)
/** Option B's rows (#453), appended after Systems' 15 slots for a swapped band 3's fossil commons. */
const APPENDED_SLOT_IDS = ['mixed.c5', 'mixed.c6']

/** The slot ids live on a painted cell, as the roster fold draws them. */
function liveSlotIdsOf(params: PlanetParams, cell: PaintedCell): string[] {
  const roster = planetRosterOf(params)
  const content = { family: codeOf(cell.family), tierOffset: cell.band - 1 + cell.lead }
  return liveRosterIndicesOf(params, cell.band, content).map((index) => roster[index].slotId)
}

/** Every kind the planet's painted cells can draw, the slotless signature apart. */
function drawnSlotIdsOf(params: PlanetParams): Set<string> {
  return new Set(kindedCellsOf(params).flatMap((cell) => liveSlotIdsOf(params, cell)))
}

/** The cells the guard finds short on a roster without Option B's appended rows. */
function shortWithoutAppendedOf(params: PlanetParams): PaintedCell[] {
  return kindedCellsOf(params).filter((cell) => {
    const live = liveSlotIdsOf(params, cell).filter((id) => !APPENDED_SLOT_IDS.includes(id))
    return live.length < guardOf(cell)
  })
}

/** Whether the planet paints fossil, the act's rare family, as band 3's common (a swapped band 3). */
function hasSwappedBand3(params: PlanetParams): boolean {
  return paintedCellsOf(params).some(
    (cell) => cell.band === 3 && cell.lead === 0 && cell.family === 'fossil',
  )
}

describe('roster guard (Systems, ticket 446)', () => {
  it('checks planets 1 to 7 on every seed, swapped band 3s included', () => {
    expect(ROSTERED.map(labelOf)).toEqual(
      SEEDS.flatMap((seed) => PLANETS.map((index) => `P${index} seed ${seed}`)),
    )
    expect(ROSTERED.filter(hasSwappedBand3).length).toBeGreaterThan(0)
  })

  it.each(ROSTERED.map((params) => [labelOf(params), params] as const))(
    'gives every painted (band, tier, family) cell of %s the live kinds its bound needs',
    (_, params) => {
      const short = kindedCellsOf(params).filter((cell) => cell.nLive < guardOf(cell))
      expect(short).toEqual([])
    },
  )

  it.each(ROSTERED.map((params) => [labelOf(params), params] as const))(
    'holds every kind of %s within its band-trip bound, in whole basis points',
    (_, params) => {
      const cells = paintedCellsOf(params)
      const over = kindedCellsOf(params).filter((cell) => {
        const bound = cell.lead === 0 ? COMMON_BOUND_BP : RARE_BOUND_BP
        return Math.round(kindTripShareBpOf(cells, cell)) > bound
      })
      expect(over).toEqual([])
    },
  )

  it.each(ROSTERED.map((params) => [labelOf(params), params] as const))(
    "keeps the band mean of %s: its kinds and the signature's own share make the whole band trip",
    (_, params) => {
      const cells = paintedCellsOf(params)
      for (const band of BANDS) {
        const shares = cells
          .filter((cell) => cell.band === band)
          .reduce((sum, cell) => sum + cellTripShareBpOf(cells, cell), 0)
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

  it.each(MIXED.map((params) => [labelOf(params), params] as const))(
    'draws on %s 15 kinds unswapped and all 17 on a swapped band 3, the signature apart (VS on #453)',
    (_, params) => {
      const drawn = drawnSlotIdsOf(params)
      expect(drawn.size).toBe(hasSwappedBand3(params) ? 17 : 15)
      expect(drawn.size).toBeLessThanOrEqual(ORE_ROWS.kinds.rosterMaxKinds)
    },
  )

  it("needs Option B's two rows: without them only a swapped band 3's fossil commons fall short", () => {
    const short = MIXED.flatMap((params) =>
      shortWithoutAppendedOf(params).map((cell) => ({
        isSwapped: hasSwappedBand3(params),
        cell: `b${cell.band} ${cell.family} +${cell.lead}`,
      })),
    )
    expect(short.length).toBeGreaterThan(0)
    expect(new Set(short.map((entry) => `${String(entry.isSwapped)} ${entry.cell}`))).toEqual(
      new Set(['true b3 fossil +0']),
    )
  })

  it('never lets a kind sit on a family the planet does not paint', () => {
    const painted = new Set(['metal', 'crystal'])
    expect(ORE_ROWS.kinds.slotsBySet.legacy.filter((slot) => !painted.has(slot.family))).toEqual([])
  })
})
