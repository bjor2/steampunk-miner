/**
 * What else a blast does (docs/standards/feature-slices.md 3.7): slices register effects that run
 * after the kernel's own blast, in id order, each on the state the one before left. Presentation
 * (VFX, audio) listens to domain events and never registers here. Every field is an integer.
 */
import type { AuthorityState } from '../authority/authorityState'
import { chainEffects, type RuleEffect } from '../authority/commandRule'
import type { PlanetParams } from '../world/planetParams'
import { defineRegistry, entriesOf } from './seal'

export interface BlastEvent {
  tx: number
  ty: number
  radiusMm: number
  /**
   * The rung on the dynamite ladder (#153, numbers on #143), 1 to 10; `radiusMm` is that rung's
   * radius. The shipped charge is size 1.
   */
  size: number
  playerId: string
  /** What blew: `charge` for the shipped blasting charges. */
  source: string
  tick: number
}

export interface BlastEffect {
  id: string
  apply(state: AuthorityState, blast: BlastEvent, params: PlanetParams): RuleEffect
}

export const BLAST_EFFECT_REGISTRY = defineRegistry<BlastEffect>('blastEffects')

/** Every effect in id order; with none registered, the state unchanged and no events. */
export function applyBlastEffects(
  state: AuthorityState,
  blast: BlastEvent,
  params: PlanetParams,
): RuleEffect {
  return chainEffects(
    state,
    entriesOf(BLAST_EFFECT_REGISTRY).map(
      (effect) => (current: AuthorityState) => effect.apply(current, blast, params),
    ),
  )
}
