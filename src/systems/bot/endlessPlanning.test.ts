import { describe, expect, it } from 'vitest'
import { blastTilesAround } from '../authority/charges/blastOre'
import { createAuthorityState } from '../authority/authorityState'
import { dockSiteOfPlanet } from '../authority/planetOfState'
import { chargePrice, chargeReachTiles, fuseTicksOf, keptFractionOf } from '../economy/chargeSizes'
import type { UpgradeId } from '../economy/economyDefinition'
import { blockHardness, oreSalePrice, oreTier } from '../economy/oreEconomy'
import { stepPrice, upgradePrice } from '../economy/upgradePrices'
import {
  isPerPurchaseTrack,
  levelOfStep,
  stepOfMajor,
  stepsToNextLevel,
} from '../economy/upgradeSteps'
import {
  drillPowerAtStep,
  onCurveStep,
  onCurveSteps,
  vehicleStatsAt,
  type UpgradeLevels,
  type VehicleStats,
} from '../economy/vehicleStats'
import {
  add,
  cmp,
  div,
  fromSafeInteger,
  isMoney,
  mul,
  toCanonical,
  ZERO_MONEY,
  type Money,
} from '../money'
import { quantaOfUnits } from '../vehicle/energyQuanta'
import type { PlanetParams } from '../world/planetParams'
import { blastTradeOf, type BlastTrade } from './blastTrade'
import { isBoilerStepDue } from './botBoiler'
import { isUnderLeadCap } from './botCoreRule'
import { buyUpgrades } from './botShopping'
import { createBotSession, type BotSession } from './botSession'
import { moveTicks, paramsOfSession } from './botWorld'
import { newMineLayout, type MineLayout } from './mineLayout'
import { bestOrePlan, fullTankMeans, orePlansOf } from './tripEstimate'

// #196 acceptance 1: past planet 582 a price as a double is Infinity. The bot's choices at planets
// 600 and 1000 are checked against a reference that ranks the same quantities in log space.
const WORLD_SEED = 83921
const PLANETS = [600, 1000]
/** The tracks the marginal rule weighs; the boiler has its own rule since ticket 553. */
const MARGINAL_TRACKS: readonly UpgradeId[] = ['drill_power', 'engine', 'cargo_hold']
/** Every track the wallet must afford a pick of, the boiler's rule included. */
const PICKED_TRACKS: readonly UpgradeId[] = [...MARGINAL_TRACKS, 'boiler']
/** Systems' marginal rule on #553: hold and engine bundles of at most 10, raising 0.2% or more. */
const BUNDLE_TRACKS: readonly UpgradeId[] = ['engine', 'cargo_hold']
const BUNDLE_MAX_PURCHASES = 10
const BUNDLE_GAIN_BP = 20
const PICKS_COMPARED = 8
/** Enough money for every compared pick of any track, with the service kept back. */
const WALLET_PRICES = 1000
const TOP_CASING_GRADE = 5
const BANDS = [1, 2, 3, 4, 5]
const TANK_SHARES = [1, 0.6, 0.3]
/** Tip majors behind, and the drill power purchases about as far behind (a purchase ~1.92 majors). */
const DRILL_LEVELS_BEHIND = [
  { tipMajors: 0, drillPurchases: 0 },
  { tipMajors: 6, drillPurchases: 3 },
  { tipMajors: 9, drillPurchases: 5 },
  { tipMajors: 12, drillPurchases: 6 },
]
/**
 * Purchases a marginal track is set behind so it can lead: 3 of drill power, 10 of the hold or the
 * engine (per purchase since ticket 553); 4 majors of a track still split into majors. Drill power
 * was 2 behind until ticket 559: with a tile priced at its real drill time, planet 600's rig 2
 * behind is tank-bound, so the hold plans no gain, yet its tank cuts the load by under the boiler
 * rule's 20%, and the visit buys nothing to compare; 3 behind the boiler's rule is due.
 */
const MAJORS_BEHIND_TO_LEAD = 4
const DRILL_PURCHASES_BEHIND_TO_LEAD = 3
const PURCHASES_BEHIND_TO_LEAD = 10
/**
 * Drill power's purchase 8 is the first at or past the old on-curve major 13 of planet 1 (stored
 * 130), whose band-1 pace the rig here keeps (`paceKeepingSteps`).
 */
const OLD_PLANET_1_PACE_PURCHASE = 8
const BASIS_POINTS = 10000
const TANK_AHEAD_MULTIPLE = 2
const PICKS_DONE = new Error('the compared picks are bought')

