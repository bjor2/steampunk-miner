/**
 * What the pacing bot does at the dock (#29 Systems & Economy note 3): sell, repair and recharge
 * at the Sell bay, then buy at the Upgrade bay (#37), always keeping the next service paid for. A
 * casing grade the next trip needs comes first (`botCasing.ts`, S11); then a heat planet's lining
 * type, refractory, once it is offered (#113, `botHeat.ts`); then the guns' mount once they are
 * offered (#107, `botGuns.ts`); then a full charge rack once charges are and the bot has met a
 * tile it would blast (#109, #129, `botCharges.ts`); then `drill_tip` and `hull`
 * go to their on-curve level for the planet (#6 section 3);
 * a drill level is forced while the core is the goal and digs slow (`botCoreRule.ts`: `drill_power`,
 * then `drill_tip` at the drill cap, #86); otherwise the bot buys the upgrade with the best gain in
 * planned money per tick per price, while one pays, never `drill_power` past its lead cap. The #6
 * simulator's deadlock (never buying the unblocking drill level) cannot happen: the forced rule
 * saves for that level instead of spending elsewhere.
 */
import type { CommandIntent } from '../authority/authorityCommand'
import { applyCommand } from '../authority/applyCommand'
import { nextUpgradePrice } from '../authority/workshopRules'
import { nextCasingPrice } from '../authority/casingRules'
import type { UpgradeId } from '../economy/economyDefinition'
import { onCurveLevel, type UpgradeLevels } from '../economy/vehicleStats'
import { add, cmp, fromSafeInteger, type Money } from '../money'
import { rechargePrice, repairPrice, travelFee } from '../economy/planetCharges'
import { statsOfVehicle } from '../vehicle/vehicleState'
import { isCasingGradeShort } from './botCasing'
import { forcedCoreTrack, isUnderLeadCap } from './botCoreRule'
import { restockPriceFor } from './botCharges'
import { gunMountPriceFor, type GunPolicy } from './botGuns'
import { liningUnlockFor } from './botHeat'
import type { BotSession } from './botSession'
import type { MineLayout } from './mineLayout'
import { approximately, bestOrePlan, fullTankMeans } from './tripEstimate'

const ON_CURVE_FIRST: readonly UpgradeId[] = ['drill_tip', 'hull']
const MARGINAL_TRACKS: readonly UpgradeId[] = ['drill_power', 'engine', 'boiler', 'cargo_hold']

/** One buy at the Upgrade bay: a track level, the next casing grade, a lining type or the guns. */
type Purchase =
  | CommandIntent<'buyUpgrade'>
  | CommandIntent<'buyCasingGrade'>
  | CommandIntent<'buyLiningType'>
  | CommandIntent<'buyGun'>
  | CommandIntent<'restockCharges'>

const BUY_CASING_GRADE: Purchase = { type: 'buyCasingGrade', payload: {} }
const BUY_GUN: Purchase = { type: 'buyGun', payload: {} }
const RESTOCK_CHARGES: Purchase = { type: 'restockCharges', payload: {} }

export interface ShoppingSituation {
  layout: MineLayout
  /** The core is what the bot is after: still short of fragments and the shaft is at band 5. */
  isCoreTheGoal: boolean
  gunPolicy: GunPolicy
  /** The bot met a tile on this planet it would blast with no charge in stock (#129). */
  hasMetBlastTile: boolean
}

export function serviceAtDock(session: BotSession): void {
  for (const intent of serviceIntents(session)) {
    if (wouldAccept(session, intent)) session.submit(intent)
  }
}

/** One quick service when it is affordable, else each step on its own as money allows. */
function serviceIntents(session: BotSession): CommandIntent[] {
  const quick: CommandIntent = { type: 'quickService', payload: {} }
  if (wouldAccept(session, quick)) return [quick]
  return [
    { type: 'collectRefined', payload: {} },
    { type: 'sellCargo', payload: { resourceTier: 'all' } },
    { type: 'rechargeEnergy', payload: {} },
    { type: 'repairHull', payload: {} },
  ]
}

/** Whether the bot would buy anything now, wherever it is docked. */
export function hasPurchase(session: BotSession, situation: ShoppingSituation): boolean {
  return nextPurchase(session, situation) !== null
}

export function buyUpgrades(session: BotSession, situation: ShoppingSituation): void {
  for (let pick = nextPurchase(session, situation); pick !== null;) {
    session.submit(pick)
    pick = nextPurchase(session, situation)
  }
}

function nextPurchase(session: BotSession, situation: ShoppingSituation): Purchase | null {
  if (isCasingDue(session, situation)) return BUY_CASING_GRADE
  const lining = liningUnlockDue(session)
  if (lining !== null) return { type: 'buyLiningType', payload: { liningType: lining } }
  if (isGunMountDue(session, situation.gunPolicy)) return BUY_GUN
  if (isRestockDue(session, situation)) return RESTOCK_CHARGES
  const track = nextTrackPurchase(session, situation)
  return track === null ? null : { type: 'buyUpgrade', payload: { upgradeId: track } }
}

