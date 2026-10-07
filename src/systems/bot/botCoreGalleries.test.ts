import { describe, expect, it } from 'vitest'
import { createAuthorityState } from '../authority/authorityState'
import type { CommandIntent } from '../authority/authorityCommand'
import { coreNeededOf } from '../authority/coreBay'
import { UPGRADE_IDS } from '../economy/economyDefinition'
import { coreFragmentsNeeded } from '../economy/planetEconomy'
import { onCurveLevel } from '../economy/vehicleStats'
import { setPlanetCommand, setPlanetSeedCommand } from '../startScenarioCommands'
import { setUpgradeCommand } from '../vehicle/vehicleCommands'
import { dockSiteOf } from '../world/dockSite'
import { coreTileCount } from '../world/planetGeometry'
import { planetParamsFor } from '../world/planetParams'
import type { TilePoint } from '../world/tileGrid'
import type { BotPlanet } from './botPilot'
import { createBotSession, type BotSession } from './botSession'
import { serviceAtDock } from './botShopping'
import { runTrip } from './botTrip'
import {
  isCoreTileAt,
  markSideDone,
  newMineLayout,
  shaftColumnAt,
  type GallerySide,
  type MineLayout,
} from './mineLayout'
import { nextRow, sideFor } from './tripGoal'
import { stepOfMajor } from '../economy/upgradeSteps'

const CORE: { kind: 'core' } = { kind: 'core' }

/**
 * Seed 10's planet 9: the shaft starts at column -10, west of the core's middle, but its jogs
 * round lava bring it down through the core at column 7, east of the middle. This was seed 27182
 * (#136) until the #175 pad moved the shaft from -8 to -10 and its jogs stayed west.
 */
const OFF_CENTRE_SEED = 10
const OFF_CENTRE_PLANET = 9
/** More core trips than the core needs; on main the core goal ran out after about a dozen. */
const MAX_CORE_TRIPS = 60

/** On-curve on planet 9, with the casing, lining and money a run brings there; enemies frozen. */
const ARRIVED_ON_PLANET_9: CommandIntent[] = [
  setPlanetCommand(OFF_CENTRE_PLANET),
  setPlanetSeedCommand(OFF_CENTRE_SEED),
  { type: 'debug.setMoney', payload: { amount: '1e30' } },
  ...UPGRADE_IDS.map((id) =>
    setUpgradeCommand(id, stepOfMajor(onCurveLevel(id, OFF_CENTRE_PLANET))),
  ),
  { type: 'debug.setCasingGrade', payload: { grade: 5 } },
  { type: 'debug.setLiningType', payload: { liningType: 'refractory' } },
  { type: 'debug.freezeEnemies', payload: { frozen: true } },
]

function botOnPlanet9(): { session: BotSession; planet: BotPlanet } {
  const start = createAuthorityState({
    planetIndex: 1,
    planetSeed: OFF_CENTRE_SEED,
    playerIds: ['p1'],
  })
  const session = createBotSession(start, 'p1')
  for (const intent of ARRIVED_ON_PLANET_9) session.submit(intent)
  const params = planetParamsFor(OFF_CENTRE_SEED, OFF_CENTRE_PLANET)
  const layout = newMineLayout(params, dockSiteOf(params))
  return {
    session,
    planet: {
      layout,
      pilot: { position: layout.sellBay, facing: 0 },
      chargePolicy: 'never',
      hasMetBlastTile: false,
      hasBeenDestroyedHere: false,
    },
  }
}

/** Core trips, serviced at the dock between, while the core goal still names a gallery. */
function mineCoreUntilGoalEnds(session: BotSession, planet: BotPlanet): void {
  for (let trip = 0; trip < MAX_CORE_TRIPS && !session.state().core.isCompleted; trip++) {
    if (nextRow(planet.layout, CORE) === null) return
    runTrip(session, planet, CORE)
    serviceAtDock(session)
  }
}

describe('pacing bot core galleries from an off-centre shaft (#136)', () => {
  it('completes the core of seed 10 planet 9, whose shaft jogs across the core middle', () => {
    const { session, planet } = botOnPlanet9()
    mineCoreUntilGoalEnds(session, planet)
    const state = session.state()
    expect(shaftColumnAt(planet.layout, 0)).toBeGreaterThan(0)
    expect(state.platform.coreBay).toBeGreaterThanOrEqual(coreNeededOf(state.planet) ?? Infinity)
    expect(state.core.isCompleted).toBe(true)
  })
})

/**
 * The layout's core goal alone, with every gallery side the bot is sent to bored to its end: the
 * core tiles each side passes beside, in its own row and the rows above and below.
 */
function coreTilesOfSide(layout: MineLayout, row: number, side: GallerySide): TilePoint[] {
  const shaft = shaftColumnAt(layout, row)
  const reach = layout.params.coreRadiusTiles + 1
  const columns = side === 'east' ? rangeOf(shaft + 1, reach) : rangeOf(-reach, shaft - 1)
  return columns
    .flatMap((tx) => [row + 1, row, row - 1].map((ty) => ({ tx, ty })))
    .filter((tile) => isCoreTileAt(layout, tile))
}

function rangeOf(from: number, to: number): number[] {
  return Array.from({ length: Math.max(0, to - from + 1) }, (_, index) => from + index)
}

/** Every core tile the core goal's galleries reach before it names no row. */
function coreTilesTheGoalReaches(layout: MineLayout): Set<string> {
  const reached = new Set<string>()
  for (let row = nextRow(layout, CORE); row !== null; row = nextRow(layout, CORE)) {
    const side = sideFor(layout, row, CORE)
    if (side === null) break
    for (const tile of coreTilesOfSide(layout, row, side)) reached.add(`${tile.tx},${tile.ty}`)
    markSideDone(layout, row, side)
  }
  return reached
}

/** Planet 9's layout with the shaft entering from column `top` and through the core at `atCore`. */
function layoutThroughCoreAt(top: number, atCore: number): MineLayout {
  const params = planetParamsFor(OFF_CENTRE_SEED, OFF_CENTRE_PLANET)
  const layout = { ...newMineLayout(params, dockSiteOf(params)), shaftColumn: top }
  layout.shaftJogs.push({ row: params.coreRadiusTiles + 4, column: atCore })
  return layout
}

describe('pacing bot core gallery rows (#136)', () => {
  const params = planetParamsFor(OFF_CENTRE_SEED, OFF_CENTRE_PLANET)
  const radius = params.coreRadiusTiles
  const needed = coreFragmentsNeeded(coreTileCount(params))
  const shaftColumns = rangeOf(-radius, radius)

  it.each([-8, 7])(
    'offers core galleries until the fragment target can be met, from a shaft entering at %i',
    (top) => {
      const short = shaftColumns.filter(
        (atCore) => coreTilesTheGoalReaches(layoutThroughCoreAt(top, atCore)).size < needed,
      )
      expect(short).toEqual([])
    },
  )
})
