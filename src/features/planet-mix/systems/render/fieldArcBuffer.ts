/**
 * The field lines' one vertex buffer (GD ruling on #293 Q1 and the TD addendum): allocated once at
 * the layer's cap, never per tick or per frame. The arcs are picked from the streamed look-ahead
 * window, the whole chunks the view circle at the widest zoom touches round the rig now and where
 * its speed carries it in 2 s (#316's scope), nearest the rig first; they are picked again only
 * when that window moves to other chunks or the planet changes, so at 16 m/s the buffer is
 * rewritten about once every two seconds, not every tick.
 */
import { VIEW_HALF_DIAGONAL_MAX_M } from '../../../../constants/scene'
import type { MetrePoint } from '../../../../systems/render/gunLook'
import type { PlanetParams } from '../../../../systems/world/planetParams'
import { CHUNK_SIZE, chunkOfTile, firstTileOfChunk } from '../../../../systems/world/tileGrid'
import { magneticFieldsInBox, type TileBox } from '../magneticFields'
import { FIELD_ARC_CAP } from './fieldArcBudget'
import { fieldArcsNearest, leftNormalOf, type FieldArc } from './fieldArcs'
import { MAGNETIC_LOOKS, type FieldLineLook } from './magneticLooks'

/** The look-ahead the ruling takes from #316: where the rig's speed carries it in this long. */
export const FIELD_ARC_LOOKAHEAD_SECONDS = 2

/** Chunks past the rig's own that the widest view reaches from anywhere in it. */
const VIEW_REACH_CHUNKS = Math.ceil(VIEW_HALF_DIAGONAL_MAX_M / CHUNK_SIZE)

/** Where the rig is drawn and how fast it moves, metres and metres a second. */
export interface FieldArcPose extends MetrePoint {
  vx: number
  vy: number
}

export interface FieldArcBuffer {
  /** x, y, z of both ends of each segment, arc after arc, `segmentsPerArc` segments an arc. */
  readonly positions: Float32Array
  /** Metres along its arc and the share of the arc (0 to 1), per vertex. */
  readonly dash: Float32Array
  readonly segmentsPerArc: number
  /** Arcs written, from the first; the rest of the buffer is stale. */
  arcCount: number
  /** The window the arcs were picked from. */
  readonly window: TileBox
  /** Scratch: the window this frame asks for. */
  readonly asked: TileBox
  /** The planet the arcs were picked on; null before the first pick. */
  params: PlanetParams | null
  /** How many times the arcs were picked, for the bench and the specs. */
  picks: number
}

export function createFieldArcBuffer(
  look: FieldLineLook = MAGNETIC_LOOKS.fieldLines,
): FieldArcBuffer {
  const vertices = FIELD_ARC_CAP * look.segmentsPerArc * 2
  return {
    positions: new Float32Array(vertices * 3),
    dash: new Float32Array(vertices * 2),
    segmentsPerArc: look.segmentsPerArc,
    arcCount: 0,
    window: { x0: 0, y0: 0, x1: -1, y1: -1 },
    asked: { x0: 0, y0: 0, x1: -1, y1: -1 },
    params: null,
    picks: 0,
  }
}

/** Picks the arcs again when the window moved or the planet changed; whether it rewrote them. */
export function refreshFieldArcs(
  buffer: FieldArcBuffer,
  params: PlanetParams,
  pose: FieldArcPose,
): boolean {
  writeLookaheadWindow(pose, buffer.asked)
  if (!isNewWindow(buffer, params)) return false
  adoptAskedWindow(buffer, params)
  writeArcs(
    buffer,
    fieldArcsNearest(magneticFieldsInBox(params, buffer.window), pose, FIELD_ARC_CAP),
  )
  return true
}

/**
 * The window into `out`: the rig's chunk and every chunk the widest view round it can reach, run
 * on along each axis by the chunks 2 s of speed covers. It is anchored on the rig's chunk, so it
 * moves whole as the rig crosses into another; the run ahead is rounded, so a rig at rest or
 * barely moving never flickers it.
 */