/** log10 of a positive amount from its canonical text: no double ever holds the amount. */
function log10Of(amount: Money): number {
  const [mantissa, exponent] = toCanonical(amount).split('e')
  return Math.log10(Number.parseFloat(mantissa)) + Number.parseInt(exponent, 10)
}

/** log10(10^a - 10^b) for a > b. */
function log10Difference(a: number, b: number): number {
  return b === Number.NEGATIVE_INFINITY ? a : a + Math.log10(1 - 10 ** (b - a))
}

/**
 * The on-curve steps with the drill that keeps the old on-curve band-1 pace. Since #552 the
 * on-curve drill grows 1.920 a planet (3 purchases of 1.243) against band-1 hardness's 1.974, so
 * on planet 600 it takes 48,428,225 ticks a band-1 tile (4 on planet 1) and no ore trip pays; the
 * old on-curve drill (6 majors of 1.12 a planet) kept band 1's pace on every planet. This rig
 * holds the first purchase whose power over band-1 hardness is at least purchase 8's on planet 1
 * (9 ticks a tile): 1881 on planet 600 against the on-curve 1809, 3131 on planet 1000 against
 * 3009. That is past the bot's one-purchase lead cap, so the bot and the reference both leave
 * drill power out of the marginal picks here.
 */
function paceKeepingSteps(planetIndex: number): UpgradeLevels {
  return { ...onCurveSteps(planetIndex), drill_power: paceKeepingDrill(planetIndex) }
}

function paceKeepingDrill(planetIndex: number): number {
  const hardnessGrowth = div(blockHardness(planetIndex, 1), blockHardness(1, 1))
  const wanted = mul(drillPowerAtStep(OLD_PLANET_1_PACE_PURCHASE), hardnessGrowth)
  let purchase = onCurveStep('drill_power', planetIndex)
  while (cmp(drillPowerAtStep(purchase), wanted) < 0) purchase += 1
  return purchase
}

/** How far behind a marginal track is set so it can lead, in its stored steps. */
function stepsBehindToLead(track: UpgradeId): number {
  if (track === 'drill_power') return DRILL_PURCHASES_BEHIND_TO_LEAD
  return isPerPurchaseTrack(track) ? PURCHASES_BEHIND_TO_LEAD : stepOfMajor(MAJORS_BEHIND_TO_LEAD)
}

/**
 * The pace-keeping steps with each marginal track in turn behind so each can lead (3 drill
 * purchases, 10 hold or engine purchases), and a tank twice the curve's, where the boiler's rule
 * rests and the hold limits instead.
 */
function levelVariants(planetIndex: number): UpgradeLevels[] {
  const onCurve = paceKeepingSteps(planetIndex)
  const behind = (track: UpgradeId) => ({
    ...onCurve,
    [track]: onCurve[track] - stepsBehindToLead(track),
  })
  const tankAhead = { ...onCurve, boiler: onCurve.boiler * TANK_AHEAD_MULTIPLE }
  return [onCurve, ...MARGINAL_TRACKS.map(behind), tankAhead]
}

function layoutOn(session: BotSession): MineLayout {
  return newMineLayout(paramsOfSession(session.state()), dockSiteOfPlanet(session.state().planet)!)
}

/** Docked at the Upgrade bay of the planet with these levels, the top casing grade and a wallet. */
function botShoppingOn(planetIndex: number, levels: UpgradeLevels): BotSession {
  const start = createAuthorityState({ planetIndex: 1, planetSeed: WORLD_SEED, playerIds: ['p1'] })
  const session = createBotSession(start, 'p1')
  session.submit({ type: 'debug.setPlanet', payload: { planetIndex } })
  for (const [upgradeId, level] of Object.entries(levels)) {
    session.submit({ type: 'debug.setUpgrade', payload: { upgradeId, level } })
  }
  session.submit({ type: 'debug.setCasingGrade', payload: { grade: TOP_CASING_GRADE } })
  session.submit({ type: 'debug.setMoney', payload: { amount: walletFor(planetIndex, levels) } })
  session.submit({ type: 'debug.teleportToDock', payload: { bay: 'upgrade' } })
  return session
}

function walletFor(planetIndex: number, levels: UpgradeLevels): string {
  const prices = PICKED_TRACKS.map((track) =>
    upgradePrice(track, levelOfStep(track, levels[track]), planetIndex),
  )
  const dearest = prices.reduce((most, price) => (cmp(price, most) > 0 ? price : most))
  return toCanonical(mul(dearest, fromSafeInteger(WALLET_PRICES)))
}

