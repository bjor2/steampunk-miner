/**
 * The pacing bot and the Cache Crate (ticket 850; the TD's Q4 seam and the GD's final lock on
 * #850): by default it never carries one, and reads no crate state, so the bare bot plays
 * byte-identically. Under `kitPolicy.crates: 'drop_on_full'`, the crates-on half of the paired
 * replay (#823's VS row 1), it plays the crate as a player would:
 *
 * - **Restock.** Docked at the Sell bay after a trip, it buys crates while the authority would
 *   sell one (the merchant on its home planet, under the carry limit) and the wallet pays it with
 *   the next service and the brass reserve kept back, as a slice's optional buy is paid.
 * - **Drop on full.** When the hold fills on an ore trip it drops the hold as a crate where it
 *   stands and mines on, while it carries a crate and the planet's cap allows one. A core trip
 *   ends the planet, so a crate dropped there would be left behind: it turns home as it always did.
 * - **Collect.** At the start of each trip it drives to its crates on this planet, oldest first,
 *   down the shaft to the crate's row and along it, and picks each up while the hold has room and
 *   the tank holds the way there and home. A trip whose pickups fill the hold carries them home
 *   instead of mining, so it never drops what it just lifted.
 *
 * Every intent is dry-run first (`wouldAccept`); a refused one is not sent.
 */
import { botCrateProvider, type BotCrate, type BotCrateProvider } from '../registries/botCrates'
import type { FlaskPolicy } from './botFlask'
import { cargoUnitsOf, statsOfVehicle } from '../vehicle/vehicleState'
import { wouldAccept } from './botDryRun'
import { canAffordMoveTo } from './botEnergy'
import { moveStraight, type BotPlanet } from './botPilot'
import type { BotSession } from './botSession'
import { moveAlongShaft } from './botShaft'
import { canPayForBrass } from './botWallet'
import { shaftTileAt } from './mineLayout'
import type { TripGoal } from './tripGoal'

/** Whether the bot carries crates: never (the default), or dropping its hold whenever it fills. */
export type CratePolicy = 'never' | 'drop_on_full'

/**
 * What the bot does with the planet kits (the TD's Q4 seam on #850): off by default, mirroring
 * `BorePolicy`. T1 (ticket 881) adds `flask` (`botFlask.ts`), absent as `never`; the hazard tools
 * act by context, so a tools-on run only grants them at its start.
 */
export interface KitPolicy {
  crates: CratePolicy
  flask?: FlaskPolicy
}

export const DEFAULT_KIT_POLICY: KitPolicy = { crates: 'never', flask: 'never' }

/** Buys crates at the Sell bay while one is sold here and the wallet pays it. */
export function restockCrates(session: BotSession, planet: BotPlanet): void {
  const provider = crateProviderUnder(planet)
  if (provider === null) return
  let intent = restockOf(session, provider)
  while (intent !== null) {
    session.submit(intent)
    intent = restockOf(session, provider)
  }
}

/** On an ore trip with a full hold, drops the hold as a crate where the vehicle stands. */
export function dropFullHold(session: BotSession, planet: BotPlanet, goal: TripGoal): void {
  const provider = crateProviderUnder(planet)
  if (provider === null || goal.kind !== 'ore' || !isHoldFull(session)) return
  const intent = provider.dropIntentOf(session.state(), session.playerId)
  if (wouldAccept(session, intent)) session.submit(intent)
}

/**
 * Picks up the bot's crates on this planet, oldest first, while the hold has room and the tank
 * reaches each; true when the hold is then full, so the trip goes home with it.
 */
export function collectCrates(session: BotSession, planet: BotPlanet): boolean {
  const provider = crateProviderUnder(planet)
  if (provider === null) return false
  for (const crate of provider.cratesOf(session.state(), session.playerId)) {
    if (isHoldFull(session) || !canAffordMoveTo(session, planet, crate.cell)) break
    driveToCrate(session, planet, crate)
    if (wouldAccept(session, crate.pickupIntent)) session.submit(crate.pickupIntent)
  }
  return isHoldFull(session)
}

/** The provider when the pilot's policy carries crates; null with the policy off or none. */
function crateProviderUnder(planet: BotPlanet): BotCrateProvider | null {
  const policy = planet.pilot.kitPolicy ?? DEFAULT_KIT_POLICY
  return policy.crates === 'never' ? null : botCrateProvider()
}

function restockOf(session: BotSession, provider: BotCrateProvider) {
  const state = session.state()
  const intent = provider.restockIntentOf(state, session.playerId)
  if (intent === null) return null
  const isPaid = canPayForBrass(session, provider.restockCostOf(state, session.playerId))
  return isPaid && wouldAccept(session, intent) ? intent : null
}

/** Down the shaft to the crate's row and along it: the way the bot opened when it dropped it. */
function driveToCrate(session: BotSession, planet: BotPlanet, crate: BotCrate): void {
  const { layout, pilot } = planet
  moveStraight(session, planet, shaftTileAt(layout, pilot.position.ty))
  moveAlongShaft(session, planet, crate.cell.ty)
  moveStraight(session, planet, crate.cell)
}

function isHoldFull(session: BotSession): boolean {
  const vehicle = session.vehicle()
  return cargoUnitsOf(vehicle.cargo) >= statsOfVehicle(vehicle).cargoCapacity
}
