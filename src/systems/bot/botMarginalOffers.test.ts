import { describe, expect, it } from 'vitest'
import { createAuthorityState } from '../authority/authorityState'
import { dockSiteOfPlanet } from '../authority/planetOfState'
import { vehicleStatsAt, type UpgradeLevels } from '../economy/vehicleStats'
import { fromSafeInteger } from '../money'
import { ticksPerTile } from '../vehicle/drillRule'
import { bestMarginalPurchase } from './botMarginalOffers'
import { createBotSession, type BotSession } from './botSession'
import { paramsOfSession } from './botWorld'
import { newMineLayout } from './mineLayout'

const WORLD_SEED = 83921
/** Pays for drill power's first two purchases with the next service kept back. */
const PLANET_ONE_WALLET = '1000'
/** Past the boiler rule's 20% (`botBoiler.ts`), so only the marginal rule shops. */
const FRESH_RIG_LEVELS = { boiler: 24, cargo_hold: 3 }

/** A fresh planet 1 rig at the Upgrade bay: drill power and the tip still at purchase 0. */
function freshRigAtUpgradeBay(): BotSession {
  const start = createAuthorityState({ planetIndex: 1, planetSeed: WORLD_SEED, playerIds: ['p1'] })
  const session = createBotSession(start, 'p1')
  session.submit({ type: 'debug.setMoney', payload: { amount: PLANET_ONE_WALLET } })
  session.submit({ type: 'debug.teleportToDock', payload: { bay: 'upgrade' } })
  for (const [upgradeId, level] of Object.entries(FRESH_RIG_LEVELS)) {
    session.submit({ type: 'debug.setUpgrade', payload: { upgradeId, level } })
  }
  return session
}

function marginalPickOf(session: BotSession) {
  const site = dockSiteOfPlanet(session.state().planet)!
  return bestMarginalPurchase(session, newMineLayout(paramsOfSession(session.state()), site))
}

function bandOneTicksAt(levels: UpgradeLevels): number | null {
  return ticksPerTile(vehicleStatsAt(levels), fromSafeInteger(1))
}

describe('pacing bot marginal offers', () => {
  it('finds drill power purchase 1 too small to move a whole-tick tile time on its own', () => {
    const levels = freshRigAtUpgradeBay().vehicle().levels
    expect(bandOneTicksAt({ ...levels, drill_power: 1 })).toBe(bandOneTicksAt(levels))
    expect(bandOneTicksAt({ ...levels, drill_power: 2 })).toBeLessThan(bandOneTicksAt(levels)!)
  })

  it('offers drill power from purchase 0, looking past a first purchase that plans no gain (#552)', () => {
    expect(marginalPickOf(freshRigAtUpgradeBay())).toBe('drill_power')
  })
})
