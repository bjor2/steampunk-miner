import { describe, expect, it } from 'vitest'
import {
  GEM_GLINT,
  gemGlintOf,
  gemGlintOfCode,
  glintHueProblemsOf,
} from '../../systems/render/gemGlint'
import { gemGlintCodeOfEntry, kindEntryOf, type KindLook } from '../../systems/render/kindLookTable'
import { freshPlanetParamsFor } from '../../systems/world/planetParams'
import { ORE_LOOKS } from '../ore-visuals'
import { gemSaleTiersOf, ORE_ROWS } from '../ores'
import { NAMED_SEEDS } from './rosterFixtures'
import { planetKindLooksOf } from './systems/render/kindLookProvider'
import { gemRankAmong } from './systems/rosterGems'

// Ticket 786 (TD done-when 6374381455 on #746, VS): k is the gem's rank within its planet, read
// from the price table, never from g, tier or price, so the glint the look table packs for rank k
// is the same float, byte for byte, at g = 1, 5, 10, 40 and 1e6.

const [SEED] = NAMED_SEEDS
const PLANETS = [1, 5, 10, 40, 1e6]
const RANKS = ORE_ROWS.gems.tierLeads.map((_, rank) => rank)

function saleTiersOf(planetIndex: number): number[] {
  const { oreRulesVersion } = freshPlanetParamsFor(SEED, planetIndex)
  return gemSaleTiersOf(planetIndex, oreRulesVersion)
}

/** A gem of P1 as the roster draws it, to carry each rank through the table. */
function planet1Gem(): KindLook {
  const gem = planetKindLooksOf(freshPlanetParamsFor(SEED, 1)).find(
    (look) => look !== null && look.gemRank !== null,
  )
  if (gem === undefined || gem === null) throw new Error('P1 draws no gem')
  return gem
}

/** The bytes of the slot's fourth float as the shader receives it. */
function fourthFloatBytesOf(look: KindLook): number[] {
  return [...new Uint8Array(Float32Array.of(kindEntryOf(look)[3]).buffer)]
}

describe('gem rank glint on the roster (ticket 786)', () => {
  it.each(PLANETS)(
    'reads each gem rank k of planet %d from its price table, cheapest first',
    (g) => {
      const tiers = saleTiersOf(g)
      expect(tiers.map((tier) => gemRankAmong(tiers, tier))).toEqual(RANKS)
      expect([...tiers].sort((a, b) => a - b)).toEqual(tiers)
    },
  )

  it('packs the glint of rank k byte-identical at g = 1, 5, 10, 40 and 1e6', () => {
    const gem = planet1Gem()
    const bytesAt = (g: number) => {
      const tiers = saleTiersOf(g)
      return tiers.map((tier) => fourthFloatBytesOf({ ...gem, gemRank: gemRankAmong(tiers, tier) }))
    }
    const first = bytesAt(1)
    for (const g of PLANETS) expect(bytesAt(g), `g = ${g}`).toEqual(first)
    const steps = first.map((bytes) => {
      const fourth = new Float32Array(Uint8Array.from(bytes).buffer)[0]
      return gemGlintOfCode(gemGlintCodeOfEntry(fourth))?.step
    })
    expect(steps).toEqual(RANKS)
  })

  it('reads the glint of a very high rank whole from the packed float', () => {
    const gem = { ...planet1Gem(), gemRank: 1e6 }
    expect(gemGlintOfCode(gemGlintCodeOfEntry(kindEntryOf(gem)[3]))).toEqual(gemGlintOf(1e6))
  })

  it("keeps the glint's tints out of the reserved heat and enemy hue bands (#151)", () => {
    expect(glintHueProblemsOf(GEM_GLINT, ORE_LOOKS.reservedHueBands)).toEqual([])
  })

  it('names a finish tint in the reserved heat band', () => {
    const ember = { ...GEM_GLINT, finishes: [[1, 0.5, 0.125] as const] }
    expect(glintHueProblemsOf(ember, ORE_LOOKS.reservedHueBands)).toEqual([
      "#ff8020's hue falls in the reserved 15-45 degrees",
    ])
  })
})
