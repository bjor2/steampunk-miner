import { describe, expect, it } from 'vitest'
import { createAuthorityState } from '../authority/authorityState'
import {
  corridorCommands,
  CORRIDOR_MIDDLE,
  poseAt,
  setHull,
  spawnEnemy,
} from '../authority/combat/combatFixtures'
import { coreNeededOf } from '../authority/coreBay'
import { WORLD_SEED } from '../authority/scriptedSession'
import { FACING } from '../vehicle/vehiclePose'
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

/** The combat specs' planet 1 corridor (#25), the bot in its middle facing along it. */
function botInCorridor(): { session: BotSession; planet: BotPlanet } {
  const start = createAuthorityState({ planetIndex: 1, planetSeed: WORLD_SEED, playerIds: ['p1'] })
  const session = createBotSession(start, 'p1')
  for (const { tick, intent } of corridorCommands(FACING.right)) {
    session.wait(tick - session.tick())
    session.submit(intent)
  }
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
    expect(hitArcsOf(session, fromEvent)).toEqual(['front'])
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
