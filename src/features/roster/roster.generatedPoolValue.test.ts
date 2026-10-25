import { describe, expect, it } from 'vitest'
import { oreValue } from '../../systems/economy/oreEconomy'
import { cmp, div, fromCanonical, fromSafeInteger, mul, toCanonical } from '../../systems/money'
import { gemSaleTiersOfPlanet } from '../../systems/registries/planetRow'
import { campaignIndex, planetIndexOfCampaign } from '../../systems/starMap/campaignIndex'
import { planetParamsAt } from '../../systems/starMap/systemPlanetParams'
import { freshPlanetParamsFor, oreRulesVersionOnEntry } from '../../systems/world/planetParams'
import { topOreTierOf } from '../ores'
import { materialPoolAt, poolOreValueAt } from '../solar-systems'
import { planetRosterOf } from './systems/planetRoster'
import { gemSaleTierOfKind } from './systems/rosterGems'

// The VS's value rows of ticket 888: value keys on g alone, through t_top(g) and the gem ladder at
// t_top(g) + 5/6/8, with g as bigint and prices as Money; layout and pools key on (s, p). Along g
// within each line (system 1's P5 to P40, and each later system's planets) every planet's top gem
// sells at least 1.5x the planet before's and its pool is worth at least 1.15x on paper (R3, gems
// in); the jump hop system 1 P5 -> system 2 p1 (g 5 -> 6) is a hop too, and P40 -> system 2 p1 is
// not. P6 and P7, the first system-1 planets with gems, hold the same rows. Money per minute, felt
// speed and the planet minutes are the Tester's (`npm run balance:report`).

const SEED = 20261024
const TOP_GEM_STEP = fromCanonical('1.5')
const POOL_STEP_FLOOR = fromCanonical('1.15')
const GEM_LADDER = [5, 6, 8]
const P5_TO_P40 = Array.from({ length: 36 }, (_, at) => at + 5)

/** An address and its campaign index, as the rows read them. */
interface Address {
  system: bigint
  place: bigint
}

function gOf({ system, place }: Address): number {
  return planetIndexOfCampaign(campaignIndex(system, place))
}

/** The planet's dearest gem: its top sale tier, from the roster the planet's cells are drawn with. */
function topGemValueOf(address: Address) {
  const g = gOf(address)
  const params = planetParamsAt(SEED, address.system, g, oreRulesVersionOnEntry(g))
  const tiers = planetRosterOf(params).flatMap((kind) => {
    const tier = gemSaleTierOfKind(params, kind)
    return tier === null ? [] : [tier]
  })
  return oreValue(Math.max(...tiers))
}

/** The pool's paper ore value times the radius squared: what the planet's ground is worth. */
function poolValueOf(address: Address) {
  const g = gOf(address)
  const radius = planetParamsAt(SEED, address.system, g, oreRulesVersionOnEntry(g)).radiusTiles
  const perShare = poolOreValueAt(SEED, address.system, address.place)
  return mul(perShare, fromSafeInteger(radius * radius))
}

function firstSystem(place: number): Address {
  return { system: 1n, place: BigInt(place) }
}

function hopsOf(line: readonly Address[]): [Address, Address][] {
  return line.slice(1).map((address, at) => [line[at], address])
}

function labelOf({ system, place }: Address): string {
  return `${system}.${place}`
}

const FIRST_SYSTEM_LINE = P5_TO_P40.map(firstSystem)
const SYSTEM_TWO_LINE = [1n, 2n, 3n, 4n, 5n].map((place) => ({ system: 2n, place }))
const SYSTEM_THREE_LINE = [1n, 2n, 3n, 4n, 5n].map((place) => ({ system: 3n, place }))
const JUMP_HOP: [Address, Address] = [firstSystem(5), { system: 2n, place: 1n }]

