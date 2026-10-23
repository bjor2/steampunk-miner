import { describe, expect, it } from 'vitest'
import { oreSalePrice, oreTier } from '../../../systems/economy/oreEconomy'
import { fromCanonical, toCanonical } from '../../../systems/money'
import { minedOreOf, oreTypeOfCell } from '../../../systems/authority/minedOre'
import { saleTierOf } from '../../../systems/registries/oreTypes'
import {
  freshPlanetParamsFor,
  P1_GEMS_ORE_RULES,
  planetParamsFor,
  type PlanetParams,
} from '../../../systems/world/planetParams'
import { oreCell, RESOURCE_FAMILY } from '../../../systems/world/worldCell'
import { ORE_ROWS, rarityRowSetOfPlanet, topLeadOf } from '../../ores'
import { planetSpeciesOf } from './planetSpecies'
import { planetRosterOf } from './planetRoster'
import { gemSaleTierOfKind, topOreTierOf } from './rosterGems'

// P1's gems (ticket 713, Systems' decision on #713 with Bjor's OK of 23 Oct): Diamond, Emerald and
// Ruby sell at integer tiers of their own, t_top + 5, 6 and 8 (12, 13 and 15 on P1: V(t) floored to
// the milli, 864.975, 1297.463 and 2919.292, the 865, 1297 and 2919 Bjor accepted), and the cell
// keeps its own tier for hardness and look. No other kind of the planet sells at a gem's tier, so
// the receipt and the hold can name each gem by its tier (HS on #713).

const SEED = 83921
const BAND_FIVE_OFFSET = 4
const RARE_LEAD = 2

function gemsOf(params: PlanetParams) {
  return planetRosterOf(params).flatMap((kind, index) => {
    const saleTier = gemSaleTierOfKind(params, kind)
    return saleTier === null ? [] : [{ kindSlot: index + 1, slotId: kind.slotId, saleTier }]
  })
}

function nonGemSaleTiersOf(params: PlanetParams): number[] {
  const bandOne = oreTier(params.planetIndex, 1)
  const topLead = topLeadOf(rarityRowSetOfPlanet(params))
  const signatureLead = ORE_ROWS.signatureValueLead
  return Array.from(
    { length: BAND_FIVE_OFFSET + topLead + signatureLead + 1 },
    (_, at) => bandOne + at,
  )
}

describe('roster gems', () => {
  const p1 = freshPlanetParamsFor(SEED, 1)

  it("sells P1's Diamond, Emerald and Ruby at tiers 12, 13 and 15: about 865, 1297 and 2919", () => {
    expect(topOreTierOf(p1)).toBe(7)
    expect(
      gemsOf(p1).map(({ kindSlot, saleTier }) => [
        planetSpeciesOf(p1, kindSlot)?.epithet,
        saleTier,
        toCanonical(oreSalePrice(saleTier)),
      ]),
    ).toEqual([
      ['Diamond', 12, toCanonical(fromCanonical('864.975'))],
      ['Emerald', 13, toCanonical(fromCanonical('1297.463'))],
      ['Ruby', 15, toCanonical(fromCanonical('2919.292'))],
    ])
  })

  it('gives no other kind of P1 a sale tier a gem sells at, and no two gems one tier', () => {
    const gemTiers = gemsOf(p1).map((gem) => gem.saleTier)
    expect(new Set(gemTiers).size).toBe(gemTiers.length)
    expect(nonGemSaleTiersOf(p1).filter((tier) => gemTiers.includes(tier))).toEqual([])
    expect(Math.min(...gemTiers)).toBeGreaterThan(Math.max(...nonGemSaleTiersOf(p1)))
  })

  it("keeps a gem cell's own tier while its ore sells at the gem's tier", () => {
    const [diamond] = gemsOf(p1)
    const cell = oreCell(RESOURCE_FAMILY.crystal, BAND_FIVE_OFFSET + RARE_LEAD, diamond.kindSlot)
    const ore = oreTypeOfCell(p1, cell)
    expect([ore.tier, ore.gem, saleTierOf(ore)]).toEqual([7, true, 12])
  })

  it('keeps a mined gem unit in the hold at its gem tier, its cell tier on the log', () => {
    const [, emerald] = gemsOf(p1)
    const cell = oreCell(RESOURCE_FAMILY.crystal, BAND_FIVE_OFFSET + RARE_LEAD, emerald.kindSlot)
    const mined = minedOreOf(p1, { tx: 0, ty: 0 }, cell)
    expect([mined.resourceTier, mined.saleTier]).toEqual([7, 13])
  })

  it('names no gem on P2, nor on a P1 a save holds under ore rules older than the gems', () => {
    expect(gemsOf(freshPlanetParamsFor(SEED, 2))).toEqual([])
    expect(gemsOf(planetParamsFor(SEED, 1, P1_GEMS_ORE_RULES - 1))).toEqual([])
    const plainRare = oreCell(RESOURCE_FAMILY.crystal, BAND_FIVE_OFFSET + RARE_LEAD, 12)
    expect(oreTypeOfCell(p1, plainRare)).not.toHaveProperty('gem')
  })
})
