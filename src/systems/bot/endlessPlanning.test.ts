import { describe, expect, it } from 'vitest'
import { blastTilesAround } from '../authority/charges/blastOre'
import { createAuthorityState } from '../authority/authorityState'
import { dockSiteOfPlanet } from '../authority/planetOfState'
import { blastReachTiles, chargeFuseTicks, restockPrice } from '../economy/blastingCharges'
import { ECONOMY } from '../economy/economy'
import type { UpgradeId } from '../economy/economyDefinition'
import { oreSalePrice, oreTier } from '../economy/oreEconomy'
import { upgradePrice } from '../economy/upgradePrices'
import {
  onCurveLevels,
  vehicleStatsAt,
  type UpgradeLevels,
  type VehicleStats,
} from '../economy/vehicleStats'
import { cmp, fromSafeInteger, isMoney, mul, toCanonical, ZERO_MONEY, type Money } from '../money'
import { quantaOfUnits } from '../vehicle/energyQuanta'
import type { PlanetParams } from '../world/planetParams'
import { blastTradeOf, type BlastTrade } from './blastTrade'
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
const MARGINAL_TRACKS: readonly UpgradeId[] = ['drill_power', 'engine', 'boiler', 'cargo_hold']
const PICKS_COMPARED = 8
/** Enough money for every compared pick of any track, with the service kept back. */
const WALLET_PRICES = 1000
const TOP_CASING_GRADE = 5
const BANDS = [1, 2, 3, 4, 5]
const TANK_SHARES = [1, 0.6, 0.3]
const DRILL_LEVELS_BEHIND = [0, 6, 9, 12]
const BASIS_POINTS = 10000

/** log10 of a positive amount from its canonical text: no double ever holds the amount. */
function log10Of(amount: Money): number {
  const [mantissa, exponent] = toCanonical(amount).split('e')
  return Math.log10(Number.parseFloat(mantissa)) + Number.parseInt(exponent, 10)
}

/** log10(10^a - 10^b) for a > b. */
function log10Difference(a: number, b: number): number {
  return b === Number.NEGATIVE_INFINITY ? a : a + Math.log10(1 - 10 ** (b - a))
}

/** The on-curve vehicle with each marginal track in turn 4 levels behind, so each can lead. */
function levelVariants(planetIndex: number): UpgradeLevels[] {
  const onCurve = onCurveLevels(planetIndex)
  return [onCurve, ...MARGINAL_TRACKS.map((track) => ({ ...onCurve, [track]: onCurve[track] - 4 }))]
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
  const prices = MARGINAL_TRACKS.map((track) => upgradePrice(track, levels[track], planetIndex))
  const dearest = prices.reduce((most, price) => (cmp(price, most) > 0 ? price : most))
  return toCanonical(mul(dearest, fromSafeInteger(WALLET_PRICES)))
}

function upgradesBought(session: BotSession, layout: MineLayout): string[] {
  const before = session.commands().length
  buyUpgrades(session, { layout, isCoreTheGoal: false, gunPolicy: 'never', hasMetBlastTile: false })
  return session
    .commands()
    .slice(before)
    .flatMap((command) => (command.type === 'buyUpgrade' ? [command.payload.upgradeId] : []))
}

function plannedLog(layout: MineLayout, levels: UpgradeLevels): number {
  const plan = bestOrePlan(layout, fullTankMeans(levels))
  return plan === null ? Number.NEGATIVE_INFINITY : log10Of(plan.moneyPerTick)
}

/** The reference: the best gain in planned money per tick per price, ranked by its log10. */
function referencePick(
  layout: MineLayout,
  levels: UpgradeLevels,
  planetIndex: number,
): UpgradeId | null {
  const now = plannedLog(layout, levels)
  let best: { track: UpgradeId; logGainPerPrice: number } | null = null
  for (const track of MARGINAL_TRACKS.filter((t) => isUnderLeadCap(levels, t, planetIndex))) {
    const next = plannedLog(layout, { ...levels, [track]: levels[track] + 1 })
    if (next <= now) continue
    const price = upgradePrice(track, levels[track], planetIndex)
    const logGainPerPrice = log10Difference(next, now) - log10Of(price)
    if (best === null || logGainPerPrice > best.logGainPerPrice) best = { track, logGainPerPrice }
  }
  return best?.track ?? null
}

function referencePicks(layout: MineLayout, start: UpgradeLevels, planetIndex: number) {
  const picks: UpgradeId[] = []
  let levels = start
  for (let pick = 0; pick < PICKS_COMPARED; pick += 1) {
    const track = referencePick(layout, levels, planetIndex)
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
    Math.log10(blastTilesAround({ tx: 0, ty: 0 }).length) +
    log10Of(ECONOMY.blastingCharges.oreYieldFraction) +
    tileLog
  const chargeLog = log10Of(restockPrice(1, params.planetIndex))
  if (keptLog <= chargeLog) return { paysCharge: false, earnsMore: false }
  const cycleTicks = chargeFuseTicks() + 2 * moveTicks(blastReachTiles(), stats.engine.speedMax)
  const blastLog = log10Difference(keptLog, chargeLog) - Math.log10(cycleTicks)
  return { paysCharge: true, earnsMore: blastLog > tileLog - Math.log10(trade.drillTicksPerTile) }
}

/** The planet as generated, and a synthetic one with ore in every tile, where blasts can pay. */
function paramsVariants(params: PlanetParams): PlanetParams[] {
  return [params, { ...params, oreDensityBp: BANDS.map(() => BASIS_POINTS) }]
}

/** The on-curve drill and drills further behind it, down to where band 3 is out of reach. */
function drillVariants(planetIndex: number): UpgradeLevels[] {
  const onCurve = onCurveLevels(planetIndex)
  return DRILL_LEVELS_BEHIND.map((behind) => ({
    ...onCurve,
    drill_power: onCurve.drill_power - behind,
    drill_tip: onCurve.drill_tip - behind,
  }))
}

describe('bot: planning past planet 582 (#196)', () => {
  it.each(PLANETS)('picks the ore band log space picks on planet %i', (planetIndex) => {
    const session = botShoppingOn(planetIndex, onCurveLevels(planetIndex))
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
        const expected = referencePicks(layout, levels, planetIndex)
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
      const session = botShoppingOn(planetIndex, onCurveLevels(planetIndex))
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
