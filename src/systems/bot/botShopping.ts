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
 * saves for that level instead of spending elsewhere. Once nothing of the kernel's pays, the bot
 * tries the slices' registered purchases (`botSlicePurchases.ts`, ticket 211).
 *
 * Every track buy is one step (#180): the on-curve rule buys toward its major once the steps left
 * to it are paid for whole, the forced rule a step at a time. A pip of cargo or boiler may leave
 * its whole-number stat where it is, and a drill pip may not win a whole tick, so a marginal track
 * is offered for the fewest next steps, up to its next major, that raise the planned money, priced
 * together and paid for whole; the bot buys their first step and weighs the offers again.
 *
 * From planet 8 on, every track buy also leaves #180's service reserve and one rescue fee (#198,
 * `botWallet.ts`); the casing, lining, guns and charges keep only the next service, as before.
 *
 * Every buy is a click unless the run's chain policy holds (`botChains.ts`, ticket 226): then the
 * steps bought in a row on one track are one held chain, and a refused held step ends the buying.
 */
import type { CommandIntent } from '../authority/authorityCommand'
import { CLICK_CHAIN } from '../authority/purchaseChain'
import { nextUpgradePrice } from '../authority/workshopRules'
import { nextCasingPrice } from '../authority/casingRules'
import type { UpgradeId } from '../economy/economyDefinition'
import { stepPrice } from '../economy/upgradePrices'
import { minorsPerMajor, pipOf, stepOfMajor } from '../economy/upgradeSteps'
import { onCurveLevel, type UpgradeLevels } from '../economy/vehicleStats'
import { add, cmp, div, sub, ZERO_MONEY, type Money } from '../money'
import { isCasingGradeShort } from './botCasing'
import { startBotHold, stepOfHold, type ChainPolicy } from './botChains'
import { forcedCoreTrack, isUnderLeadCap } from './botCoreRule'
import { chargeRestockOf } from './botCharges'
import { gunMountPriceFor, type GunPolicy } from './botGuns'
import { liningUnlockFor } from './botHeat'
import type { BotSession } from './botSession'
import { wouldAccept } from './botDryRun'
import { buySlicePurchases, nextSlicePurchase } from './botSlicePurchases'
import { canPay, canPayForBrass, walletOf } from './botWallet'
import type { ShopSpend } from './shopSpend'
import type { MineLayout } from './mineLayout'
import { bestOrePlan, fullTankMeans } from './tripEstimate'

const ON_CURVE_FIRST: readonly UpgradeId[] = ['drill_tip', 'hull']
const MARGINAL_TRACKS: readonly UpgradeId[] = ['drill_power', 'engine', 'boiler', 'cargo_hold']

/** One buy at the Upgrade bay: a track level, the next casing grade, a lining type or the guns. */
type Purchase =
  | CommandIntent<'buyUpgrade'>
  | CommandIntent<'buyCasingGrade'>
  | CommandIntent<'buyLiningType'>
  | CommandIntent<'buyGun'>
  | CommandIntent<'restockCharges'>

const BUY_CASING_GRADE: Purchase = { type: 'buyCasingGrade', payload: { chain: CLICK_CHAIN } }
const BUY_GUN: Purchase = { type: 'buyGun', payload: { chain: CLICK_CHAIN } }

export interface ShoppingSituation {
  layout: MineLayout
  /** The core is what the bot is after: still short of fragments and the shaft is at band 5. */
  isCoreTheGoal: boolean
  gunPolicy: GunPolicy
  /** The bot met a tile on this planet it would blast with no charge in stock (#129). */
  hasMetBlastTile: boolean
  chainPolicy: ChainPolicy
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
  return nextPurchase(session, situation) !== null || nextSlicePurchase(session) !== null
}

/** The kernel's purchases while one pays, then the slices' (ticket 211); answers what each cost. */
export function buyUpgrades(session: BotSession, situation: ShoppingSituation): ShopSpend[] {
  return [...buyKernelPurchases(session, situation), ...buySlicePurchases(session)]
}

function buyKernelPurchases(session: BotSession, situation: ShoppingSituation): ShopSpend[] {
  const spends: ShopSpend[] = []
  const hold = startBotHold(situation.chainPolicy)
  for (let pick = nextPurchase(session, situation); pick !== null;) {
    const step = stepOfHold(session, hold, pick)
    if (step === null) break
    spends.push(submitKernelPurchase(session, step))
    pick = nextPurchase(session, situation)
  }
  return spends
}

/** What the wallet paid is the spend: the purchase events carry their prices in five shapes. */
function submitKernelPurchase(session: BotSession, pick: CommandIntent): ShopSpend {
  const planetIndex = session.state().planet.index
  const before = walletOf(session)
  session.submit(pick)
  const cost = sub(before, walletOf(session))
  return { planetIndex, source: 'kernel', purchaseId: pick.type, cost }
}

