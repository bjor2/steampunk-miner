import { describe, expect, it } from 'vitest'
import {
  createAuthorityState,
  vehicleOf,
  withVehicle,
  type AuthorityState,
} from '../../systems/authority/authorityState'
import type { DomainEventBody } from '../../systems/authority/domainEvent'
import { collectOreUnit } from '../../systems/authority/groundDrill'
import { minedOreOf, type MinedOre } from '../../systems/authority/minedOre'
import {
  continueScriptedSession,
  createScriptedSession,
  dockInBay,
  GROUND,
  poseAbove,
} from '../../systems/authority/scriptedSession'
import {
  readSnapshot,
  takeSnapshot,
  type SessionSnapshot,
} from '../../systems/authority/sessionSnapshot'
import { oreSalePrice, oreTier } from '../../systems/economy/oreEconomy'
import { onCurveSteps } from '../../systems/economy/vehicleStats'
import { add, cmp, fromCanonical, toCanonical, ZERO_MONEY } from '../../systems/money'
import { setUpgradeCommand } from '../../systems/vehicle/vehicleCommands'
import { FACING } from '../../systems/vehicle/vehiclePose'
import { statsOfVehicle } from '../../systems/vehicle/vehicleState'
import { bandOfTile } from '../../systems/world/planetGeometry'
import { CELL_KIND, kindOfCell } from '../../systems/world/worldCell'
import { cellAt, EMPTY_WORLD } from '../../systems/world/worldState'
import {
  CLAMPED_BANDS,
  clampedTilesOf,
  pickupFindAt,
  RARITY_RUN_PLANET,
  stampedRunParamsOf,
} from './rarityTripFixtures'
import { isTripClamped, rarityTripCapAt } from './systems/rarityTripClamp'
import { RARITY_TRIP_SECTION, rarityTripOf, withRarityTrip } from './systems/rarityTripSection'

// The ores slice's ore pickup provider (ticket 509, TD ruling 6221725921 on #445 sections 4 and
// 6): on the loaded slices, every epic and mythic unit that reaches the hold is priced against the
// player's rarity trip, the trip lives in the `ores.rarity-trip` section, and the dock and a rescue
// end it.

const SEED = 83921
const PARAMS = stampedRunParamsOf(SEED)
const [EPIC_TILE] = clampedTilesOf(PARAMS, 1, CLAMPED_BANDS)

/** Planet 3 under the ore rules with the on-curve P3 hold (90 units). */
function p3State(): AuthorityState {
  const session = continueScriptedSession(
    createAuthorityState({ planetIndex: RARITY_RUN_PLANET, planetSeed: SEED, playerIds: ['p1'] }),
  )
  session.submit(0, setUpgradeCommand('cargo_hold', onCurveSteps(RARITY_RUN_PLANET).cargo_hold))
  return session.state()
}

const oreAt = (tile: { tx: number; ty: number }): MinedOre =>
  minedOreOf(PARAMS, tile, cellAt(EMPTY_WORLD, PARAMS, tile))

const capacityOf = (state: AuthorityState) => statsOfVehicle(vehicleOf(state, 'p1')).cargoCapacity

const capOf = (state: AuthorityState, ore: MinedOre) =>
  rarityTripCapAt(RARITY_RUN_PLANET, ore.band, capacityOf(state))

const valueAdded = (events: readonly DomainEventBody[]) =>
  events.find((event) => event.type === 'CargoAdded')?.value

const hasSection = (state: AuthorityState) =>
  RARITY_TRIP_SECTION.id in (state.players.p1.slices ?? {})

