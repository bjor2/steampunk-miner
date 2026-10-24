import { beforeAll, describe, expect, it } from 'vitest'
import { PACING_WORLD_SEEDS } from '../constants/pacingSeeds'
import { TICKS_PER_SECOND } from '../constants/physics'
import { coreNeededOf } from '../systems/authority/coreBay'
import { dockedBayOf } from '../systems/authority/dockRules'
import type { DomainEvent } from '../systems/authority/domainEvent'
import { nextHopShortfallOf } from '../systems/authority/starMap/fuelShopRules'
import { jumpFuelUnitsOf } from '../systems/economy/jumpFuel'
import type { BotSession } from '../systems/bot/botSession'
import { serviceAtDock } from '../systems/bot/botShopping'
import { botPlanetOf } from '../systems/bot/botTravel'
import { driveToSellBay, runTrip } from '../systems/bot/botTrip'
import type { MineLayout } from '../systems/bot/mineLayout'
import { arrivedPaceSessionOn, playToCoreFrom } from '../systems/bot/paceArrival'
import { playSliceFrom } from '../systems/bot/playSlice'
import {
  add,
  div,
  fromCanonical,
  fromSafeInteger,
  toSafeInteger,
  ZERO_MONEY,
  type Money,
} from '../systems/money'
import { buyFuelCommand, jumpToPlanetCommand } from '../systems/platform/platformCommands'
import {
  gatedCoreRevisitProblemsOf,
  printedCoreRevisitLinesOf,
  type CoreRevisitRun,
} from './coreRevisitBars'

// "Completed-core revisit" (ticket 801, the #790 follow-up; the #756 back-travel bar, VS). On each
// pacing seed (83921, 31415, 27182) and each of planets 1 to 4, the bot arrives on the planet with
// its on-curve gear (`paceArrival.ts`) and plays it to its core, then jumps on to the next planet.
// The frontier rate is its money a minute from there to that planet's core. The revisit jumps back
// instead: the core tiles grow back on entry, but the bay landed completed (ticket 790), so the
// bot's core trips bore the shaft down to the core and turn there, the fragments worth nothing.
// That trip, the shaft's ore and the core it reaches, is the revisit's best case; re-mining the
// whole core only adds minutes. Its money a minute must stay under the frontier's on the median
// seed (`coreRevisitBars.ts`). A miss goes to Systems and the VS as a bay-cap or fragment-value
// row; the bot is not retuned. Hours of play, so it runs only when named:
//   npx vitest run src/logging/coreRevisit.lane.test.ts
const RUN_TIMEOUT_MS = 6 * 60 * 60 * 1000
/** One planet's core at most, as the star-map lane allows: a run that drags shows as a low rate. */
const PLANET_BUDGET_TICKS = 2 * 60 * 60 * TICKS_PER_SECOND
/** Core trips the revisit gets to reach the core; a shaft still short after them shows as it is. */
const REVISIT_TRIPS_MAX = 12
const SEEDS = PACING_WORLD_SEEDS['bot-slice']
const PLAYER_ID = 'p1'
const REVISIT_PLANETS = [1, 2, 3, 4]
const TICKS_PER_MINUTE = 60 * TICKS_PER_SECOND

describe('completed-core revisit: re-mined cores against the frontier, three seeds (ticket 801)', () => {
  let revisits: CoreRevisitRun[] = []

  beforeAll(() => {
    revisits = SEEDS.flatMap((worldSeed) =>
      REVISIT_PLANETS.map((planet) => coreRevisitRunOf(worldSeed, planet)),
    )
  }, RUN_TIMEOUT_MS)

  it('earns less a minute re-mining a completed core than on the frontier, on the median seed', () => {
    expect(gatedCoreRevisitProblemsOf(revisits)).toEqual([])
  })

  it('prints the revisit and frontier rates of every planet', () => {
    console.log(['Completed-core revisit:', ...printedCoreRevisitLinesOf(revisits)].join('\n'))
    expect(revisits).toHaveLength(SEEDS.length * REVISIT_PLANETS.length)
  })
})

function coreRevisitRunOf(worldSeed: number, planet: number): CoreRevisitRun {
  return {
    worldSeed,
    planet,
    revisitRate: revisitRateOf(revisitedSessionOn(planet, worldSeed)),
    frontierRate: rateToCoreOf(frontierSessionAfter(planet, worldSeed), planet + 1),
  }
}