/** The first `PICKS_COMPARED` track buys of one visit; the visit ends there. */
function upgradesBought(session: BotSession, layout: MineLayout): string[] {
  const before = session.commands().length
  try {
    buyUpgrades(sessionEndingAfterPicks(session), {
      layout,
      isCoreTheGoal: false,
      gunPolicy: 'never',
      hasMetBlastTile: false,
      restockSize: 1,
      chainPolicy: 'click',
    })
  } catch (error) {
    if (error !== PICKS_DONE) throw error
  }
  return session
    .commands()
    .slice(before)
    .flatMap((command) => (command.type === 'buyUpgrade' ? [command.payload.upgradeId] : []))
}

/**
 * The session, ending the visit once the compared picks are bought: the wallet affords the
 * dearest track's picks, and since ticket 396's 4-tick floor every pip of a track ~10^300 cheaper
 * still raises the planned money, so the visit would buy on for tens of thousands of steps.
 */
function sessionEndingAfterPicks(session: BotSession): BotSession {
  let picks = 0
  return {
    ...session,
    submit(intent) {
      const events = session.submit(intent)
      if (intent.type === 'buyUpgrade') picks += 1
      if (picks === PICKS_COMPARED) throw PICKS_DONE
      return events
    },
  }
}

function plannedLog(layout: MineLayout, levels: UpgradeLevels): number {
  const plan = bestOrePlan(layout, fullTankMeans(levels))
  return plan === null ? Number.NEGATIVE_INFINITY : log10Of(plan.moneyPerTick)
}

/**
 * The reference: the best gain in planned money per tick per price, ranked by its log10, over the
 * fewest next steps that raise the planned money: one drill power purchase since #552, and a hold
 * or engine bundle of at most 10 that raises it 0.2% or more since ticket 553.
 */
function referencePick(
  layout: MineLayout,
  levels: UpgradeLevels,
  planetIndex: number,
  tracks: readonly UpgradeId[],
): UpgradeId | null {
  const now = plannedLog(layout, levels)
  let best: { track: UpgradeId; logGainPerPrice: number } | null = null
  for (const track of tracks) {
    const logGainPerPrice = referenceLogGainPerPrice(layout, levels, planetIndex, track, now)
    if (logGainPerPrice === null) continue
    if (best === null || logGainPerPrice > best.logGainPerPrice) best = { track, logGainPerPrice }
  }
  return best?.track ?? null
}

function referenceLogGainPerPrice(
  layout: MineLayout,
  levels: UpgradeLevels,
  planetIndex: number,
  track: UpgradeId,
  now: number,
): number | null {
  const isBundle = BUNDLE_TRACKS.includes(track)
  const most = isBundle ? BUNDLE_MAX_PURCHASES : stepsToNextLevel(track, levels[track])
  const enough = isBundle ? now + Math.log10(1 + BUNDLE_GAIN_BP / BASIS_POINTS) : now
  let price = ZERO_MONEY
  for (let steps = 1; steps <= most; steps++) {
    price = add(price, stepPrice(track, levels[track] + steps - 1, planetIndex))
    const next = plannedLog(layout, { ...levels, [track]: levels[track] + steps })
    if (next > now && next >= enough) return log10Difference(next, now) - log10Of(price)
  }
  return null
}

/** The tracks under their lead cap: the bay sells every one, the engine too (ticket 553). */
function referenceTracks(session: BotSession, levels: UpgradeLevels): UpgradeId[] {
  const planetIndex = session.state().planet.index
  return MARGINAL_TRACKS.filter((track) => isUnderLeadCap(levels, track, planetIndex))
}

function referencePicks(session: BotSession, layout: MineLayout, start: UpgradeLevels) {
  const planetIndex = session.state().planet.index
  const picks: UpgradeId[] = []
  let levels = start
  for (let pick = 0; pick < PICKS_COMPARED; pick += 1) {
    const track = isBoilerStepDue(layout, levels)
      ? 'boiler'
      : referencePick(layout, levels, planetIndex, referenceTracks(session, levels))
    if (track === null) break
    picks.push(track)
    levels = { ...levels, [track]: levels[track] + 1 }
  }
  return picks
}

/** The blast-or-drill calls: whether a blast pays for its charge and earns more a tick. */
interface BlastCalls {
  paysCharge: boolean
  earnsMore: boolean
}

function blastCallsOf(trade: BlastTrade): BlastCalls {
  return {
    paysCharge: cmp(trade.blastMoneyPerTick, ZERO_MONEY) > 0,
    earnsMore: cmp(trade.blastMoneyPerTick, trade.drillMoneyPerTick) > 0,
  }
}

