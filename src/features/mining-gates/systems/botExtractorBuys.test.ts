import { describe, expect, it } from 'vitest'
import type { CommandIntent } from '../../../systems/authority/authorityCommand'
import { createAuthorityState } from '../../../systems/authority/authorityState'
import { buyVehicleItemCommand } from '../../../systems/authority/loadoutCommands'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { noRouteDeaths } from '../../../systems/bot/botDeathReplay'
import type { BotPlanet } from '../../../systems/bot/botPilot'
import { createBotSession, type BotSession } from '../../../systems/bot/botSession'
import { playSliceFrom } from '../../../systems/bot/playSlice'
import { newMineLayout } from '../../../systems/bot/mineLayout'
import { UPGRADE_IDS } from '../../../systems/economy/economyDefinition'
import { stepOfMajor } from '../../../systems/economy/upgradeSteps'
import { onCurveLevel } from '../../../systems/economy/vehicleStats'
import { setPlanetCommand, setPlanetSeedCommand } from '../../../systems/startScenarioCommands'
import { setUpgradeCommand } from '../../../systems/vehicle/vehicleCommands'
import { botPurchases } from '../../../systems/registries/botPurchases'
import { dockSiteOf } from '../../../systems/world/dockSite'
import { planetParamsFor } from '../../../systems/world/planetParams'
import { FIXTURE_SEED } from './gateFixtures'
import { GATE_ROWS } from './gateRows'
import { availableFromPlanet, ownsRig } from './rigs'

// #142 acceptance 7 (ticket 296): on its own planet the bot researches the extractor's node and
// buys the extractor ahead of its track levels, saving for them while the wallet is short. The bot
// arrives on curve with an empty wallet, so every coin comes from that planet's trips; whether a
// pacing run buys within its first 4 trips is `balance:charges`' table over the three seeds.

/** Long enough for the planet's core: the run stops there or here. */
const BUDGET_TICKS = 3 * 60 * 60 * 60

const RESONANCE = GATE_ROWS.rigs[0]

function arrivedBroke(planetIndex: number): CommandIntent[] {
  return [
    setPlanetCommand(planetIndex),
    setPlanetSeedCommand(FIXTURE_SEED),
    { type: 'debug.setMoney', payload: { amount: '0' } },
    ...UPGRADE_IDS.map((id) => setUpgradeCommand(id, stepOfMajor(onCurveLevel(id, planetIndex)))),
    { type: 'debug.setCasingGrade', payload: { grade: 5 } },
    { type: 'debug.setLiningType', payload: { liningType: 'refractory' } },
    { type: 'debug.freezeEnemies', payload: { frozen: true } },
  ]
}

function botArrivedBroke(planetIndex: number): { session: BotSession; planet: BotPlanet } {
  const session = createBotSession(
    createAuthorityState({ planetIndex: 1, planetSeed: FIXTURE_SEED, playerIds: ['p1'] }),
    'p1',
  )
  for (const intent of arrivedBroke(planetIndex)) session.submit(intent)
  const params = planetParamsFor(FIXTURE_SEED, planetIndex)
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

function isNodeResearched(event: DomainEvent): boolean {
  return event.type === 'tech-tree.TechNodeUnlocked' && event.nodeId === RESONANCE.unlockedBy
}

function isExtractorBought(event: DomainEvent): boolean {
  return event.type === 'VehicleItemPurchased' && event.itemId === RESONANCE.id
}

/** Nothing bought on a track before `at`. */
function isAheadOfEveryTrack(events: readonly DomainEvent[], at: number): boolean {
  return !events.slice(0, at).some((event) => event.type === 'UpgradePurchased')
}

describe('bot: extractor buys (ticket 296, #142 acceptance 7)', () => {
  it('researches the node and buys the extractor on its planet before any track level', () => {
    const planetIndex = availableFromPlanet(RESONANCE)
    const { session, planet } = botArrivedBroke(planetIndex)
    playSliceFrom(session, planet, { lastPlanet: planetIndex, maxTicks: BUDGET_TICKS })
    const events = session.events()
    const researched = events.findIndex(isNodeResearched)
    const bought = events.findIndex(isExtractorBought)
    expect(ownsRig(session.state(), 'p1', RESONANCE.id)).toBe(true)
    expect(researched).toBeGreaterThanOrEqual(0)
    expect(researched).toBeLessThan(bought)
    expect(isAheadOfEveryTrack(events, bought)).toBe(true)
  })
})

/** Docked at the Upgrade bay of `planetIndex` with money for anything there. */
function botDockedRich(planetIndex: number): BotSession {
  const session = createBotSession(
    createAuthorityState({ planetIndex: 1, planetSeed: FIXTURE_SEED, playerIds: ['p1'] }),
    'p1',
  )
  session.submit(setPlanetCommand(planetIndex))
  session.submit({ type: 'debug.setMoney', payload: { amount: '1e15' } })
  session.submit({ type: 'debug.teleportToDock', payload: { bay: 'upgrade' } })
  return session
}

/** Every payload some slice names due ahead of the tracks now. */
function duePayloadsOf(session: BotSession): unknown[] {
  return botPurchases().flatMap(
    (purchase) => purchase.duePayloadsOf?.(session.state(), session.playerId) ?? [],
  )
}

describe('bot: the extractor is due ahead of the tracks on its planet (ticket 296)', () => {
  it('is not due before its planet', () => {
    expect(duePayloadsOf(botDockedRich(availableFromPlanet(RESONANCE) - 1))).toEqual([])
  })

  it('names its node due, then the extractor once researched, then nothing once owned', () => {
    const session = botDockedRich(availableFromPlanet(RESONANCE))
    expect(duePayloadsOf(session)).toEqual([{ nodeId: RESONANCE.unlockedBy }])
    session.submit({ type: 'tech-tree.unlock_node', payload: { nodeId: RESONANCE.unlockedBy } })
    expect(duePayloadsOf(session)).toEqual([{ itemId: RESONANCE.id }])
    session.submit(buyVehicleItemCommand(RESONANCE.id))
    expect(duePayloadsOf(session)).toEqual([])
  })
})
