import { describe, expect, it } from 'vitest'
import { oreHardness, oreSalePrice, signatureHardness } from '../economy/oreEconomy'
import { stepOfMajor } from '../economy/upgradeSteps'
import { toCanonical } from '../money'
import { ORE_SIGNATURE_REGISTRY } from '../registries/oreTypes'
import { addToRegistry, withFreshRegistrySet } from '../registries/seal'
import { EMPTY_WORLD, materialCellAt } from '../world/worldState'
import type { DomainEvent } from './domainEvent'
import { hardnessOfTile } from './groundDrill'
import {
  createScriptedSession,
  dockInBay,
  drill,
  FREEZE_ENEMIES,
  PARAMS,
  poseAbove,
  surfaceOreTiles,
} from './scriptedSession'
import { FACING } from '../vehicle/vehiclePose'

// A drill-gated signature cell (#142, kept by #232): it sells one tier up through the tier-keyed
// sale price, and is as hard as five tiers up with a scratch floor of 1. Planet 1's band-1 ore is
// tier 1, so a signature there sells at V(2), is H(6) hard and needs tip major 1 + 4 = 5.

const SURFACE_TIER = 1
const sellAll = { type: 'sellCargo', payload: { resourceTier: 'all' } } as const

/** Every tier-1 ore a signature, as #147's planet mix would tag its own signature type. */
function registerTierOneSignature(): void {
  addToRegistry(ORE_SIGNATURE_REGISTRY, 'planet-mix', {
    id: 'planet-mix.signature',
    isSignature: (ore) => ore.tier === SURFACE_TIER,
  })
}

const nothing = () => undefined

/** Drills planet 1's first surface ore cell with the tip at `tipMajor` and a fast drill. */
function drillSurfaceOre(tipMajor: number) {
  const [tile] = surfaceOreTiles(1)
  const session = createScriptedSession()
  session.submit(0, FREEZE_ENEMIES)
  session.submit(0, setUpgrade('drill_tip', stepOfMajor(tipMajor)))
  session.submit(0, setUpgrade('drill_power', stepOfMajor(30)))
  session.submit(0, { type: 'debug.setEnergy', payload: { energy: '150' } })
  session.submit(1, poseAbove(tile, FACING.down))
  const events = session.submit(200, drill(tile, 150))
  return { session, events }
}

function setUpgrade(upgradeId: string, level: number) {
  return { type: 'debug.setUpgrade', payload: { upgradeId, level } } as const
}

function cargoAddedOf(events: readonly DomainEvent[]) {
  return events.find((event) => event.type === 'CargoAdded')
}

function surfaceOreHardness() {
  const [tile] = surfaceOreTiles(1)
  return hardnessOfTile(PARAMS, tile, materialCellAt(EMPTY_WORLD, PARAMS, tile))
}

describe('signature ore cells (#232)', () => {
  it('sells a mined signature unit one tier up, at the price the Sell bay pays for that tier', () => {
    const { added, sold, cargo } = withFreshRegistrySet(registerTierOneSignature, () => {
      const { session, events } = drillSurfaceOre(12)
      const cargoAfterDrill = session.state().players.p1.vehicle.cargo.ore
      dockInBay(session, 300, 'sell')
      const sale = session.submit(301, sellAll)
      return {
        added: cargoAddedOf(events),
        sold: sale.find((event) => event.type === 'ResourceSold'),
        cargo: cargoAfterDrill,
      }
    })
    const twoTierPrice = toCanonical(oreSalePrice(SURFACE_TIER + 1))
    expect(added).toMatchObject({ resourceTier: SURFACE_TIER, value: twoTierPrice })
    expect(added).not.toHaveProperty('saleTier')
    expect(cargo).toEqual({ [String(SURFACE_TIER + 1)]: 1 })
    expect(sold).toMatchObject({ value: twoTierPrice })
  })

  it('is as hard as five tiers above its own, and an untagged cell keeps its tier', () => {
    expect(withFreshRegistrySet(registerTierOneSignature, surfaceOreHardness)).toEqual(
      signatureHardness(SURFACE_TIER),
    )
    expect(signatureHardness(SURFACE_TIER)).toEqual(oreHardness(SURFACE_TIER + 5))
    expect(withFreshRegistrySet(nothing, surfaceOreHardness)).toEqual(oreHardness(SURFACE_TIER))
  })

  it('only skids under a tip below its hardness, and breaks at the tip that matches it', () => {
    const below = withFreshRegistrySet(registerTierOneSignature, () => drillSurfaceOre(4).events)
    const matching = withFreshRegistrySet(registerTierOneSignature, () => drillSurfaceOre(5).events)
    expect(cargoAddedOf(below)).toBeUndefined()
    expect(cargoAddedOf(matching)).toMatchObject({
      resourceTier: SURFACE_TIER,
      value: toCanonical(oreSalePrice(SURFACE_TIER + 1)),
    })
  })

  it('keeps the quarter floor on an untagged cell, so the same low tip cuts it', () => {
    const plain = withFreshRegistrySet(nothing, () => drillSurfaceOre(4).events)
    expect(cargoAddedOf(plain)).toMatchObject({
      resourceTier: SURFACE_TIER,
      value: toCanonical(oreSalePrice(SURFACE_TIER)),
    })
  })
})