function nextPurchase(session: BotSession, situation: ShoppingSituation): Purchase | null {
  if (isCasingDue(session, situation)) return BUY_CASING_GRADE
  const lining = liningUnlockDue(session)
  if (lining !== null) return { type: 'buyLiningType', payload: { liningType: lining } }
  if (isGunMountDue(session, situation.gunPolicy)) return BUY_GUN
  const restock = chargeRestockDue(session, situation)
  if (restock !== null) return restock
  const track = nextTrackPurchase(session, situation)
  if (track === null) return null
  return { type: 'buyUpgrade', payload: { upgradeId: track, chain: CLICK_CHAIN } }
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

function chargeRestockDue(session: BotSession, situation: ShoppingSituation): Purchase | null {
  if (!situation.hasMetBlastTile) return null
  const restock = chargeRestockOf(session)
  return restock !== null && canPay(session, restock.price) ? restock.intent : null
}

/**
 * A tip or hull pip alone opens no gate, so the rule buys toward the on-curve major only when the
 * steps left to the next major are paid for whole, as it bought a whole level before #180.
 */
function belowCurveAffordable(session: BotSession): UpgradeId | null {
  return (
    ON_CURVE_FIRST.find(
      (track) => isBelowCurve(session, track) && canAffordToNextMajor(session, track),
    ) ?? null
  )
}

/** Short of the planet's on-curve major on this track. */
function isBelowCurve(session: BotSession, track: UpgradeId): boolean {
  const onCurveStep = stepOfMajor(onCurveLevel(track, session.state().planet.index))
  return session.vehicle().levels[track] < onCurveStep
}

function forcedTrack(session: BotSession, situation: ShoppingSituation): UpgradeId | null {
  if (!situation.isCoreTheGoal) return null
  return forcedCoreTrack(session.vehicle().levels, session.state().planet.index)
}

/** An open track whose next steps raise the planned money per tick, and that gain per price. */
interface MarginalOffer {
  track: UpgradeId
  gainPerPrice: Money
}

function bestMarginalPurchase(session: BotSession, layout: MineLayout): UpgradeId | null {
  return (
    marginalOffers(session, layout).reduce<MarginalOffer | null>(betterOffer, null)?.track ?? null
  )
}

/** Gain and price stay Money: past planet 582 either one is Infinity as a double (#196). */
function marginalOffers(session: BotSession, layout: MineLayout): MarginalOffer[] {
  const now = plannedMoneyPerTick(layout, session.vehicle().levels)
  return openMarginalTracks(session).flatMap((track) => {
    const offer = marginalOfferOf(session, layout, now, track)
    return offer === null ? [] : [offer]
  })
}

/** The fewest next steps, up to the next major, that raise the planned money; null if none pays. */
function marginalOfferOf(
  session: BotSession,
  layout: MineLayout,
  now: Money,
  track: UpgradeId,
): MarginalOffer | null {
  const { levels } = session.vehicle()
  const planetIndex = session.state().planet.index
  let price = ZERO_MONEY
  for (let steps = 1; steps <= stepsToNextMajor(levels[track]); steps++) {
    price = add(price, stepPrice(track, levels[track] + steps - 1, planetIndex))
    const after = { ...levels, [track]: levels[track] + steps }
    const gain = sub(plannedMoneyPerTick(layout, after), now)
    if (cmp(gain, ZERO_MONEY) > 0) {
      return canPayForBrass(session, price) ? { track, gainPerPrice: div(gain, price) } : null
    }
  }
  return null
}

function stepsToNextMajor(step: number): number {
  return minorsPerMajor() - pipOf(step)
}

function canAffordToNextMajor(session: BotSession, track: UpgradeId): boolean {
  const step = session.vehicle().levels[track]
  const planetIndex = session.state().planet.index
  let price = ZERO_MONEY
  for (let at = step; at < step + stepsToNextMajor(step); at++) {
    price = add(price, stepPrice(track, at, planetIndex))
  }
  return canPayForBrass(session, price)
}

/** On a tie the earlier track keeps it, in `MARGINAL_TRACKS` order. */
function betterOffer(best: MarginalOffer | null, offer: MarginalOffer): MarginalOffer {
  return best === null || cmp(offer.gainPerPrice, best.gainPerPrice) > 0 ? offer : best
}

/** The marginal tracks the bot has not capped on this planet. */
function openMarginalTracks(session: BotSession): UpgradeId[] {
  const { levels } = session.vehicle()
  const planetIndex = session.state().planet.index
  return MARGINAL_TRACKS.filter((track) => isUnderLeadCap(levels, track, planetIndex))
}

function plannedMoneyPerTick(layout: MineLayout, levels: UpgradeLevels): Money {
  return bestOrePlan(layout, fullTankMeans(levels))?.moneyPerTick ?? ZERO_MONEY
}

function priceOf(session: BotSession, track: UpgradeId) {
  return nextUpgradePrice(session.state(), session.playerId, track)
}

function canAfford(session: BotSession, track: UpgradeId): boolean {
  return canPayForBrass(session, priceOf(session, track))
}

function canAffordCasing(session: BotSession): boolean {
  return canPay(session, nextCasingPrice(session.state(), session.playerId))
}