function nextTrackPurchase(session: BotSession, situation: ShoppingSituation): UpgradeId | null {
  const onCurve = belowCurveAffordable(session)
  if (onCurve !== null) return onCurve
  const forced = forcedTrack(session, situation)
  if (forced !== null) return canAfford(session, forced) ? forced : null
  return bestMarginalPurchase(session, situation.layout)
}

/**
 * The next trip wants a deeper band (or the core) than the casing grade holds, and the grade is
 * affordable; when it is not yet, the bot buys tracks and mines the bands it holds meanwhile.
 */
function isCasingDue(session: BotSession, situation: ShoppingSituation): boolean {
  const wantedBand = plannedBand(situation.layout, session.vehicle().levels)
  const wanted = { isCoreTheGoal: situation.isCoreTheGoal, wantedBand }
  return isCasingGradeShort(session, wanted) && canAffordCasing(session)
}

/** The band a full tank with these levels would mine best, whatever the casing grade holds. */
function plannedBand(layout: MineLayout, levels: UpgradeLevels): number {
  return bestOrePlan(layout, fullTankMeans(levels))?.band ?? 1
}

/** The act's lining type, when it is offered and paid for with the next service kept back. */
function liningUnlockDue(session: BotSession): string | null {
  const unlock = liningUnlockFor(session)
  return unlock !== null && canPay(session, unlock.price) ? unlock.liningType : null
}

function isGunMountDue(session: BotSession, policy: GunPolicy): boolean {
  const price = gunMountPriceFor(session, policy)
  return price !== null && canPay(session, price)
}

function isRestockDue(session: BotSession, situation: ShoppingSituation): boolean {
  if (!situation.hasMetBlastTile) return false
  const price = restockPriceFor(session)
  return price !== null && canPay(session, price)
}

function belowCurveAffordable(session: BotSession): UpgradeId | null {
  const { levels } = session.vehicle()
  const planetIndex = session.state().planet.index
  return (
    ON_CURVE_FIRST.find(
      (track) => levels[track] < onCurveLevel(track, planetIndex) && canAfford(session, track),
    ) ?? null
  )
}

function forcedTrack(session: BotSession, situation: ShoppingSituation): UpgradeId | null {
  if (!situation.isCoreTheGoal) return null
  return forcedCoreTrack(session.vehicle().levels, session.state().planet.index)
}

function bestMarginalPurchase(session: BotSession, layout: MineLayout): UpgradeId | null {
  const { levels } = session.vehicle()
  const now = plannedMoneyPerTick(layout, levels)
  let best: { track: UpgradeId; gainPerPrice: number } | null = null
  for (const track of openMarginalTracks(session)) {
    const gain = plannedMoneyPerTick(layout, { ...levels, [track]: levels[track] + 1 }) - now
    const gainPerPrice = gain / approximately(priceOf(session, track))
    if (gain > 0 && (best === null || gainPerPrice > best.gainPerPrice)) {
      best = { track, gainPerPrice }
    }
  }
  return best?.track ?? null
}

/** The marginal tracks the bot can pay for and has not capped on this planet. */
function openMarginalTracks(session: BotSession): UpgradeId[] {
  const { levels } = session.vehicle()
  const planetIndex = session.state().planet.index
  return MARGINAL_TRACKS.filter(
    (track) => isUnderLeadCap(levels, track, planetIndex) && canAfford(session, track),
  )
}

function plannedMoneyPerTick(layout: MineLayout, levels: UpgradeLevels): number {
  return bestOrePlan(layout, fullTankMeans(levels))?.moneyPerTick ?? 0
}

function priceOf(session: BotSession, track: UpgradeId) {
  return nextUpgradePrice(session.state(), session.playerId, track)
}

function canAfford(session: BotSession, track: UpgradeId): boolean {
  return canPay(session, priceOf(session, track))
}

function canAffordCasing(session: BotSession): boolean {
  return canPay(session, nextCasingPrice(session.state(), session.playerId))
}

/** A purchase must leave the next service (and the travel fee, once the core is done) paid for. */
function canPay(session: BotSession, price: Money): boolean {
  const wallet = session.state().players[session.playerId].wallet
  return cmp(wallet, add(price, moneyKeptBack(session))) >= 0
}

function moneyKeptBack(session: BotSession): Money {
  const state = session.state()
  const planetIndex = state.planet.index
  const stats = statsOfVehicle(session.vehicle())
  const service = add(
    repairPrice(planetIndex, stats.hullMax, stats.hullMax),
    rechargePrice(planetIndex, fromSafeInteger(stats.energyMax)),
  )
  return state.core.isCompleted ? add(service, travelFee(planetIndex)) : service
}

/** A dry run of the pure authority: the bot never sends a command it knows will be refused. */
export function wouldAccept(session: BotSession, intent: CommandIntent): boolean {
  const state = session.state()
  const seq = state.players[session.playerId].lastSeq + 1
  const command = { playerId: session.playerId, tick: state.tick, seq, ...intent }
  return applyCommand(state, command as never).events.every(
    (event) => event.type !== 'CommandRejected',
  )
}
