/**
 * The pacing bot's marginal buy (#29 Systems & Economy note 3): among the open marginal tracks, the
 * one whose next steps add the most planned money per tick per price, while one pays, never
 * `drill_power` past its lead cap (`botCoreRule.ts`).
 *
 * Drill power is offered for the fewest next purchases, up to its lead cap, that raise the planned
 * money, priced together and paid for whole; the bot buys the first and weighs the offers again.
 * Before #552 that look-ahead ran to the next major. Since a drill level is one purchase, the
 * first purchase (x1.12^(1/18)) moves no whole-tick tile time on its own (40 ticks a band-1 tile
 * either way), so a one-purchase look-ahead never offered the drill until the tip changed the
 * plan. Behind ticket 553's boiler rule that took 18 minutes on planet 1. The hold and the engine are bought per purchase with no max level since ticket
 * 553, and an engine purchase below the drill's pace buys no travel speed, so each is offered for
 * the fewest next purchases, a bundle of at most 10, that raise the planned money by at least 0.2%
 * (Systems' marginal rule, section 3 of their rows on #553), priced together and paid for whole;
 * the bot buys the bundle's first purchase and weighs the offers again. The boiler has its own
 * rule (`botBoiler.ts`).
 */
import type { UpgradeId } from '../economy/economyDefinition'
import { stepPrice } from '../economy/upgradePrices'
import { stepsToNextLevel } from '../economy/upgradeSteps'
import type { UpgradeLevels } from '../economy/vehicleStats'
import { add, cmp, div, fromSafeInteger, mul, sub, ZERO_MONEY, type Money } from '../money'
import { isUnderLeadCap, leadCeiling } from './botCoreRule'
import type { BotSession } from './botSession'
import { canPayForBrass } from './botWallet'
import type { MineLayout } from './mineLayout'
import { bestOrePlan, fullTankMeans } from './tripEstimate'

const MARGINAL_TRACKS: readonly UpgradeId[] = ['drill_power', 'engine', 'cargo_hold']
const BUNDLE_TRACKS: readonly UpgradeId[] = ['engine', 'cargo_hold']

/** A bundle is at most 10 purchases and pays once it raises the planned money by 0.2% (553). */
const BUNDLE_MAX_PURCHASES = 10
const BUNDLE_GAIN_BP = 20
const BASIS_POINTS = 10000

/** An open track whose next steps raise the planned money per tick, and that gain per price. */
interface MarginalOffer {
  track: UpgradeId
  gainPerPrice: Money
}

/** The next steps on one track: their price together and the planned money they add. */
interface TrackBundle {
  price: Money
  gain: Money
}

export function bestMarginalPurchase(session: BotSession, layout: MineLayout): UpgradeId | null {
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

/** The best next buy on one track, or null: a hold or engine bundle, or drill power's purchases. */
function marginalOfferOf(
  session: BotSession,
  layout: MineLayout,
  now: Money,
  track: UpgradeId,
): MarginalOffer | null {
  if (BUNDLE_TRACKS.includes(track)) return bundleOfferOf(session, layout, now, track)
  return lookAheadOfferOf(session, layout, now, track)
}

/**
 * The fewest next steps, up to the lead cap, that raise the planned money; null if none pays.
 */
function lookAheadOfferOf(
  session: BotSession,
  layout: MineLayout,
  now: Money,
  track: UpgradeId,
): MarginalOffer | null {
  let price = ZERO_MONEY
  for (let steps = 1; steps <= stepsLookedAhead(session, track); steps++) {
    price = add(price, nextStepPrice(session, track, steps))
    const gain = gainOfSteps(session, layout, now, { track, steps })
    if (cmp(gain, ZERO_MONEY) > 0) return offerIfPaid(session, track, { price, gain })
  }
  return null
}

/**
 * The fewest next purchases, at most `BUNDLE_MAX_PURCHASES`, that raise the planned money by
 * `BUNDLE_GAIN_BP`, while the wallet pays for them: below the drill's pace a single engine
 * purchase plans no gain at all, and a hold past a band's ore none either.
 */
function bundleOfferOf(
  session: BotSession,
  layout: MineLayout,
  now: Money,
  track: UpgradeId,
): MarginalOffer | null {
  const enough = bundleGainOf(now)
  let price = ZERO_MONEY
  for (let steps = 1; steps <= BUNDLE_MAX_PURCHASES; steps++) {
    price = add(price, nextStepPrice(session, track, steps))
    if (!canPayForBrass(session, price)) return null
    const gain = gainOfSteps(session, layout, now, { track, steps })
    if (isBundleWorthIt(gain, enough)) return { track, gainPerPrice: div(gain, price) }
  }
  return null
}

/**
 * The steps left under the track's lead cap on this planet (#86); a track with no cap looks to
 * its next level.
 */
function stepsLookedAhead(session: BotSession, track: UpgradeId): number {
  const step = session.vehicle().levels[track]
  const ceiling = leadCeiling(track, session.state().planet.index)
  return ceiling === null ? stepsToNextLevel(track, step) : ceiling - step
}

/** 0.2% of the planned money per tick now. */
function bundleGainOf(now: Money): Money {
  return mul(now, div(fromSafeInteger(BUNDLE_GAIN_BP), fromSafeInteger(BASIS_POINTS)))
}

function isBundleWorthIt(gain: Money, enough: Money): boolean {
  return cmp(gain, ZERO_MONEY) > 0 && cmp(gain, enough) >= 0
}

/** The price of the `steps`th next step on a track, on the planet the bot is on. */
function nextStepPrice(session: BotSession, track: UpgradeId, steps: number): Money {
  const step = session.vehicle().levels[track] + steps - 1
  return stepPrice(track, step, session.state().planet.index)
}

/** The planned money per tick the next `steps` steps on `track` add. */
function gainOfSteps(
  session: BotSession,
  layout: MineLayout,
  now: Money,
  { track, steps }: { track: UpgradeId; steps: number },
): Money {
  const { levels } = session.vehicle()
  const after = { ...levels, [track]: levels[track] + steps }
  return sub(plannedMoneyPerTick(layout, after), now)
}

function offerIfPaid(
  session: BotSession,
  track: UpgradeId,
  bundle: TrackBundle,
): MarginalOffer | null {
  if (!canPayForBrass(session, bundle.price)) return null
  return { track, gainPerPrice: div(bundle.gain, bundle.price) }
}

/** On a tie the earlier track keeps it, in `MARGINAL_TRACKS` order. */
function betterOffer(best: MarginalOffer | null, offer: MarginalOffer): MarginalOffer {
  return best === null || cmp(offer.gainPerPrice, best.gainPerPrice) > 0 ? offer : best
}

/** The marginal tracks the bot has not capped on this planet. */
function openMarginalTracks(session: BotSession): UpgradeId[] {
  return MARGINAL_TRACKS.filter((track) =>
    isUnderLeadCap(session.vehicle().levels, track, session.state().planet.index),
  )
}

function plannedMoneyPerTick(layout: MineLayout, levels: UpgradeLevels): Money {
  return bestOrePlan(layout, fullTankMeans(levels))?.moneyPerTick ?? ZERO_MONEY
}
