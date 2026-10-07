import { describe, expect, it } from 'vitest'
import { toCanonical, type Money } from '../../../systems/money'
import { planetParamsFor } from '../../../systems/world/planetParams'
import { leadWeights } from '../../ores'
import { gateClassOf } from './planetActs'
import { oreMixFor, oreMixNearLavaOf, oreMixOf, type OreMix, type OreMixEntry } from './oreMix'
import { bandValueMultiplierOf, signatureValueShareOf } from './mixValue'

const SEEDS = [83921, 31415, 27182]
const BANDS = [1, 2, 3, 4, 5]
const MIXED_PLANETS = Array.from({ length: 198 }, (_, at) => at + 3)

function numberOf(amount: Money): number {
  return Number(toCanonical(amount))
}

function totalBp(entries: readonly OreMixEntry[]): number {
  return entries.reduce((sum, entry) => sum + entry.weightBp, 0)
}

function idsOf(mix: OreMix, band: number, lead: number): string[] {
  return mix.bands[band - 1]
    .filter((entry) => entry.lead === lead && !entry.signature)
    .map((entry) => entry.typeId)
}

/** Distinct type ids of a mix by role: band types, previews above t_5, the signature. */
function rolesOf(mix: OreMix) {
  const all = mix.bands.flat()
  const topTier = all.filter((entry) => entry.signature)[0]?.tier ?? 0
  const distinct = (entries: readonly OreMixEntry[]) => [...new Set(entries.map((e) => e.typeId))]
  return {
    bandTypes: BANDS.map((band) => idsOf(mix, band, 0)),
    previews: distinct(all.filter((entry) => !entry.signature && entry.tier > topTier)),
    signatures: distinct(all.filter((entry) => entry.signature)),
    active: distinct(all),
  }
}