/**
 * The bot on `planet` with its on-curve gear, played to the core the revisit comes back to, then
 * driven to the Sell bay from wherever its last dock left it, as `travelWhenReady` does.
 */
function completedCoreSessionOn(planet: number, worldSeed: number): BotSession {
  const session = arrivedPaceSessionOn(planet, worldSeed, [])
  const botPlanet = botPlanetOf(session, 'blast')
  const maxTicks = session.tick() + PLANET_BUDGET_TICKS
  playSliceFrom(session, botPlanet, { lastPlanet: planet, maxTicks })
  if (!session.state().core.isCompleted) {
    throw new Error(`seed ${worldSeed}: the bot never completed planet ${planet}'s core`)
  }
  if (!isDockedAtSell(session)) driveToSellBay(session, botPlanet)
  return session
}

/** The completed planet left for the next one, with the gear and money the core left it. */
function frontierSessionAfter(planet: number, worldSeed: number): BotSession {
  const session = completedCoreSessionOn(planet, worldSeed)
  jumpTo(session, planet + 1, nextHopShortfallOf(session.state(), PLAYER_ID))
  return session
}

/** The same frontier, then the hop back: the way a player returns to a cleared planet. */
function revisitedSessionOn(planet: number, worldSeed: number): BotSession {
  const session = frontierSessionAfter(planet, worldSeed)
  jumpTo(session, planet, toSafeInteger(jumpFuelUnitsOf(planet + 1, planet)))
  refuseUncompletedLanding(session, planet)
  return session
}

/** From the Sell bay: the hop's fuel, then the jump; a jump lands docked there again. */
function jumpTo(session: BotSession, planet: number, fuelUnits: number): void {
  if (!isDockedAtSell(session)) throw new Error('the revisit harness jumps only from the Sell bay')
  if (fuelUnits > 0) session.submit(buyFuelCommand(fuelUnits))
  session.submit(jumpToPlanetCommand(1n, BigInt(planet)))
  if (session.state().planet.index !== planet) {
    throw new Error(`the revisit harness never landed on planet ${planet}`)
  }
}

function isDockedAtSell(session: BotSession): boolean {
  return dockedBayOf(session.state(), PLAYER_ID) === 'sell'
}

/** The harness assert: the revisit lands on a completed core with its full bay (ticket 790). */
function refuseUncompletedLanding(session: BotSession, planet: number): void {
  const state = session.state()
  const isBayFull = state.platform.coreBay >= (coreNeededOf(state.planet) ?? 0)
  if (state.core.isCompleted && isBayFull) return
  throw new Error(`back on planet ${planet}, the core landed uncompleted or its bay short`)
}

/** Core trips until the shaft reaches the core, each sold at the Sell bay: sales a minute. */
function revisitRateOf(session: BotSession): Money | null {
  const planet = botPlanetOf(session, 'blast')
  const startTick = session.tick()
  const eventsBefore = session.events().length
  for (let trip = 0; trip < REVISIT_TRIPS_MAX && !hasShaftReachedCore(planet.layout); trip++) {
    serviceAtDock(session)
    runTrip(session, planet, { kind: 'core' })
  }
  serviceAtDock(session)
  return salesRateSince(session, startTick, eventsBefore)
}

function hasShaftReachedCore(layout: MineLayout): boolean {
  return layout.shaftBottomRow < layout.params.coreRadiusTiles
}

/** Sales a minute from the session's tick to `planet`'s core, or to the budget's end. */
function rateToCoreOf(session: BotSession, planet: number): Money | null {
  const startTick = session.tick()
  const eventsBefore = session.events().length
  playToCoreFrom(session, planet, startTick + PLANET_BUDGET_TICKS)
  return salesRateSince(session, startTick, eventsBefore)
}

function salesRateSince(
  session: BotSession,
  startTick: number,
  eventsBefore: number,
): Money | null {
  const ticks = session.tick() - startTick
  if (ticks === 0) return null
  const sales = salesOf(session.events().slice(eventsBefore))
  return div(sales, div(fromSafeInteger(ticks), fromSafeInteger(TICKS_PER_MINUTE)))
}

function salesOf(events: readonly DomainEvent[]): Money {
  return events.reduce(
    (total, event) =>
      event.type === 'ResourceSold' ? add(total, fromCanonical(event.value)) : total,
    ZERO_MONEY,
  )
}