describe('generated pool value along g (ticket 888)', () => {
  it.each([
    ['system 1, P5 to P40', FIRST_SYSTEM_LINE],
    ['system 2', SYSTEM_TWO_LINE],
    ['system 3', SYSTEM_THREE_LINE],
  ] as const)('sells each top gem of %s at least 1.5x the planet before', (_, line) => {
    for (const [before, after] of hopsOf(line)) {
      const step = div(topGemValueOf(after), topGemValueOf(before))
      expect(
        cmp(step, TOP_GEM_STEP),
        `${labelOf(before)} -> ${labelOf(after)}`,
      ).toBeGreaterThanOrEqual(0)
    }
  })

  it.each([
    ['system 1, P6 to P40', FIRST_SYSTEM_LINE.slice(1)],
    ['system 2', SYSTEM_TWO_LINE],
    ['system 3', SYSTEM_THREE_LINE],
  ] as const)('holds each pool of %s at least 1.15x the planet before on paper (R3)', (_, line) => {
    for (const [before, after] of hopsOf(line)) {
      const step = div(poolValueOf(after), poolValueOf(before))
      expect(
        cmp(step, POOL_STEP_FLOOR),
        `${labelOf(before)} -> ${labelOf(after)}`,
      ).toBeGreaterThanOrEqual(0)
    }
  })

  it('steps the jump hop system 1 P5 -> system 2 p1 as any hop, and never counts P40 -> 2.1', () => {
    const [p5, s2p1] = JUMP_HOP
    expect(gOf(s2p1)).toBe(gOf(p5) + 1)
    expect(cmp(div(topGemValueOf(s2p1), topGemValueOf(p5)), TOP_GEM_STEP)).toBeGreaterThanOrEqual(0)
    expect(gOf(s2p1)).toBeLessThan(gOf(firstSystem(40)))
  })

  it('gives P6 and P7, the first system-1 planets with gems, a top gem at least 1.5x the planet before', () => {
    for (const [before, after] of hopsOf([5, 6, 7].map(firstSystem))) {
      expect(
        cmp(div(topGemValueOf(after), topGemValueOf(before)), TOP_GEM_STEP),
      ).toBeGreaterThanOrEqual(0)
    }
  })

  // Shared g by design (#781): SS1 P6 and SS2 p1 are both g 6, SS1 P11 and SS3 p1 both g 11.
  it('prices addresses that share a g alike and nothing else alike', () => {
    for (const [first, drawn] of [
      [firstSystem(6), { system: 2n, place: 1n }],
      [firstSystem(11), { system: 3n, place: 1n }],
    ] as const) {
      expect(gOf(first)).toBe(gOf(drawn))
      expect(toCanonical(topGemValueOf(first))).toBe(toCanonical(topGemValueOf(drawn)))
      const firstPool = materialPoolAt(SEED, first.system, first.place)
      const drawnPool = materialPoolAt(SEED, drawn.system, drawn.place)
      expect(firstPool.id).not.toBe(drawnPool.id)
      expect(firstPool.kinds.map((kind) => kind.hueSlot)).not.toEqual(
        drawnPool.kinds.map((kind) => kind.hueSlot),
      )
      const g = gOf(first)
      const seedOf = (address: Address) => planetParamsAt(SEED, address.system, g).planetSeed
      expect(seedOf(first)).not.toBe(seedOf(drawn))
    }
  })

  it('reads the gem ladder at t_top(g) + 5/6/8 for g = 1, 5, 30, 40 and 1e6, prices as Money', () => {
    for (const g of [1n, 5n, 30n, 40n, 1_000_000n]) {
      const planetIndex = planetIndexOfCampaign(g)
      const top = topOreTierOf(planetIndex, oreRulesVersionOnEntry(planetIndex))
      expect(gemSaleTiersOfPlanet(planetIndex)).toEqual(GEM_LADDER.map((lead) => top + lead))
      expect(toCanonical(oreValue(top + 8))).toMatch(/^\d(\.\d+)?e\+\d+$/)
    }
    const far = materialPoolAt(SEED, 200_000n, 5n)
    expect(far.campaignIndex).toBe('1000000')
    expect(
      far.kinds.flatMap((kind) => (kind.gemSaleTier === null ? [] : [kind.gemSaleTier])),
    ).toEqual(gemSaleTiersOfPlanet(1_000_000))
  })

  it('keys a planet roster on (s, p): one roster per address, another for another address of the same g', () => {
    const params = freshPlanetParamsFor(SEED, 6)
    const once = planetRosterOf(params)
    expect(planetRosterOf({ ...params })).toBe(once)
    expect(once.every((slot) => slot.slotId.startsWith('system1-p6-'))).toBe(true)
    const s2p1 = planetParamsAt(SEED, 2n, 6, oreRulesVersionOnEntry(6))
    expect(planetRosterOf(s2p1).every((slot) => slot.slotId.startsWith('system2-p1-'))).toBe(true)
  })
})
