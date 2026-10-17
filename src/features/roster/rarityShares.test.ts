import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ORE_ROWS } from '../ores'
import { onCurveIncomeCapVerdictsOf } from '../tech-tree'
import type { PaintedBand, PaintedCell, PaintedPlanet } from './systems/paintedPlanet'
import {
  paintingsOf,
  readingOf,
  type PlanetPaintings,
  type PlanetReading,
} from './systems/planetShares'
import { SHARE_ROWS } from './systems/shareRows'
import {
  judgedReadingsOf,
  RARITY_SHARES_DOC,
  SHARE_TABLE_SEEDS,
  shareTableOf,
} from './systems/shareTable'
import { shareViolationsOf, violationTextOf, type ShareBoundId } from './systems/shareVerdicts'
import { tripLedgerOf } from './systems/tripLedger'

// Ticket 449: Systems' asserts for the materials (#139 comment 6203159815, the per-tier bound 650 bp
// on every planet since 6203640346, the trip asserts of 6202970624 section 7.5, the family-first
// guard of 6226198316 on ticket 446), in whole basis points from the trip ledger over the pacing
// seeds, on every judged planet: P3, P10, P20, P40 and P60, and P1 and P2, whose legacy roster is
// the only one with kinds until the mixed kinds table lands (#453). Each bound is then shown to
// fail on a fixture that breaks it, and the status page's table is the build's.

const READINGS = judgedReadingsOf(SHARE_TABLE_SEEDS)

function violationsOf(reading: PlanetReading): string[] {
  return shareViolationsOf(reading).map(violationTextOf)
}

function boundsMissedBy(reading: PlanetReading): ShareBoundId[] {
  return [...new Set(shareViolationsOf(reading).map((violation) => violation.bound))]
}

/** A painting with `edit` applied to every cell of every band, on all three paintings. */
function withCells(
  paintings: PlanetPaintings,
  edit: (cell: PaintedCell, band: PaintedBand) => PaintedCell,
): PlanetPaintings {
  const editPlanet = (planet: PaintedPlanet): PaintedPlanet => ({
    ...planet,
    bands: planet.bands.map((band) => ({
      ...band,
      cells: band.cells.map((cell) => edit(cell, band)),
    })),
  })
  return {
    real: editPlanet(paintings.real),
    base: editPlanet(paintings.base),
    today: paintings.today,
  }
}

/** `bp` of band `bandNumber`'s common weight moved to its uncommon cells, by their weight. */
function withUncommonRaisedBy(paintings: PlanetPaintings, bandNumber: number, bp: number) {
  const uncommonBp = (band: PaintedBand) =>
    band.cells.filter((cell) => cell.lead === 1).reduce((sum, cell) => sum + cell.weightBp, 0)
  const commonBp = (band: PaintedBand) =>
    band.cells.filter((cell) => cell.lead === 0).reduce((sum, cell) => sum + cell.weightBp, 0)
  return withCells(paintings, (cell, band) => {
    if (band.band !== bandNumber) return cell
    if (cell.lead === 1) return { ...cell, weightBp: cell.weightBp * (1 + bp / uncommonBp(band)) }
    if (cell.lead === 0) return { ...cell, weightBp: cell.weightBp * (1 - bp / commonBp(band)) }
    return cell
  })
}

const P1 = paintingsOf(SHARE_TABLE_SEEDS[0], 1)
const P3 = paintingsOf(SHARE_TABLE_SEEDS[0], 3)

describe('rarity share bounds (ticket 449)', () => {
  it('judges P3, P10, P20, P40 and P60, and P1 and P2, on every pacing seed', () => {
    expect(SHARE_ROWS.judgedPlanets).toEqual(expect.arrayContaining([3, 10, 20, 40, 60, 1, 2]))
    expect(READINGS).toHaveLength(SHARE_ROWS.judgedPlanets.length * SHARE_TABLE_SEEDS.length)
  })

  it('holds every bound on every judged planet and seed', () => {
    expect(READINGS.flatMap(violationsOf)).toEqual([])
  })

  it('judges the kind bounds, the guard and the live commons wherever a planet has a roster', () => {
    const rostered = READINGS.filter((reading) => reading.hasRoster)
    expect(rostered.map((reading) => reading.planetIndex)).toEqual(expect.arrayContaining([1, 2]))
    for (const reading of rostered) expect(reading.planetKinds.length).toBeGreaterThan(0)
  })

  it("matches Systems' worst legacy commons: 3611 bp of a P1 band trip and 3210 of a P2 one, rounded up", () => {
    const worstCommonOf = (planet: number) =>
      Math.max(
        ...READINGS.filter((reading) => reading.planetIndex === planet).flatMap((reading) =>
          reading.bands.flatMap((band) =>
            band.shares.kinds.filter((kind) => kind.isCommon).map((kind) => kind.bandTripBp),
          ),
        ),
      )
    expect([worstCommonOf(1), worstCommonOf(2)]).toEqual([3612, 3210])
  })

  it("keeps P1 band 5's uncommon tier at 649 bp, the legacy row the 650 bp bound was set from", () => {
    const p1 = READINGS.find((reading) => reading.planetIndex === 1) as PlanetReading
    const uncommon = p1.bands[4].shares.tiers.find((tier) => tier.tierId === 'uncommon')
    expect(uncommon?.bandTripBp).toBe(649)
  })

  it('reads every band mean within half a basis point of today, 1.0000 to four decimals', () => {
    for (const reading of READINGS) {
      for (const band of reading.bands) expect(Math.abs(band.meanShiftBp)).toBeLessThan(0.5)
    }
  })

  it('costs P3 band 5 about 0.9 bp of mean income to the clamp, exactly, and P10 band 5 next to none', () => {
    // Systems measured 0.87 bp, the TD 0.98 bp, both by sample (6202970624 section 4; #445).
    const clampLossOf = (planet: number) =>
      (READINGS.find((reading) => reading.planetIndex === planet) as PlanetReading).bands[4].trip
        .clampLossBp
    expect(clampLossOf(3)).toBeGreaterThan(0.85)
    expect(clampLossOf(3)).toBeLessThan(0.95)
    expect(clampLossOf(10)).toBeLessThan(0.01)
  })

  it('prints a story planet boosting its signature apart, judging its tiers and mean on the base share', () => {
    // P40 is a story planet (#141): its band 4 and 5 signatures double, outside Systems' model.
    const p40 = READINGS.find((reading) => reading.planetIndex === 40) as PlanetReading
    expect(p40.isSignatureBoosted).toBe(true)
    const signatureOf = (tiers: PlanetReading['bands'][number]['realTiers']) =>
      tiers.find((tier) => tier.tierId === 'signature')?.bandTripBp
    expect(signatureOf(p40.bands[3].shares.tiers)).toBe(640)
    expect(signatureOf(p40.bands[3].realTiers)).toBeGreaterThan(640)
    const p10 = READINGS.find((reading) => reading.planetIndex === 10) as PlanetReading
    expect(p10.isSignatureBoosted).toBe(false)
  })
})

