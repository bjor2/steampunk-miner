/**
 * The swept span's chunks-touched budget (ticket 335, `SWEPT_SPAN_CHUNKS_PER_TICK`), measured: the
 * chunks one tick's span crosses at a given step, at its worst placement, a diagonal through a
 * chunk corner, and the rig's top cutting step, its stats-derived bound through its planet's
 * softest rock (ticket 334). Only the lane and specs ask it; the authority never trims a cut by it.
 */
import { MM_PER_METRE, UP_VECTOR_SCALE } from '../../constants/physics'
import { drillStampRadiusMm } from '../vehicle/drillBore'
import { stepBoundsOf } from '../vehicle/stepBound'
import { CHUNK_SIZE } from '../world/tileGrid'
import type { DiscStamp } from '../world/stampShape'
import { spanRunsOf } from '../world/sweptSpan'
import { vehicleOf, type AuthorityState } from './authorityState'
import { planetParamsOf } from './planetOfState'

/** The planet-1 chunk corner the worst-case spans start beside: (32, 256) m. */
const CORNER_MM = { xMm: CHUNK_SIZE * 1000, yMm: 8 * CHUNK_SIZE * 1000 }
/** Placements: along each axis and both diagonals, as `UP_VECTOR_SCALE`-scaled unit vectors. */
const HEADINGS = [
  { x: UP_VECTOR_SCALE, y: 0 },
  { x: 0, y: -UP_VECTOR_SCALE },
  { x: 724, y: -724 },
  { x: -724, y: -724 },
]

/** The chunks a stamp's span crosses. */
export function chunksTouchedBySpan(disc: DiscStamp): number {
  return new Set(spanRunsOf(disc).map(({ cx, cy }) => `${cx},${cy}`)).size
}

/** The most chunks one tick's span of `stepMm` crosses, the bare stamp at its worst placement. */
export function worstSpanChunksAtStep(stepMm: number): number {
  return Math.max(
    ...HEADINGS.map((heading) => chunksTouchedBySpan(spanFromCorner(heading, stepMm))),
  )
}

/** A bare-stamp span of `stepMm` along `heading` from the corner. */
function spanFromCorner(heading: { x: number; y: number }, stepMm: number): DiscStamp {
  const along = (component: number) => Math.floor((component * stepMm) / UP_VECTOR_SCALE)
  return {
    xMm: CORNER_MM.xMm + along(heading.x),
    yMm: CORNER_MM.yMm + along(heading.y),
    radiusMm: drillStampRadiusMm(),
    floorRadiusMm: null,
    tail: CORNER_MM,
  }
}

/** The rig's cutting step bound through its planet's band-1 rock: its top speed while it cuts. */
export function topCuttingStepMmAt(state: AuthorityState, playerId: string): number {
  const params = planetParamsOf(state.planet)
  const vehicle = vehicleOf(state, playerId)
  if (params === null || vehicle.pose === null) return 0
  const surfaceYMm = params.radiusTiles * MM_PER_METRE - MM_PER_METRE / 2
  const atSurface = { ...vehicle, pose: { ...vehicle.pose, x: 0, y: surfaceYMm } }
  return stepBoundsOf(atSurface, params).cuttingMm
}