export function writeLookaheadWindow(pose: FieldArcPose, out: TileBox): TileBox {
  const cx = chunkOfTile(Math.floor(pose.x))
  const cy = chunkOfTile(Math.floor(pose.y))
  const aheadX = chunksAheadOf(pose.vx)
  const aheadY = chunksAheadOf(pose.vy)
  out.x0 = firstTileOfChunk(cx - VIEW_REACH_CHUNKS + Math.min(0, aheadX))
  out.y0 = firstTileOfChunk(cy - VIEW_REACH_CHUNKS + Math.min(0, aheadY))
  out.x1 = firstTileOfChunk(cx + VIEW_REACH_CHUNKS + Math.max(0, aheadX) + 1) - 1
  out.y1 = firstTileOfChunk(cy + VIEW_REACH_CHUNKS + Math.max(0, aheadY) + 1) - 1
  return out
}

function chunksAheadOf(metresPerSecond: number): number {
  return Math.round((metresPerSecond * FIELD_ARC_LOOKAHEAD_SECONDS) / CHUNK_SIZE)
}

function isNewWindow(buffer: FieldArcBuffer, params: PlanetParams): boolean {
  const { window, asked } = buffer
  return (
    buffer.params !== params ||
    window.x0 !== asked.x0 ||
    window.y0 !== asked.y0 ||
    window.x1 !== asked.x1 ||
    window.y1 !== asked.y1
  )
}

function adoptAskedWindow(buffer: FieldArcBuffer, params: PlanetParams): void {
  Object.assign(buffer.window, buffer.asked)
  buffer.params = params
  buffer.picks += 1
}

function writeArcs(buffer: FieldArcBuffer, arcs: readonly FieldArc[]): void {
  arcs.forEach((arc, at) => writeArc(buffer, arc, at))
  buffer.arcCount = arcs.length
}

/** The arc as a quadratic curve whose middle passes `bendM` off the straight way. */
function writeArc(buffer: FieldArcBuffer, arc: FieldArc, at: number): void {
  const segments = buffer.segmentsPerArc
  const normal = leftNormalOf(arc)
  const control = {
    x: (arc.from.x + arc.to.x) / 2 + normal.x * 2 * arc.bendM,
    y: (arc.from.y + arc.to.y) / 2 + normal.y * 2 * arc.bendM,
  }
  let alongM = 0
  for (let segment = 0; segment < segments; segment++) {
    const first = (at * segments + segment) * 2
    writeCurveVertex(buffer, first, arc, control, segment / segments)
    writeCurveVertex(buffer, first + 1, arc, control, (segment + 1) / segments)
    buffer.dash[first * 2] = alongM
    alongM += segmentLengthAt(buffer, first)
    buffer.dash[first * 2 + 2] = alongM
  }
}

/** The vertex's place on the curve and its share of the arc; its metres along come after. */
function writeCurveVertex(
  buffer: FieldArcBuffer,
  vertex: number,
  arc: FieldArc,
  control: MetrePoint,
  share: number,
): void {
  buffer.positions[vertex * 3] = curvePoint(arc.from.x, control.x, arc.to.x, share)
  buffer.positions[vertex * 3 + 1] = curvePoint(arc.from.y, control.y, arc.to.y, share)
  buffer.positions[vertex * 3 + 2] = 0
  buffer.dash[vertex * 2 + 1] = share
}

/** The straight length of the segment whose two vertices start at `first`. */
function segmentLengthAt(buffer: FieldArcBuffer, first: number): number {
  return Math.hypot(
    buffer.positions[first * 3 + 3] - buffer.positions[first * 3],
    buffer.positions[first * 3 + 4] - buffer.positions[first * 3 + 1],
  )
}

function curvePoint(from: number, control: number, to: number, share: number): number {
  const rest = 1 - share
  return rest * rest * from + 2 * rest * share * control + share * share * to
}
