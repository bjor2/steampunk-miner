/**
 * The pacing bot and `blasting_charges` (#109 "Bot policy"): it blasts a tile whose drill time
 * would be over `botBlastThresholdTicks` (96, 4x `minTicksPerTile`) when a charge is in the rack,
 * as a player would: plant facing the tile, back off along the open way it came until it is out of
 * the blast, wait out the fuse, and drive back. With no open way back, or a tile the blast cannot
 * break (core), it bores as before. It buys the rack or restocks it only once it has met, on this
 * planet, a tile it would blast with no charge in stock (#129); then it fills the rack at the
 * Upgrade bay whenever charges are offered and it has room, while the next service stays paid. It
 * buys no rack slots, the policy names none. A run that never meets such a tile plays exactly like
 * the comparison run (`never`), which plays without charges.
 */
import { areChargesOffered, chargesOf, restockPriceOf } from '../authority/charges/chargeRules'
import { blastReachTiles, botBlastThresholdTicks } from '../economy/blastingCharges'
import type { Money } from '../money'
import { plantChargeCommand } from '../vehicle/vehicleCommands'
import { emptyRackSlotsOf, hasChargeToPlant } from '../vehicle/vehicleCharges'
import { isVehicleActive } from '../vehicle/vehicleState'
import type { TilePoint } from '../world/tileGrid'
import { moveStraight, type BotPlanet } from './botPilot'
import { facingTowards, NO_TICKS, reportPoseIntent } from './botPose'
import type { BotSession } from './botSession'
import { tileKindAt } from './botWorld'

/** Whether the bot uses charges at all; a comparison run plays without them (#109 acceptance 4). */
export type ChargePolicy = 'blast' | 'never'

/** Filling the rack, while charges are offered here and it has room; null otherwise. */
export function restockPriceFor(session: BotSession): Money | null {
  const state = session.state()
  const hasRoom = emptyRackSlotsOf(chargesOf(state, session.playerId)) > 0
  if (!hasRoom || !areChargesOffered(state, session.playerId)) return null
  return restockPriceOf(state, session.playerId)
}

/**
 * Raises the planet's flag (#129) when the bot meets a tile it would blast with no charge in
 * stock, so its next Upgrade bay visit buys the rack or restocks; travel brings a fresh planet.
 */
export function noteTileWorthACharge(
  session: BotSession,
  planet: BotPlanet,
  tile: TilePoint,
  boreTicks: number,
): void {
  const isRackEmpty = session.vehicle().charges.carried === 0
  if (isRackEmpty && wouldBlast(session, planet, tile, boreTicks)) planet.hasMetBlastTile = true
}

/** A tile this slow to bore, a charge to plant and an open way back out of the blast. */
export function isBlastWorthIt(
  session: BotSession,
  planet: BotPlanet,
  tile: TilePoint,
  boreTicks: number,
): boolean {
  return hasChargeToPlant(session.vehicle().charges) && wouldBlast(session, planet, tile, boreTicks)
}

/** Everything `isBlastWorthIt` asks but the charge: the policy, the tile and the way back. */
function wouldBlast(
  session: BotSession,
  planet: BotPlanet,
  tile: TilePoint,
  boreTicks: number,
): boolean {
  return (
    planet.chargePolicy === 'blast' &&
    boreTicks > botBlastThresholdTicks() &&
    tileKindAt(session.state(), tile) !== 'core' &&
    backOffTileOf(session, planet, tile) !== null
  )
}

/**
 * Plants on `tile`, backs off out of the blast, waits for it and comes back to where it planted.
 * Answers whether the tile is open now; when it is not (the blast was refused or left it), the
 * caller bores it.
 */
export function blastOpen(session: BotSession, planet: BotPlanet, tile: TilePoint): boolean {
  const from = planet.pilot.position
  const refuge = backOffTileOf(session, planet, tile) as TilePoint
  if (!plantFacing(session, from, tile)) return false
  moveStraight(session, planet.pilot, refuge)
  waitForBlast(session)
  if (isVehicleActive(session.vehicle())) moveStraight(session, planet.pilot, from)
  return tileKindAt(session.state(), tile) === 'open'
}

function plantFacing(session: BotSession, from: TilePoint, tile: TilePoint): boolean {
  session.submit(reportPoseIntent(from, facingTowards(from, tile), NO_TICKS))
  session.submit(plantChargeCommand())
  return session.vehicle().charges.planted !== null
}

function waitForBlast(session: BotSession): void {
  const planted = session.vehicle().charges.planted
  if (planted !== null) session.wait(planted.detonateTick - session.tick())
}

/**
 * The tile `blastReachTiles()` (2) straight back from `tile` past the vehicle, so the vehicle's
 * centre ends 3 tiles from the charge, outside its 2.5; null unless every tile on the way is open.
 */
function backOffTileOf(session: BotSession, planet: BotPlanet, tile: TilePoint): TilePoint | null {
  const { position } = planet.pilot
  const dx = position.tx - tile.tx
  const dy = position.ty - tile.ty
  const way = Array.from({ length: blastReachTiles() }, (_, step) => ({
    tx: position.tx + dx * (step + 1),
    ty: position.ty + dy * (step + 1),
  }))
  const isOpen = way.every((step) => tileKindAt(session.state(), step) === 'open')
  return isOpen ? way[way.length - 1] : null
}
