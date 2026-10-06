/**
 * A tunnel wrecker's gnaw (spec #111, Technical Director's storage): every sample of one casing
 * ring holding lining at grade 1 to 15 becomes breached, keeping its lining type (`CASING_BREACHED`
 * for standard lining, the type at grade 0 for another, #113). Never-lined rock (0) and lining
 * already breached are left as they are, so a gnaw is idempotent and never makes a tunnel safer.
 * Density and material stay as they were: breaching changes only the casing layer, which the chunk
 * digest already hashes.
 */
import { breachedValueOf, isIntactLining } from './chunkDelta'
import { ringSamplesOf, type CasingRing } from './casingLining'
import {
  casingGradeOf,
  closeSession,
  markSampleCasing,
  openSession,
  type GroundEdit,
} from './groundEditSession'
import type { PlanetParams } from './planetParams'
import type { WeightedSample } from './stampShape'
import { chunkOfSample, localSampleOf, sampleIndexOf } from './sampleGrid'
import { currentCasingOfChunk, type WorldState } from './worldState'

export interface Breach extends GroundEdit {
  /** The samples this gnaw breached, in row order; none when the ring held no intact lining. */
  breachedSamples: readonly WeightedSample[]
}

export function breachRing(world: WorldState, params: PlanetParams, ring: CasingRing): Breach {
  const session = openSession(world, params)
  const intact = ringSamplesOf(ring).filter((sample) =>
    isIntactLining(casingGradeOf(session, sample)),
  )
  intact.forEach((sample) =>
    markSampleCasing(session, sample, breachedValueOf(casingGradeOf(session, sample))),
  )
  return { ...closeSession(session), breachedSamples: intact }
}

/** Whether the ring still holds lining a gnaw would breach; reads the layer, copies nothing. */
export function hasIntactLining(world: WorldState, ring: CasingRing): boolean {
  return ringSamplesOf(ring).some(({ sx, sy }) => isIntactLining(casingOfSample(world, sx, sy)))
}

function casingOfSample(world: WorldState, sx: number, sy: number): number {
  const casing = currentCasingOfChunk(world, chunkOfSample(sx), chunkOfSample(sy))
  return casing[sampleIndexOf(localSampleOf(sx), localSampleOf(sy))]
}