describe('rarity share bounds can fail', () => {
  it('fails a common kind past 5000 bp of a band trip and 4000 bp of the planet, and the guard', () => {
    const oneMetalCommon = withCells(P1, (cell) =>
      cell.lead === 0 && cell.family === 'metal' ? { ...cell, liveKinds: ['legacy.c1'] } : cell,
    )
    expect(boundsMissedBy(readingOf(oneMetalCommon, 42))).toEqual(
      expect.arrayContaining([
        'perCommonKindMaxOfBandTrip',
        'perCommonKindMaxOfPlanet',
        'kindGuard',
      ]),
    )
  })

  it('fails a band with fewer than 2 live commons', () => {
    const oneCommon = withCells(P1, (cell) =>
      cell.lead === 0 ? { ...cell, liveKinds: ['legacy.c1'] } : cell,
    )
    expect(boundsMissedBy(readingOf(oneCommon, 42))).toContain('liveCommonsPerBandMin')
  })

  it('fails a bare painted cell', () => {
    const bareUncommon = withCells(P1, (cell) =>
      cell.lead === 1 ? { ...cell, liveKinds: [] } : cell,
    )
    expect(boundsMissedBy(readingOf(bareUncommon, 42))).toEqual(['kindGuard'])
  })

  it('fails a non-common kind past 1500 bp and its tier past 650 bp', () => {
    const heavyUncommon = withUncommonRaisedBy(P1, 5, 1500)
    expect(boundsMissedBy(readingOf(heavyUncommon, 42))).toEqual(
      expect.arrayContaining(['perNonCommonKindMax', 'perNonCommonTierMax']),
    )
  })

  it('fails a tier a few basis points past 650 bp and a mean moved off today', () => {
    // 20 bp more uncommon in P1 band 5 lifts its 649 bp tier past 650 and its mean by about 10 bp.
    const missed = boundsMissedBy(readingOf(withUncommonRaisedBy(P1, 5, 20), 42))
    expect(missed).toEqual(expect.arrayContaining(['perNonCommonTierMax', 'meanShiftMaxBp']))
    expect(missed).not.toContain('perNonCommonKindMax')
  })

  it('fails trips that spread past 3% and a 99.9th percentile past 1.12 of the expected trip', () => {
    expect(boundsMissedBy(readingOf(P1, 8))).toEqual(
      expect.arrayContaining(['cvMaxBp', 'p999MaxOfNominalBp']),
    )
  })

  it('fails a clamp that takes more than a basis point of mean income', () => {
    expect(boundsMissedBy(readingOf(P3, 30))).toContain('clampLossMaxBp')
  })

  it('fails epic and mythic past 1500 bp of a trip, which only a looser clamp than 1500 bp allows', () => {
    const reading = readingOf(P3, 90)
    const loose = { ...ORE_ROWS, rarity: { ...ORE_ROWS.rarity, tripClampShareBp: 3000 } }
    const band5 = reading.bands[4]
    const patch = { planetIndex: 3, band: 5, hold: 90 }
    const trip = tripLedgerOf(P3.real.bands[4], patch, SHARE_TABLE_SEEDS, 1_000_000, loose)
    const looseReading = { ...reading, bands: [...reading.bands.slice(0, 4), { ...band5, trip }] }
    expect(band5.trip.worstEpicAndMythicBp).toBeLessThanOrEqual(1500)
    expect(boundsMissedBy(looseReading)).toContain('epicPlusMythicTripClampBp')
  })
})

describe('rarity share table', () => {
  it('is the table the status page prints: rerun `npm run rarity:shares` when this fails', () => {
    const table = shareTableOf(READINGS, onCurveIncomeCapVerdictsOf(), SHARE_ROWS)
    const committed: unknown = JSON.parse(readFileSync(RARITY_SHARES_DOC, 'utf8'))
    expect(committed).toEqual(JSON.parse(JSON.stringify(table)))
  })

  it('prints the #385 cap over the rarity-weighted hold beside the nominal one', () => {
    const table = shareTableOf(READINGS, onCurveIncomeCapVerdictsOf(), SHARE_ROWS)
    expect(table.incomeCap.length).toBeGreaterThan(0)
    for (const row of table.incomeCap) {
      expect(row.shareBp).toBeLessThan(row.nominalShareBp)
      expect(row.isFailing).toBe(false)
    }
  })
})
