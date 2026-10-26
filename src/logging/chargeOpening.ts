/**
 * D6 #865's soft opening target for the dynamite rows: on planet 1 the median bot affords a
 * size-1 charge within its first 5 minutes for at most 5% of the money it holds. Each pacing seed
 * plays the bot scenario from planet 1 and its wallet is watched over the window; the first tick
 * at which one charge is 5% of the wallet or less is the seed's answer. Soft, never a gate: a miss
 * is tuned by `kDyn` first, then the size-1 base, then the cells exponent 0.85 -> 0.9 in data.
 * Only specs use it.
 */
import { TICKS_PER_SECOND } from '../constants/physics'
import type { CommandIntent } from '../systems/authority/authorityCommand'
import { createAuthorityState, type AuthorityState } from '../systems/authority/authorityState'
import { createBotSession } from '../systems/bot/botSession'
import { botPlanetOf } from '../systems/bot/botTravel'
import { playSliceFrom } from '../systems/bot/playSlice'
import { chargeUnitPrice } from '../systems/economy/chargeSizes'
import { cmp, fromSafeInteger, mul, toCanonical, type Money } from '../systems/money'
import { startOfScenario, validateScenario, type Scenario } from '../systems/scenario'
import { startScenarioCommands } from '../systems/startScenarioCommands'

export const CHARGE_OPENING_TARGET = {
  planet: 1,
  size: 1,
  windowTicks: 5 * 60 * TICKS_PER_SECOND,
  /** The wallet must hold this many charges for one to be 5% of it. */
  walletPerCharge: 20,
} as const

export interface ChargeOpeningRun {
  worldSeed: number
  /** The first tick in the window one charge was at most 5% of the wallet; null if never. */
  affordTick: number | null
  peakWallet: Money
}

const PLAYER_ID = 'p1'

export function chargeOpeningRunOf(scenario: Scenario, worldSeed: number): ChargeOpeningRun {
  const run: ChargeOpeningRun = { worldSeed, affordTick: null, peakWallet: fromSafeInteger(0) }
  const start = createAuthorityState({
    planetIndex: CHARGE_OPENING_TARGET.planet,
    planetSeed: worldSeed,
    playerIds: [PLAYER_ID],
  })
  const session = createBotSession(start, PLAYER_ID, {
    onCommand: () => undefined,
    onEvents: (state) => watchWallet(run, state),
  })
  scenarioStartOf(scenario).forEach((intent) => session.submit(intent))
  playSliceFrom(session, botPlanetOf(session, 'blast'), {
    lastPlanet: CHARGE_OPENING_TARGET.planet,
    maxTicks: CHARGE_OPENING_TARGET.windowTicks,
  })
  return run
}

/** One line per seed and the seeds' verdict, for the Tester to read beside k_dyn. */
export function chargeOpeningLinesOf(runs: readonly ChargeOpeningRun[]): string[] {
  const price = openingChargePrice()
  const held = runs.filter((run) => run.affordTick !== null).length
  return [
    `size-1 charge on planet 1: ${toCanonical(price)} (needs a wallet of ${toCanonical(walletBar())})`,
    ...runs.map(seedLineOf),
    `${held} of ${runs.length} seeds afford it inside 5 min at <= 5% of money held` +
      (held * 2 > runs.length ? '' : ': tune kDyn, then the size-1 base, then cells^0.9'),
  ]
}

function watchWallet(run: ChargeOpeningRun, state: AuthorityState): void {
  if (state.tick > CHARGE_OPENING_TARGET.windowTicks) return
  const wallet = state.players[PLAYER_ID].wallet
  if (cmp(wallet, run.peakWallet) > 0) run.peakWallet = wallet
  if (run.affordTick === null && cmp(wallet, walletBar()) >= 0) run.affordTick = state.tick
}

function seedLineOf(run: ChargeOpeningRun): string {
  const when = run.affordTick === null ? 'never' : `${run.affordTick / TICKS_PER_SECOND} s`
  return `  seed ${run.worldSeed}: peak wallet ${toCanonical(run.peakWallet)}, affords at ${when}`
}

function walletBar(): Money {
  return mul(openingChargePrice(), fromSafeInteger(CHARGE_OPENING_TARGET.walletPerCharge))
}

function openingChargePrice(): Money {
  return chargeUnitPrice(CHARGE_OPENING_TARGET.size, CHARGE_OPENING_TARGET.planet)
}

/** Refused, never trimmed: a broken scenario file. */
function scenarioStartOf(scenario: Scenario): CommandIntent[] {
  const problems = validateScenario(scenario)
  if (problems.length > 0)
    throw new Error(`charge opening scenario refused: ${problems.join('; ')}`)
  const { planetSeed: _sessionSeed, ...start } = startOfScenario(scenario)
  return startScenarioCommands(start)
}