describe('planet ore mix', () => {
  it('fills every band to 10000 basis points on every planet', () => {
    for (const planet of [1, 2, ...MIXED_PLANETS]) {
      const mix = oreMixFor(planet, 83921)
      for (const entries of mix.bands) expect(totalBp(entries)).toBeCloseTo(10000, 6)
    }
  })

  it('shows 5 band types, at most 2 previews, 1 signature and at most 8 types from P3', () => {
    for (const planet of MIXED_PLANETS) {
      const roles = rolesOf(oreMixFor(planet, 31415))
      expect(roles.bandTypes.every((ids) => ids.length === 1)).toBe(true)
      expect(new Set(roles.bandTypes.flat()).size).toBe(5)
      expect(roles.previews.length).toBeLessThanOrEqual(2)
      expect(roles.signatures).toHaveLength(1)
      expect(roles.active.length).toBeLessThanOrEqual(8)
    }
  })

  it("carries the last planet's bands 4 and 5 into bands 1 and 2 inside an act", () => {
    for (const planet of MIXED_PLANETS.filter((p) => p >= 4)) {
      const [before, here] = [oreMixFor(planet - 1, 27182), oreMixFor(planet, 27182)]
      if (before.themeId !== here.themeId) continue
      expect([idsOf(here, 1, 0), idsOf(here, 2, 0)]).toEqual([
        idsOf(before, 4, 0),
        idsOf(before, 5, 0),
      ])
    }
  })

  it('puts the signature only in bands 4 and 5, from P3, at the tier of band 5', () => {
    for (const planet of [1, 2, ...MIXED_PLANETS]) {
      const mix = oreMixFor(planet, 83921)
      const signatureBands = BANDS.filter((band) => mix.bands[band - 1].some((e) => e.signature))
      expect(signatureBands).toEqual(planet >= 3 ? [4, 5] : [])
      const tiers = mix.bands
        .flat()
        .filter((entry) => entry.signature)
        .map((entry) => entry.tier)
      expect(new Set(tiers).size).toBeLessThanOrEqual(1)
    }
  })

  it('gives the +1 and +2 entries of every band different gate classes (P3 to P200)', () => {
    for (const planet of MIXED_PLANETS) {
      for (const seed of SEEDS) {
        for (const entries of oreMixFor(planet, seed).bands) {
          const leads = entries.filter((entry) => entry.lead > 0 && !entry.signature)
          const classes = leads.map((entry) => gateClassOf(entry.family))
          expect(new Set(classes).size).toBe(leads.length)
        }
      }
    }
  })

  it('keeps P1 and P2 on the legacy families with no signature', () => {
    const p1 = oreMixFor(1, 83921).bands[0]
    const metal = p1.filter((entry) => entry.family === 'metal' && entry.lead === 0)[0]
    expect(metal.weightBp).toBeCloseTo((10000 - leadWeights(1).plus1Bp) * 0.75, 6)
    expect(
      oreMixFor(2, 83921)
        .bands.flat()
        .map((entry) => entry.family),
    ).not.toContain('fossil')
  })

  it('takes 3% of bands 4 and 5 for the signature, doubled on P30 and P40', () => {
    const shareOf = (planet: number, band: number) =>
      totalBp(oreMixFor(planet, 83921).bands[band - 1].filter((entry) => entry.signature))
    expect([shareOf(12, 4), shareOf(12, 5)]).toEqual([300, 300])
    expect(shareOf(30, 5)).toBe(600)
    expect(shareOf(40, 5)).toBe(600)
  })

  it("clamps a doubled band-4 signature to the +1 entry it is carved from and #140's cap", () => {
    for (const planet of [30, 40]) {
      const band4 = oreMixFor(planet, 83921).bands[3]
      const signature = totalBp(band4.filter((entry) => entry.signature))
      expect(signature).toBe(Math.min(600, leadWeights(4).plus1Bp))
      expect(band4.every((entry) => entry.weightBp >= 0)).toBe(true)
    }
  })

  it('doubles the signature near lava only on heat planets, within the band caps', () => {
    const near = (planet: number) => oreMixNearLavaOf(planetParamsFor(83921, planet))
    const band5 = (mix: OreMix) => totalBp(mix.bands[4].filter((entry) => entry.signature))
    expect(band5(near(9))).toBe(600)
    expect(band5(near(20))).toBe(300)
    for (const planet of MIXED_PLANETS) {
      const mix = near(planet)
      expect(totalBp(mix.bands[3].filter((entry) => entry.signature))).toBeLessThanOrEqual(600)
      expect(band5(mix)).toBeLessThanOrEqual(800)
    }
  })

  it("prices each band at #140's lead multiplier plus the signature's one tier up", () => {
    for (const planet of [3, 9, 30, 77]) {
      const mix = oreMixFor(planet, 31415)
      for (const band of BANDS) {
        const { plus1Bp, plus2Bp } = leadWeights(band)
        const signatureBp = totalBp(mix.bands[band - 1].filter((entry) => entry.signature))
        const lead = 5 - band
        const signatureTerm = (signatureBp / 10000) * (1.5 ** (lead + 1) - 1.5 ** lead)
        const expected = 1 + (plus1Bp / 10000) * 0.5 + (plus2Bp / 10000) * 1.25 + signatureTerm
        const multiplier = numberOf(bandValueMultiplierOf(mix.bands[band - 1], planet, band))
        expect(Math.abs(multiplier / expected - 1)).toBeLessThan(0.001)
      }
    }
  })

  it("keeps the signature's value share inside #142's 15% guard (12.7% band 4, 10.9% band 5)", () => {
    for (const planet of MIXED_PLANETS) {
      for (const mix of [
        oreMixFor(planet, 83921),
        oreMixNearLavaOf(planetParamsFor(83921, planet)),
      ]) {
        expect(numberOf(signatureValueShareOf(mix.bands[3]))).toBeLessThanOrEqual(0.127)
        expect(numberOf(signatureValueShareOf(mix.bands[4]))).toBeLessThanOrEqual(0.109)
      }
    }
  })

  // Value and hardness read the tier alone (#140), so equal tiers mean equal oreHardness too.
  it('prices a band the same whichever family its seed swaps in', () => {
    const mixes = Array.from({ length: 12 }, (_, seed) => oreMixFor(12, seed))
    const bandThree = mixes.map((mix) => mix.bands[2])
    const families = new Set(bandThree.map((entries) => entries[0].family))
    const prices = new Set(
      bandThree.map((entries) => toCanonical(bandValueMultiplierOf(entries, 12, 3))),
    )
    expect(families.size).toBe(2)
    expect(prices.size).toBe(1)
    const tiers = bandThree.map((entries) => entries.map((entry) => entry.tier))
    expect(new Set(tiers.map((row) => row.join())).size).toBe(1)
  })

  it('is deterministic and finite toward endless', () => {
    for (const planet of [41, 120, 200, 1000]) {
      const mix = oreMixOf(planetParamsFor(27182, planet))
      expect(mix).toEqual(oreMixOf(planetParamsFor(27182, planet)))
      expect(mix.bands.flat().every((entry) => Number.isSafeInteger(entry.tier))).toBe(true)
    }
  })
})
