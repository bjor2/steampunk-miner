import { describe, expect, it } from 'vitest'
import { createAuthorityState } from '../authority/authorityState'
import {
  corridorCommands,
  CORRIDOR_MIDDLE,
  poseAt,
  setHull,
  setUpgrade,
  spawnEnemy,
} from '../authority/combat/combatFixtures'
import { coreNeededOf } from '../authority/coreBay'
import { isTravelSetByDrill } from '../authority/travelSpeed'
import { WORLD_SEED } from '../authority/scriptedSession'
import { FACING } from '../vehicle/vehiclePose'
import { faceThreats } from './botCombat'
import { moveStraight, type BotPlanet } from './botPilot'
import { createBotSession, type BotSession } from './botSession'
import { botPlanetOf, travelWhenReady } from './botTravel'
import { waitForTow } from './botTrip'

/** Ticks a hunting crawler takes to notice the vehicle and start closing in. */
const NOTICE_TICKS = 10
const DRIVE_TILES = 6
/** The planet 1 on-curve hull the corridor stands the vehicle up with (#25 acceptance 2). */
const ON_CURVE_HULL = '125.44'
/** A hull one crawler bite ends. */
const WRECK_HULL = '1'
const BITE_WAIT_TICKS = 60
const RICH = '1000000'
/**
 * The highest drill purchase that leaves planet 1's travel to the engine (its 6 m/s; drill power
 * grows per purchase since #552, so this was major 8): purchase 6 drives the rig at 6.66 m/s, and
 * the corridor's fight drill (purchase 8) at 10.3 m/s, past what a crawler two tiles behind can
 * catch in six tiles.
 */
const ENGINE_BOUND_DRILL_LEVEL = 5

/** The combat specs' planet 1 corridor (#25), the bot in its middle facing along it. */
function botInCorridor(): { session: BotSession; planet: BotPlanet } {
  const start = createAuthorityState({ planetIndex: 1, planetSeed: WORLD_SEED, playerIds: ['p1'] })
  const session = createBotSession(start, 'p1')
  for (const { tick, intent } of corridorCommands(FACING.right)) {
    session.wait(tick - session.tick())
    session.submit(intent)
  }
  session.submit(setUpgrade('drill_power', ENGINE_BOUND_DRILL_LEVEL))
  const planet = botPlanetOf(session, 'never')
  planet.pilot.position = CORRIDOR_MIDDLE
  return { session, planet }
}

/** A crawler bites the rear of a one-point hull, and the bot waits out the tow home (#7). */
function destroyAndTow(session: BotSession, planet: BotPlanet): void {
  session.submit(setHull(WRECK_HULL))
  session.submit(spawnEnemy('crawler', 1, -1))
  session.wait(BITE_WAIT_TICKS)
  waitForTow(session, planet)
}

/** Out of the Sell bay and back in the corridor's middle with the on-curve hull. */
function returnToCorridor(session: BotSession, planet: BotPlanet): void {
  session.submit({ type: 'undock', payload: {} })
  session.submit(setHull(ON_CURVE_HULL))
  session.submit(poseAt(CORRIDOR_MIDDLE, { facing: FACING.right }))
  planet.pilot.position = CORRIDOR_MIDDLE
}

/** A crawler two tiles behind closes in while the bot drives six tiles on along the corridor. */
function driveWithCrawlerBehind(session: BotSession, planet: BotPlanet): void {
  session.submit(spawnEnemy('crawler', 1, -2))
  session.wait(NOTICE_TICKS)
  moveStraight(session, planet, { tx: CORRIDOR_MIDDLE.tx + DRIVE_TILES, ty: CORRIDOR_MIDDLE.ty })
}

/** The planet 1 core in the bay and the travel fee in the wallet, docked after the tow. */
function readyToTravel(session: BotSession): void {
  const needed = coreNeededOf(session.state().planet) ?? 0
  session.submit({ type: 'debug.setMoney', payload: { amount: RICH } })
  session.submit({ type: 'debug.setCoreFragments', payload: { count: needed } })
}

const hitArcsOf = (session: BotSession, fromEvent: number) =>
  session
    .events()
    .slice(fromEvent)
    .flatMap((event) => (event.type === 'VehicleDamaged' ? [event.arc] : []))

describe('bot: combat reflex on the move (#29 Gameplay note 3, #130)', () => {
  it('drives on with its back to a crawler on a planet where it has not been destroyed', () => {
    const { session, planet } = botInCorridor()
    expect(isTravelSetByDrill(session.state(), session.playerId)).toBe(false)
    const fromEvent = session.events().length
    driveWithCrawlerBehind(session, planet)
    expect(hitArcsOf(session, fromEvent)).toContain('rear')
  })

  it('meets a crawler hunting it from behind with the drill head once destroyed on the planet', () => {
    // #130: every hit of a long dive came while the bot drove, on the sides and rear, and the
    // same fatal trip replayed after each tow (378 deaths on planet 7).
    const { session, planet } = botInCorridor()
    destroyAndTow(session, planet)
    returnToCorridor(session, planet)
    const fromEvent = session.events().length
    driveWithCrawlerBehind(session, planet)
    // Every bite lands on the drill head; the engine-bound drill takes two to kill the crawler.
    expect([...new Set(hitArcsOf(session, fromEvent))]).toEqual(['front'])
    expect(session.events().slice(fromEvent)).toContainEqual(
      expect.objectContaining({ type: 'EnemyKilled', kind: 'crawler', by: 'drill' }),
    )
    expect(planet.pilot.position).toEqual({
      tx: CORRIDOR_MIDDLE.tx + DRIVE_TILES,
      ty: CORRIDOR_MIDDLE.ty,
    })
  })

  it('drives carelessly again on the next planet after travel', () => {
    const { session, planet } = botInCorridor()
    destroyAndTow(session, planet)
    readyToTravel(session)
    const nextPlanet = travelWhenReady(session, planet)
    expect(session.state().planet.index).toBe(2)
    expect(planet.hasBeenDestroyedHere).toBe(true)
    expect(nextPlanet.hasBeenDestroyedHere).toBe(false)
  })
})

/** Ticks one `faceThreats` call holds the bot where it stands. */
function ticksHeldFacing(session: BotSession, planet: BotPlanet): number {
  const from = session.tick()
  faceThreats(session, planet.pilot)
  return session.tick() - from
}

describe('bot: combat reflex between bores (ticket 418)', () => {
  it('gives up on a crawler walled off in the rock after 600 ticks in all, not on every bore', () => {
    // On planet 1 a crawler hunting from a cave behind solid rock held the bot 10 s on every tile
    // it cut beside the cave: 10 of the 34 minutes to the core.
    const { session, planet } = botInCorridor()
    session.submit(spawnEnemy('crawler', 1, 0, -2))
    session.wait(NOTICE_TICKS)
    expect(ticksHeldFacing(session, planet)).toBe(600)
    expect(session.state().combat.enemies).toContainEqual(
      expect.objectContaining({ kind: 'crawler', phase: expect.not.stringMatching(/^idle$/) }),
    )
    expect(ticksHeldFacing(session, planet)).toBe(0)
  })
})
