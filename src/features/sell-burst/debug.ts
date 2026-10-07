/**
 * Read-only, so no command and no log line (docs/standards/feature-slices.md 3.14): the running
 * burst as a browser spec reads it, never pixels, and a haul script the spec plays itself. `shown` is what the bay's money counter shows
 * now for the authority wallet, `wallet` that wallet; both canonical.
 */
import type { DebugAction } from '../../debug/debugActionRegistry'
import { readAuthorityState } from '../../store/authorityLink'
import { useGameStore } from '../../store/gameStore'
import { toCanonical } from '../../systems/money'
import { haulPlanProblems, haulScriptOf, type HaulPlan } from './debugHaul'
import { useSellBurstStore } from './store/sellBurstStore'
import { landingCoinsOf, type BurstWave } from './systems/burstWave'
import { landedCoinsAt, shownMoneyOf } from './systems/counterRoll'
import { liningBilledOf } from './systems/liningTag'
import type { SellBurst } from './systems/sellBurst'

export const sellBurstDebugActions: Readonly<Record<string, DebugAction>> = {
  /** A `fastForward` script that mines the haul and docks at the Exchange; changes nothing. */
  haulScript: (legs) => {
    const problems = haulPlanProblems(legs)
    if (problems.length > 0) return { ok: false, problems }
    return { ok: true, ...haulScriptOf(legs as HaulPlan, readAuthorityState().tick + 1) }
  },
  getBurst: () => {
    const { burst, shownTick, tagPhase } = useSellBurstStore.getState()
    const wallet = readAuthorityState().players[useGameStore.getState().playerId].wallet
    return {
      ok: true,
      isRunning: burst !== null,
      ...countsOf(burst),
      landed: burst === null ? 0 : landedCoinsAt(burst, shownTick),
      isFlare: burst !== null && burst.flareStartTick !== null,
      endTick: burst?.endTick ?? null,
      tagPhase,
      liningBilled: burst === null ? null : toCanonical(liningBilledOf(burst)),
      shown: toCanonical(shownMoneyOf(wallet, burst, shownTick)),
      wallet: toCanonical(wallet),
      tick: readAuthorityState().tick,
    }
  },
}

/** The burst's waves, coins (peeled and landing) and chunks, summed over its waves. */
function countsOf(burst: SellBurst | null) {
  const waves = burst?.waves ?? []
  const sumOf = (count: (wave: BurstWave) => number) =>
    waves.reduce((total, wave) => total + count(wave), 0)
  return {
    waves: waves.length,
    coins: sumOf((wave) => wave.coins),
    peeled: sumOf((wave) => wave.peel),
    landing: sumOf(landingCoinsOf),
    chunks: sumOf((wave) => wave.chunks.length),
  }
}
