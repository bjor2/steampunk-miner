import { describe, expect, it } from 'vitest'
import { createAuthorityState } from '../authority/authorityState'
import { dockSiteOfPlanet } from '../authority/planetOfState'
import { onCurveLevel } from '../economy/vehicleStats'
import { leadCeiling } from './botCoreRule'
import { buyUpgrades } from './botShopping'
import { createBotSession, type BotSession } from './botSession'
import { paramsOfSession } from './botWorld'
import { newMineLayout } from './mineLayout'

const WORLD_SEED = 83921
/** More money than any planet's tracks can absorb. */
const DEEP_WALLET = '1e15'

/** The bot docked at the Upgrade bay of planet `planetIndex`, with money to spare. */
function botAtUpgradeBayOn(planetIndex: number): BotSession {
  const start = createAuthorityState({ planetIndex: 1, planetSeed: WORLD_SEED, playerIds: ['p1'] })
  const session = createBotSession(start, 'p1')
  session.submit({ type: 'debug.setPlanet', payload: { planetIndex } })
  session.submit({ type: 'debug.setMoney', payload: { amount: DEEP_WALLET } })
  session.submit({ type: 'debug.teleportToDock', payload: { bay: 'upgrade' } })
  return session
}

/** Shops with the core as the goal, so the forced core rule leads. */
function shopForTheCore(session: BotSession): void {
  const site = dockSiteOfPlanet(session.state().planet)!
  buyUpgrades(session, {
    layout: newMineLayout(paramsOfSession(session.state()), site),
    isCoreTheGoal: true,
    gunPolicy: 'never',
    hasMetBlastTile: false,
  })
}

describe('bot: shopping at the Upgrade bay', () => {
  it('holds drill power to one level past the planet on-curve level (#86)', () => {
    expect(leadCeiling('drill_power', 1)).toBe(onCurveLevel('drill_power', 1) + 1)
    expect(leadCeiling('drill_power', 3)).toBe(onCurveLevel('drill_power', 3) + 1)
  })

  it('stops buying drill power for the core at the ceiling, however much money is left', () => {
    const session = botAtUpgradeBayOn(2)
    shopForTheCore(session)
    expect(session.vehicle().levels.drill_power).toBe(leadCeiling('drill_power', 2))
  })

  it('spends what the drill power ceiling saves on the other tracks', () => {
    const session = botAtUpgradeBayOn(3)
    shopForTheCore(session)
    const { drill_power, engine, boiler, cargo_hold } = session.vehicle().levels
    expect(drill_power).toBe(leadCeiling('drill_power', 3))
    expect(Math.min(engine, boiler, cargo_hold)).toBeGreaterThan(0)
  })

  it('buys drill_tip past its on-curve level for the core once drill power is at its cap', () => {
    const session = botAtUpgradeBayOn(4)
    shopForTheCore(session)
    expect(session.vehicle().levels.drill_tip).toBeGreaterThan(onCurveLevel('drill_tip', 4))
  })

  it('stops buying drill_tip for the core at its cap, two levels past on-curve', () => {
    const session = botAtUpgradeBayOn(4)
    shopForTheCore(session)
    expect(leadCeiling('drill_tip', 4)).toBe(onCurveLevel('drill_tip', 4) + 2)
    expect(session.vehicle().levels.drill_tip).toBe(leadCeiling('drill_tip', 4))
  })
})
