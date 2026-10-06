/**
 * One casing ring gnawed (spec #111, Technical Director's storage on #94): the ring round an axis
 * point the drill laid is breached (`breachRing`), and the authority says so per chunk with
 * `CasingBreached {chunk, samples, enemyId}` for replication, then once per ring with `RingGnawed
 * {ring, band}` for the log, `band` being the deepest band of the breached wall (#76's wall band).
 * A ring with no intact lining left changes nothing and says nothing. Lava resting near the ring
 * comes loose again, as the lining that kept it out is breached (#113).
 *
 * The tunnel wrecker gnaws as itself; `debug.gnawCasing` gnaws with no enemy (`enemyId` null), so
 * scenarios and specs can breach a stretch without waiting on a wrecker.
 */
import type { RingPoint } from '../vehicle/casingTrail'
import { breachRing, type Breach } from '../world/casingBreach'
import { casingBandOfWall } from '../world/casingBand'
import { casingRingAround } from '../world/casingLining'
import type { PlanetParams } from '../world/planetParams'
import { chunkOfSample } from '../world/sampleGrid'
import { chunkKey } from '../world/tileGrid'
import type { AuthorityState } from './authorityState'
import { unchanged, type RuleEffect } from './commandRule'
import type { DomainEventBody } from './domainEvent'
import { groundChangedEventsOf } from './groundChangedEvents'
import { wakeLavaNear } from './lava/lavaRules'

export function gnawCasingRing(
  state: AuthorityState,
  params: PlanetParams,
  point: RingPoint,
  enemyId: string | null,
): RuleEffect {
  const breach = breachRing(state.world, params, casingRingAround(point.xMm, point.yMm))
  if (breach.breachedSamples.length === 0) return unchanged(state)
  return {
    state: wakeLavaNear({ ...state, world: breach.world }, params, point, state.world),
    events: [
      ...groundChangedEventsOf(breach),
      ...casingBreachedEventsOf(breach, enemyId),
      {
        type: 'RingGnawed',
        ring: ringIdOf(point),
        band: casingBandOfWall(params, breach.breachedSamples),
      },
    ],
  }
}

/** A ring is named by its axis point in mm: `x,y`. */
export function ringIdOf(point: RingPoint): string {
  return `${point.xMm},${point.yMm}`
}

/** One event per chunk the breach reached, in the order its samples were met. */
function casingBreachedEventsOf(breach: Breach, enemyId: string | null): DomainEventBody[] {
  const samplesByChunk = new Map<string, number>()
  for (const { sx, sy } of breach.breachedSamples) {
    const chunk = chunkKey(chunkOfSample(sx), chunkOfSample(sy))
    samplesByChunk.set(chunk, (samplesByChunk.get(chunk) ?? 0) + 1)
  }
  return [...samplesByChunk].map(([chunk, samples]) => ({
    type: 'CasingBreached',
    chunk,
    samples,
    enemyId,
  }))
}
