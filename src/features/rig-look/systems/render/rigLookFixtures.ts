/**
 * Band blocks and finishes for the rig look specs (ticket 809): a made-up track's bands every
 * `step` purchases, its edges the step's multiples, two finishes that differ from any step colour
 * the specs use. Specs only; the shipped rows are `rigLook.json`'s.
 */
import type { RigLookFinishes } from './rigLookFrames'
import type { RigLookBand } from './rigLookIndex'

export const FIXTURE_FINISHES: RigLookFinishes = {
  'spec-brass': { name: 'Spec brass', colour: '#fffff1', metalness: 0.9, roughness: 0.3 },
  'spec-steel': { name: 'Spec steel', colour: '#fffff2', metalness: 0.8, roughness: 0.4 },
}

/** Bands of `step`, `edges` of them, a decade every `decadeStep`, the two fixture finishes. */
export function bandEvery(step: number, edges: number, decadeStep = step): RigLookBand {
  return {
    decadeStep,
    twoPlanetBuys: step,
    step,
    edges: Array.from({ length: edges }, (_, at) => (at + 1) * step),
    finishes: Object.keys(FIXTURE_FINISHES),
  }
}
