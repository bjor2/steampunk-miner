import { describe, expect, it } from 'vitest'
import { vehicleOf, type AuthorityState } from '../../systems/authority/authorityState'
import { blastTilesAround } from '../../systems/authority/charges/blastOre'
import {
  fiveOreBlastSite,
  poseOnTile,
  setChargesIntent,
  PLANT,
} from '../../systems/authority/charges/chargeFixtures'
import type { DomainEvent } from '../../systems/authority/domainEvent'
import { EPIC_LEAD, withOreLeadAt } from '../../systems/authority/leadOreFixtures'
import {
  continueScriptedSession,
  createScriptedSession,
  FREEZE_ENEMIES,
  mineTile,
  PARAMS,
  surfaceOreTiles,
  type ScriptedSession,
} from '../../systems/authority/scriptedSession'
import { oreSalePrice } from '../../systems/economy/oreEconomy'
import { onCurveSteps } from '../../systems/economy/vehicleStats'
import { add, fromCanonical, toCanonical, ZERO_MONEY } from '../../systems/money'
import { setUpgradeCommand } from '../../systems/vehicle/vehicleCommands'
import { FACING } from '../../systems/vehicle/vehiclePose'
import { statsOfVehicle } from '../../systems/vehicle/vehicleState'
import type { TilePoint } from '../../systems/world/tileGrid'
import { CELL_KIND, kindOfCell } from '../../systems/world/worldCell'
import { cellAt, EMPTY_WORLD } from '../../systems/world/worldState'
import { rarityTripCapAt } from './systems/rarityTripClamp'
import { rarityTripOf, withRarityTrip } from './systems/rarityTripSection'

// The trip clamp runs on the kernel's own pickup routes (ticket 509, TD ruling 6221725921 on #445
// section 6: one test per route): the drill and a blast. Planet 1 rock, its ore made epic finds of
// their bands, a strong drill and a big hold, so a fresh trip pays them in full and a spent one
// pays each at its band's own ore.

/** On-curve planet-10 gear: a drill that cuts a P1 epic and a hold whose cap fits several. */
const GEAR_PLANET = 10
const FUSE_TICKS = 120
const BLAST_RESOLVED_TICK = 1 + FUSE_TICKS + 5

interface RouteRun {
  state: AuthorityState
  events: DomainEvent[]
}

/** Planet 1 with frozen enemies and planet-10 gear, its `tiles` turned into epic finds. */
function geared(tiles: readonly TilePoint[], isTripSpent: boolean): ScriptedSession {
  const session = createScriptedSession()
  const steps = onCurveSteps(GEAR_PLANET)
  session.submit(0, FREEZE_ENEMIES)
  for (const upgradeId of ['drill_power', 'drill_tip', 'cargo_hold'] as const) {
    session.submit(0, setUpgradeCommand(upgradeId, steps[upgradeId]))
  }
  const epic = withOreLeadAt(session.state(), PARAMS, tiles, EPIC_LEAD)
  return continueScriptedSession(isTripSpent ? withTripPastEveryCap(epic) : epic)
}

/** The trip already past the cap of every band, so any epic find is held to its band's ore. */
function withTripPastEveryCap(state: AuthorityState): AuthorityState {
  const capacity = statsOfVehicle(vehicleOf(state, 'p1')).cargoCapacity
  return withRarityTrip(state, 'p1', { clampedValue: rarityTripCapAt(1, 5, capacity) })
}

function drillRoute(isTripSpent: boolean): RouteRun {
  const [tile] = surfaceOreTiles(1)
  const session = geared([tile], isTripSpent)
  mineTile(session, 1, tile)
  return { state: session.state(), events: session.events() }
}

function blastRoute(isTripSpent: boolean): RouteRun {
  const { wall } = fiveOreBlastSite()
  const ore = blastTilesAround(wall, 1).filter(
    (tile) => kindOfCell(cellAt(EMPTY_WORLD, PARAMS, tile)) === CELL_KIND.ore,
  )
  const session = geared(ore, isTripSpent)
  session.submit(0, setChargesIntent(3))
  session.submit(0, poseOnTile({ tx: wall.tx - 1, ty: wall.ty }))
  session.submit(1, PLANT)
  session.submit(2, poseOnTile({ tx: wall.tx - 5, ty: wall.ty }, FACING.right))
  session.advanceTo(BLAST_RESOLVED_TICK)
  return { state: session.state(), events: session.events() }
}

const cargoAddedOf = (events: readonly DomainEvent[]) =>
  events.filter(
    (event): event is Extract<DomainEvent, { type: 'CargoAdded' }> => event.type === 'CargoAdded',
  )

const sumOf = (values: readonly string[]) =>
  values.reduce((total, value) => add(total, fromCanonical(value)), ZERO_MONEY)

const ROUTES = [
  ['drill', drillRoute],
  ['blast', blastRoute],
] as const

describe('ores: the trip clamp on the kernel pickup routes', () => {
  it.each(ROUTES)('%s: pays a fresh trip its epic finds in full and counts them', (_, route) => {
    const { state, events } = route(false)
    const added = cargoAddedOf(events)
    const fullValues = added.map((event) => toCanonical(oreSalePrice(event.resourceTier)))
    expect(added.length).toBeGreaterThan(0)
    expect(added.map((event) => event.value)).toEqual(fullValues)
    expect(rarityTripOf(state, 'p1').clampedValue).toEqual(sumOf(fullValues))
  })

  it.each(ROUTES)("%s: pays a spent trip's epic finds at their band ore", (_, route) => {
    const { state, events } = route(true)
    const added = cargoAddedOf(events)
    const bandValues = added.map((event) =>
      toCanonical(oreSalePrice(event.resourceTier - EPIC_LEAD)),
    )
    expect(added.length).toBeGreaterThan(0)
    expect(added.map((event) => event.value)).toEqual(bandValues)
    expect(rarityTripOf(state, 'p1')).toEqual(rarityTripOf(withTripPastEveryCap(state), 'p1'))
  })
})