/** The first ore cells of each lead below epic on the stamped planet, one a lead. */
function unclampedTiles(): { tx: number; ty: number }[] {
  const byLead = new Map<number, { tx: number; ty: number }>()
  for (let ty = PARAMS.radiusTiles; ty > 0 && byLead.size < 3; ty--) {
    for (let tx = -40; tx <= 40; tx++) {
      if (kindOfCell(cellAt(EMPTY_WORLD, PARAMS, { tx, ty })) !== CELL_KIND.ore) continue
      const lead = pickupFindAt(PARAMS, { tx, ty }).tierAboveBand
      if (lead >= 0 && lead < 3 && !byLead.has(lead)) byLead.set(lead, { tx, ty })
    }
  }
  return [...byLead.values()]
}

/** Bands 4 and 5, where the planet mix carves the signature (#141). */
const SIGNATURE_BANDS = [4, 5]

/** Every signature ore cell in the top half of a stamped planet's signature bands, as a find. */
function signatureFinds(planetIndex: number) {
  const params = stampedRunParamsOf(SEED, planetIndex)
  const reach = params.radiusTiles
  const finds = []
  for (let ty = reach; ty > 0; ty--) {
    for (let tx = -reach; tx <= reach; tx++) {
      if (!SIGNATURE_BANDS.includes(bandOfTile(params, tx, ty))) continue
      const cell = cellAt(EMPTY_WORLD, params, { tx, ty })
      if (kindOfCell(cell) !== CELL_KIND.ore) continue
      const ore = minedOreOf(params, { tx, ty }, cell)
      if (ore.saleTier > ore.resourceTier) finds.push(pickupFindAt(params, { tx, ty }))
    }
  }
  return finds
}

describe('ores: the rarity pickup provider', () => {
  it('pays an epic find below the cap in full and writes it into the trip section', () => {
    const ore = oreAt(EPIC_TILE)
    const collected = collectOreUnit(p3State(), 'p1', ore)
    expect(valueAdded(collected.events)).toBe(toCanonical(oreSalePrice(ore.saleTier)))
    expect(rarityTripOf(collected.state, 'p1').clampedValue).toEqual(oreSalePrice(ore.saleTier))
    expect(hasSection(collected.state)).toBe(true)
  })

  it("pays an epic find at the cap the band's own ore and leaves the trip as it was", () => {
    const ore = oreAt(EPIC_TILE)
    const start = p3State()
    const atCap = withRarityTrip(start, 'p1', { clampedValue: capOf(start, ore) })
    const collected = collectOreUnit(atCap, 'p1', ore)
    const bandTier = oreTier(RARITY_RUN_PLANET, ore.band)
    expect(valueAdded(collected.events)).toBe(toCanonical(oreSalePrice(bandTier)))
    expect(vehicleOf(collected.state, 'p1').cargo.ore).toEqual({ [String(bandTier)]: 1 })
    expect(rarityTripOf(collected.state, 'p1')).toEqual(rarityTripOf(atCap, 'p1'))
  })

  it('keeps the demoted find named by its own cell, so the codex still counts it found', () => {
    const ore = oreAt(EPIC_TILE)
    const start = p3State()
    const atCap = withRarityTrip(start, 'p1', { clampedValue: capOf(start, ore) })
    const [added] = collectOreUnit(atCap, 'p1', ore).events
    expect(added).toMatchObject({ oreId: ore.oreId, resourceTier: ore.resourceTier })
  })

  it('never touches the trip for common, uncommon and rare finds', () => {
    const tiles = unclampedTiles()
    expect(tiles.map((tile) => pickupFindAt(PARAMS, tile).tierAboveBand).sort()).toEqual([0, 1, 2])
    for (const tile of tiles) {
      const ore = oreAt(tile)
      const collected = collectOreUnit(p3State(), 'p1', ore)
      expect(valueAdded(collected.events)).toBe(toCanonical(oreSalePrice(ore.saleTier)))
      expect(hasSection(collected.state)).toBe(false)
    }
  })

  it('never clamps a signature find, whose lead is common on the mixed rows', () => {
    for (const planetIndex of [3, 4, 5]) {
      const finds = signatureFinds(planetIndex)
      expect(finds.length).toBeGreaterThan(0)
      expect(finds.filter((find) => isTripClamped(find.tierAboveBand))).toEqual([])
    }
  })

  it('does not advance the trip for a unit a full hold loses', () => {
    const start = p3State()
    const vehicle = vehicleOf(start, 'p1')
    const full = withVehicle(start, 'p1', {
      ...vehicle,
      cargo: { ...vehicle.cargo, coreFragments: capacityOf(start) },
    })
    const collected = collectOreUnit(full, 'p1', oreAt(EPIC_TILE))
    expect(collected.events).toEqual([{ type: 'StorageFull', lostUnits: 1 }])
    expect(hasSection(collected.state)).toBe(false)
  })

  it("sums the trip across bands and holds each find to its own band's cap", () => {
    const band3 = clampedTilesOf(PARAMS, 6, [3])
    const band4 = clampedTilesOf(PARAMS, 6, [4])
    const tiles = band3.flatMap((tile, index) => [tile, band4[index]])
    let state = p3State()
    let paidInFull = ZERO_MONEY
    for (const tile of tiles) {
      const ore = oreAt(tile)
      const collected = collectOreUnit(state, 'p1', ore)
      if (valueAdded(collected.events) === toCanonical(oreSalePrice(ore.saleTier))) {
        paidInFull = add(paidInFull, oreSalePrice(ore.saleTier))
      }
      state = collected.state
    }
    expect(cmp(paidInFull, capOf(state, oreAt(band3[0])))).toBeGreaterThan(0)
    expect(rarityTripOf(state, 'p1').clampedValue).toEqual(paidInFull)
  })
})

