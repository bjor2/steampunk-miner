import { describe, expect, it } from 'vitest'
import type { CommandIntent } from '../../../systems/authority/authorityCommand'
import { createAuthorityState } from '../../../systems/authority/authorityState'
import { coreNeededOf } from '../../../systems/authority/coreBay'
import { noRouteDeaths } from '../../../systems/bot/botDeathReplay'
import type { BotPlanet } from '../../../systems/bot/botPilot'
import { createBotSession, type BotSession } from '../../../systems/bot/botSession'
import { serviceAtDock } from '../../../systems/bot/botShopping'
import { runTrip } from '../../../systems/bot/botTrip'
import { tileKindAt } from '../../../systems/bot/botWorld'
import { newMineLayout } from '../../../systems/bot/mineLayout'
import { nextRow } from '../../../systems/bot/tripGoal'
import { UPGRADE_IDS } from '../../../systems/economy/economyDefinition'
import { stepOfMajor } from '../../../systems/economy/upgradeSteps'
import { onCurveLevel } from '../../../systems/economy/vehicleStats'
import { setPlanetCommand, setPlanetSeedCommand } from '../../../systems/startScenarioCommands'
import { setUpgradeCommand } from '../../../systems/vehicle/vehicleCommands'
import { dockSiteOf } from '../../../systems/world/dockSite'
import { planetParamsFor } from '../../../systems/world/planetParams'

// The bot's shaft steps round a gated wall nothing it has opens (ticket 237, GD ruling: extractor
// cells stay optional until 148d, and #142 acceptance 8 has the bot skip drill-gated signatures),
// as it steps round lava, so the core trips still finish and no gate_blocked_no_route is noted.
// Both walls sit in the straight shaft column -10 of a pacing seed, above the core.

const CORE: { kind: 'core' } = { kind: 'core' }
const MAX_CORE_TRIPS = 60

/** Pacing seed 27182's planet 7: a `rig.resonance` wall at rows 34 to 36 of column -10. */
const RESONANCE_WALL = { seed: 27182, planet: 7, tile: { tx: -10, ty: 36 } }
/** Pacing seed 31415's planet 5: a drill-gated signature at rows 60 to 64, above the tip. */
const SIGNATURE_WALL = { seed: 31415, planet: 5, tile: { tx: -10, ty: 64 } }

function arrivedOn(planetIndex: number, seed: number): CommandIntent[] {
  return [
    setPlanetCommand(planetIndex),
    setPlanetSeedCommand(seed),
    { type: 'debug.setMoney', payload: { amount: '1e30' } },
    ...UPGRADE_IDS.map((id) => setUpgradeCommand(id, stepOfMajor(onCurveLevel(id, planetIndex)))),
    { type: 'debug.setCasingGrade', payload: { grade: 5 } },
    { type: 'debug.setLiningType', payload: { liningType: 'refractory' } },
    { type: 'debug.freezeEnemies', payload: { frozen: true } },
  ]
}

/** On-curve on the planet with no extractor, the casing and money a run brings; enemies frozen. */
function botOnCurve(planetIndex: number, seed: number): { session: BotSession; planet: BotPlanet } {
  const session = createBotSession(
    createAuthorityState({ planetIndex: 1, planetSeed: seed, playerIds: ['p1'] }),
    'p1',
  )
  for (const intent of arrivedOn(planetIndex, seed)) session.submit(intent)
  const params = planetParamsFor(seed, planetIndex)
  const layout = newMineLayout(params, dockSiteOf(params))
  return {
    session,
    planet: {
      layout,
      pilot: { position: layout.sellBay, facing: 0 },
      chargePolicy: 'never',
      hasMetBlastTile: false,
      shellChargeSize: 0,
      hasBeenDestroyedHere: false,
      routeDeaths: noRouteDeaths(),
      gateRouteBlocks: [],
    },
  }
}

function mineCoreUntilGoalEnds(session: BotSession, planet: BotPlanet): void {
  for (let trip = 0; trip < MAX_CORE_TRIPS && !session.state().core.isCompleted; trip++) {
    if (nextRow(planet.layout, CORE) === null) return
    runTrip(session, planet, CORE)
    serviceAtDock(session)
  }
}

describe('bot: the shaft steps round gated walls', () => {
  it.each([
    ['an extractor wall', RESONANCE_WALL],
    ['a drill-gated signature', SIGNATURE_WALL],
  ])('jogs round %s in its column, finishes the core and notes no stall', (_name, wall) => {
    const { session, planet } = botOnCurve(wall.planet, wall.seed)
    mineCoreUntilGoalEnds(session, planet)
    const state = session.state()
    expect(state.core.isCompleted).toBe(true)
    expect(state.platform.coreBay).toBeGreaterThanOrEqual(coreNeededOf(state.planet) ?? Infinity)
    expect(planet.layout.shaftJogs.length).toBeGreaterThan(0)
    expect(tileKindAt(state, wall.tile)).toBe('ore')
    expect(planet.gateRouteBlocks).toEqual([])
  })
})
