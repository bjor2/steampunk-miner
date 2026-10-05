/**
 * What the pacing bot does at the dock (#29 Systems & Economy note 3): sell, repair and recharge,
 * then buy, always keeping the next service paid for. `drill_tip` and `hull` go to their on-curve level for the planet first (#6 section 3);
 * a `drill_power` level is forced while the core is the goal and the drill digs it slower than 0.4
 * tiles a second (`FORCED_DRILL_TICKS_PER_TILE`); otherwise the bot buys the upgrade with the best gain in planned money per tick
 * per price, while one pays. The #6 simulator's deadlock (never buying the unblocking drill level)
 * cannot happen: the forced rule saves for that level instead of spending elsewhere.
 */
import { TICKS_PER_SECOND } from '../../constants/physics'
import type { CommandIntent } from '../authority/authorityCommand'
import { applyCommand } from '../authority/applyCommand'
import { nextUpgradePrice } from '../authority/workshopRules'
import type { UpgradeId } from '../economy/economyDefinition'
import { onCurveLevel, type UpgradeLevels } from '../economy/vehicleStats'
import { add, cmp, fromSafeInteger, type Money } from '../money'
import { rechargePrice, repairPrice, travelFee } from '../economy/planetCharges'
import { statsOfVehicle } from '../vehicle/vehicleState'
import type { BotSession } from './botSession'
import type { MineLayout } from './mineLayout'
import { approximately, bestOrePlan, fullTankMeans, isCoreDugWithin } from './tripEstimate'

/**
 * #29 Systems & Economy note 3: while the core is the goal and the drill digs it slower than 0.4
 * tiles a second (2.5 seconds a tile), a `drill_power` level comes before anything else.
 */
const FORCED_DRILL_TICKS_PER_TILE = (5 * TICKS_PER_SECOND) / 2

const ON_CURVE_FIRST: readonly UpgradeId[] = ['drill_tip', 'hull']
const MARGINAL_TRACKS: readonly UpgradeId[] = ['drill_power', 'engine', 'boiler', 'cargo_hold']

export interface ShoppingSituation {
  layout: MineLayout
  /** The core is what the bot is after: still short of fragments and the shaft is at band 5. */
  isCoreTheGoal: boolean
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
    { type: 'sellCargo', payload: { resourceTier: 'all' } },
    { type: 'rechargeEnergy', payload: {} },
    { type: 'repairHull', payload: {} },
  ]
}

export function buyUpgrades(session: BotSession, situation: ShoppingSituation): void {
  for (let pick = nextPurchase(session, situation); pick !== null;) {
    session.submit({ type: 'buyUpgrade', payload: { upgradeId: pick } })
    pick = nextPurchase(session, situation)
  }
}

function nextPurchase(session: BotSession, situation: ShoppingSituation): UpgradeId | null {
  const onCurve = belowCurveAffordable(session)
  if (onCurve !== null) return onCurve
  if (isDrillForced(session, situation)) {
    return canAfford(session, 'drill_power') ? 'drill_power' : null
  }
  return bestMarginalPurchase(session, situation.layout)
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

function isDrillForced(session: BotSession, situation: ShoppingSituation): boolean {
  if (!situation.isCoreTheGoal) return false
  const { levels } = session.vehicle()
  return !isCoreDugWithin(levels, session.state().planet.index, FORCED_DRILL_TICKS_PER_TILE)
}

function bestMarginalPurchase(session: BotSession, layout: MineLayout): UpgradeId | null {
  const { levels } = session.vehicle()
  const now = plannedMoneyPerTick(layout, levels)
  let best: { track: UpgradeId; gainPerPrice: number } | null = null
  for (const track of MARGINAL_TRACKS.filter((candidate) => canAfford(session, candidate))) {
    const gain = plannedMoneyPerTick(layout, { ...levels, [track]: levels[track] + 1 }) - now
    const gainPerPrice = gain / approximately(priceOf(session, track))
    if (gain > 0 && (best === null || gainPerPrice > best.gainPerPrice)) {
      best = { track, gainPerPrice }
    }
  }
  return best?.track ?? null
}

function plannedMoneyPerTick(layout: MineLayout, levels: UpgradeLevels): number {
  return bestOrePlan(layout, fullTankMeans(levels))?.moneyPerTick ?? 0
}

function priceOf(session: BotSession, track: UpgradeId) {
  return nextUpgradePrice(session.state(), session.playerId, track)
}

/** A purchase must leave the next service (and the travel fee, once the core is done) paid for. */
function canAfford(session: BotSession, track: UpgradeId): boolean {
  const wallet = session.state().players[session.playerId].wallet
  return cmp(wallet, add(priceOf(session, track), moneyKeptBack(session))) >= 0
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
