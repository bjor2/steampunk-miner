import { describe, expect, it } from 'vitest'
import { cmp, fromCanonical, fromSafeInteger, sub, toCanonical } from '../../../systems/money'
import { bandMeanValueBpOf, solvedRarityWeightsBp, type RaritySolveBand } from './raritySolve'

/** Systems' P3+ inputs (#139 comment 6202970624 section 2): today's means, 300 bp signatures. */
const P3_BANDS: RaritySolveBand[] = [
  { meanPpm: 1012500, liveOffsets: [1], signatureBp: 0, signatureOffset: 5 },
  { meanPpm: 1015000, liveOffsets: [1, 2], signatureBp: 0, signatureOffset: 4 },
  { meanPpm: 1023750, liveOffsets: [1, 2, 3], signatureBp: 0, signatureOffset: 3 },
  { meanPpm: 1055000, liveOffsets: [1, 2, 3, 4], signatureBp: 300, signatureOffset: 2 },
  { meanPpm: 1056250, liveOffsets: [1, 2, 3, 4], signatureBp: 300, signatureOffset: 1 },
]

function meanErrorBp(band: RaritySolveBand): string {
  const weights = solvedRarityWeightsBp(band)
  const mean = bandMeanValueBpOf(weights, band.signatureBp, band.signatureOffset)
  return toCanonical(sub(mean, fromCanonical(String(band.meanPpm / 100))))
}

describe('rarity weight solver', () => {
  it("solves Systems' mixed table from today's band means", () => {
    expect(P3_BANDS.map((band) => solvedRarityWeightsBp(band))).toEqual([
      [9750, 250, 0, 0, 0],
      [9795, 142, 63, 0, 0],
      [9745, 155, 69, 31, 0],
      [9536, 97, 41, 18, 8],
      [9317, 224, 97, 43, 19],
    ])
  })

  it('keeps the mean value of an ore unit within half a basis point of the target', () => {
    expect(P3_BANDS.map(meanErrorBp)).toEqual(['0e+0', '-2.5e-1', '-1.25e-1', '0e+0', '6.25e-2'])
  })

  it('rounds a fitted weight exactly halfway down, so a tie never adds income', () => {
    // Band 2's uncommon weight is fitted at exactly 142.5 bp.
    expect(solvedRarityWeightsBp(P3_BANDS[1])[1]).toBe(142)
  })

  it('leaves the whole band common when no tier above it is drawn', () => {
    const band = { meanPpm: 1000000, liveOffsets: [], signatureBp: 0, signatureOffset: 1 }
    expect(solvedRarityWeightsBp(band)).toEqual([10000, 0, 0, 0, 0])
  })

  it('values a band of commons and signatures at their multipliers', () => {
    const mean = bandMeanValueBpOf([9700, 0, 0, 0, 0], 300, 1)
    expect(cmp(mean, fromSafeInteger(10150))).toBe(0)
  })
})