describe('ores: the rarity trip ends at the dock and on a rescue', () => {
  const SPENT = { clampedValue: fromCanonical('1234.5') }

  it('is fresh, and out of the state, after the player docks', () => {
    const session = createScriptedSession()
    const spent = withRarityTrip(session.state(), 'p1', SPENT)
    const docked = continueScriptedSession(spent)
    dockInBay(docked, 1, 'sell')
    expect(rarityTripOf(docked.state(), 'p1').clampedValue).toEqual(ZERO_MONEY)
    expect(hasSection(docked.state())).toBe(false)
  })

  it('is fresh after a rescue tows the stranded vehicle home', () => {
    const spent = withRarityTrip(createScriptedSession().state(), 'p1', SPENT)
    const session = continueScriptedSession(spent)
    session.submit(1, { type: 'undock', payload: {} })
    session.submit(1, { type: 'debug.setEnergy', payload: { energy: '0.05' } })
    session.submit(12, poseAbove(GROUND, FACING.right, { driveTicks: 12 }))
    session.advanceTo(12 + 180 + 60)
    expect(session.events().map((event) => event.type)).toContain('RescueTriggered')
    expect(hasSection(session.state())).toBe(false)
  })
})

describe('ores: the rarity trip section', () => {
  it('carries a mid-trip ledger through a snapshot round trip', () => {
    const collected = collectOreUnit(p3State(), 'p1', oreAt(EPIC_TILE)).state
    const restored = readSnapshot(
      JSON.parse(JSON.stringify(takeSnapshot(collected))) as SessionSnapshot,
    )
    expect(restored.problems).toEqual([])
    if (!('state' in restored)) throw new Error('snapshot refused')
    expect(rarityTripOf(restored.state, 'p1')).toEqual(rarityTripOf(collected, 'p1'))
  })

  it('refuses a body that is not a decimal amount of at least zero', () => {
    expect(RARITY_TRIP_SECTION.problems({ clampedValue: '-1' })).toEqual([
      'ores.rarity-trip.clampedValue must be a decimal string >= 0',
    ])
    expect(RARITY_TRIP_SECTION.problems('1')).toEqual(['ores.rarity-trip must be an object'])
    expect(RARITY_TRIP_SECTION.problems({ clampedValue: '0' })).toEqual([])
  })
})
