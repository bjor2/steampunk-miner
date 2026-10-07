/**
 * The `Lining −X` tag left of the money counter (G&V on #176): it shows only when a sale paid a
 * lining bill, from the end of the hang, when the peeled coins leave the stream. A second sale
 * within the merge window adds its X, so the tag shows one summed figure. It holds 96 ticks after
 * the last peeled coin lands, then fades over 12.
 */
import { add, ZERO_MONEY, type Money } from '../../../systems/money'
import { BURST_TIMING } from './burstTiming'
import type { SellBurst } from './sellBurst'

export type LiningTagPhase = 'hidden' | 'shown' | 'fading'

export function liningTagPhaseAt(
  burst: SellBurst | null,
  tick: number,
  timing = BURST_TIMING,
): LiningTagPhase {
  if (burst === null) return 'hidden'
  const { tagStartTick: start, tagFadeTick: fade } = burst
  if (start === null || fade === null || tick < start) return 'hidden'
  if (tick < fade) return 'shown'
  return tick < fade + timing.lining.liningTagFadeTicks ? 'fading' : 'hidden'
}

/** The bills the burst's sales paid, summed: the X the tag reads. */
export function liningBilledOf(burst: SellBurst): Money {
  return burst.waves.reduce((total, wave) => add(total, wave.liningPaid), ZERO_MONEY)
}