/** The reference: the same two calls from the economy's prices, in log space. */
function referenceBlastCalls(params: PlanetParams, stats: VehicleStats, trade: BlastTrade) {
  const density = params.oreDensityBp[trade.band - 1] / BASIS_POINTS
  const price = oreSalePrice(oreTier(params.planetIndex, trade.band))
  const tileLog = Math.log10(density) + log10Of(price)
  const keptLog =
    Math.log10(blastTilesAround({ tx: 0, ty: 0 }, 1).length) + log10Of(keptFractionOf(1)) + tileLog
  const chargeLog = log10Of(chargePrice(1, 1, params.planetIndex))
  if (keptLog <= chargeLog) return { paysCharge: false, earnsMore: false }
  const cycleTicks =
    (fuseTicksOf(1) as number) + 2 * moveTicks(chargeReachTiles(1), stats.engine.speedMax)
  const blastLog = log10Difference(keptLog, chargeLog) - Math.log10(cycleTicks)
  return { paysCharge: true, earnsMore: blastLog > tileLog - Math.log10(trade.drillTicksPerTile) }
}

/** The planet as generated, and a synthetic one with ore in every tile, where blasts can pay. */
function paramsVariants(params: PlanetParams): PlanetParams[] {
  return [params, { ...params, oreDensityBp: BANDS.map(() => BASIS_POINTS) }]
}

/** The pace-keeping drill and drills further behind it, down to where band 3 is out of reach. */
function drillVariants(planetIndex: number): UpgradeLevels[] {
  const onCurve = paceKeepingSteps(planetIndex)
  return DRILL_LEVELS_BEHIND.map(({ tipMajors, drillPurchases }) => ({
    ...onCurve,
    drill_power: onCurve.drill_power - drillPurchases,
    drill_tip: onCurve.drill_tip - stepOfMajor(tipMajors),
  }))
}

describe('bot: planning past planet 582 (#196)', () => {
  it.each(PLANETS)('picks the ore band log space picks on planet %i', (planetIndex) => {
    const session = botShoppingOn(planetIndex, paceKeepingSteps(planetIndex))
    const layout = layoutOn(session)
    for (const levels of levelVariants(planetIndex)) {
      const stats = vehicleStatsAt(levels)
      for (const share of TANK_SHARES) {
        const means = { stats, tankQuanta: Math.floor(quantaOfUnits(stats.energyMax) * share) }
        const plans = orePlansOf(layout, means)
        expect(plans.length).toBeGreaterThan(0)
        for (const plan of plans) expect(isMoney(plan.moneyPerTick)).toBe(true)
        const logBest = plans.reduce((best, plan) =>
          log10Of(plan.moneyPerTick) > log10Of(best.moneyPerTick) ? plan : best,
        )
        expect(bestOrePlan(layout, means)?.band).toBe(logBest.band)
      }
    }
  })

  it.each(PLANETS)(
    'buys upgrades on planet %i in the order log space ranks them',
    (planetIndex) => {
      const firstPicks = levelVariants(planetIndex).map((levels) => {
        const session = botShoppingOn(planetIndex, levels)
        const layout = layoutOn(session)
        const expected = referencePicks(session, layout, levels)
        const bought = upgradesBought(session, layout).slice(0, PICKS_COMPARED)
        expect(expected.length).toBeGreaterThan(0)
        expect(bought).toEqual(expected)
        return bought[0]
      })
      expect(new Set(firstPicks).size).toBeGreaterThan(1)
    },
  )

  it.each(PLANETS)(
    'weighs blasting against drilling on planet %i as log space does',
    (planetIndex) => {
      const session = botShoppingOn(planetIndex, paceKeepingSteps(planetIndex))
      const calls = paramsVariants(layoutOn(session).params).flatMap((params) =>
        drillVariants(planetIndex).flatMap((levels) => {
          const stats = vehicleStatsAt(levels)
          return BANDS.flatMap((band) => {
            const trade = blastTradeOf(params, stats, band)
            if (trade === null) return []
            expect(isMoney(trade.drillMoneyPerTick) && isMoney(trade.blastMoneyPerTick)).toBe(true)
            expect(blastCallsOf(trade)).toEqual(referenceBlastCalls(params, stats, trade))
            return [blastCallsOf(trade)]
          })
        }),
      )
      expect(calls.some((call) => call.earnsMore)).toBe(true)
      expect(calls.some((call) => call.paysCharge && !call.earnsMore)).toBe(true)
      expect(calls.some((call) => !call.paysCharge)).toBe(true)
    },
  )
})
