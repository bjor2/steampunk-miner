/**
 * The beats of a chain (#180 section 2, G&V's stops and moments): which moment a landed step
 * plays, and which cadence ends a chain. Every stop ends on a cue, never an error.
 *
 * - A pip gets its quick reaction. An ordinary major inside a live chain gets the compressed
 *   36-tick moment; a click, or a chain that ended on its major, gets the full moment; a
 *   milestone always gets the full moment and its card.
 * - Release and focus leaving end on the "ka-chunk"; money short on the soft empty-wallet clunk
 *   (the price flashes red once); the reserve on the "keeping X for service" line; a track cap on
 *   the MAX stamp.
 */
import type { RejectionReason } from '../../../systems/authority/domainEvent'
import { isChainLive, type HoldChain, type StepLanding } from './holdChain'

export type StepMoment = 'pip' | 'compressed' | 'full' | 'milestone'

export type ChainStopCue = 'ka_chunk' | 'empty_clunk' | 'reserve_hold' | 'max_stamp' | 'milestone'

/** The refusals with a cue of their own; any other refusal ends on the plain cadence. */
const REFUSAL_CUES: Readonly<Record<string, ChainStopCue>> = {
  money_short: 'empty_clunk',
  service_reserve: 'reserve_hold',
  max_level: 'max_stamp',
}

/** The moment a step plays, given the chain as it stands after the step landed. */
export function momentOf(landing: StepLanding, chainAfter: HoldChain): StepMoment {
  if (landing !== 'major') return landing
  return isChainLive(chainAfter) ? 'compressed' : 'full'
}

/** The cue that ends this chain; null while it is live. */
export function stopCueOf(chain: HoldChain): ChainStopCue | null {
  if (chain.end === null) return null
  if (chain.end === 'milestone') return 'milestone'
  if (chain.end === 'refused') return refusalCueOf(chain.refusal)
  return 'ka_chunk'
}

function refusalCueOf(reason: RejectionReason | null): ChainStopCue {
  return (reason !== null && REFUSAL_CUES[reason]) || 'ka_chunk'
}
