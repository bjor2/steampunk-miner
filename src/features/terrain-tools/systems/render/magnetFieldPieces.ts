/**
 * The outlines of a magnet field in planet metres (GD lock on #246 build 5): each piece a handful
 * of straight segments, each end with its share along the piece, so the sweep runs along it.
 *
 * - attract: `attract.arcs` brass arcs from the gather's rim, curling in onto the beacon (share 0
 *   on the rim, 1 on the beacon, so the sweep converges);
 * - repel: a ring at the wave's radius, and `repel.flares` arcs flaring out across it;
 * - anchor: a crossed square over each pinned cell (the lattice) and over each braced collapse
 *   block (its strut).
 *
 * A piece never holds more than the look's `segmentsPerPiece` segments.
 */
import { COLLAPSE_BLOCK_SAMPLES } from '../../../../constants/balance'
import { MM_PER_METRE } from '../../../../constants/physics'
import type { MetrePoint } from '../../../../systems/render/gunLook'
import { firstSampleOfBlock, type CollapseBlock } from '../../../../systems/world/collapseBlock'
import { MM_PER_SAMPLE } from '../../../../systems/world/sampleGrid'
import type { TilePoint } from '../../../../systems/world/tileGrid'
import { MAGNET_FIELD_LOOK, type MagnetFieldLook } from './magnetFieldLook'
import type { AnchorField, MagnetField, RoundField } from './magnetFields'

export interface FieldSegment {
  from: MetrePoint
  to: MetrePoint
  /** How far along the piece each end is, 0 to 1. */
  fromShare: number
  toShare: number
}

export type FieldPiece = readonly FieldSegment[]

const BLOCK_M = (COLLAPSE_BLOCK_SAMPLES * MM_PER_SAMPLE) / MM_PER_METRE
const SAMPLE_M = MM_PER_SAMPLE / MM_PER_METRE
const TURN = 2 * Math.PI

export function piecesOfMagnetField(
  field: MagnetField,
  look: MagnetFieldLook = MAGNET_FIELD_LOOK,
): FieldPiece[] {
  if (field.kind === 'anchor') return latticeOf(field, look)
  if (field.kind === 'attract') return convergingArcsOf(field, look)
  return [ringOf(field, look), ...flaresOf(field, look)]
}

function convergingArcsOf(field: RoundField, look: MagnetFieldLook): FieldPiece[] {
  const { arcs, bendShare } = look.attract
  return Array.from({ length: arcs }, (_, arc) => {
    const rim = pointAround(field.centre, field.radiusM, (arc / arcs) * TURN)
    return bentArcOf(rim, field.centre, bendShare * field.radiusM, look.segmentsPerPiece)
  })
}

function ringOf(field: RoundField, look: MagnetFieldLook): FieldPiece {
  const segments = look.segmentsPerPiece
  return Array.from({ length: segments }, (_, at) => ({
    from: pointAround(field.centre, field.radiusM, (at / segments) * TURN),
    to: pointAround(field.centre, field.radiusM, ((at + 1) / segments) * TURN),
    fromShare: at / segments,
    toShare: (at + 1) / segments,
  }))
}

/** Each flare starts inside the ring and flares out past it, half a step round from the next. */
function flaresOf(field: RoundField, look: MagnetFieldLook): FieldPiece[] {
  const { flares, flareInnerShare, flareOuterShare, flareBendShare } = look.repel
  return Array.from({ length: flares }, (_, flare) => {
    const angle = ((flare + 1 / 2) / flares) * TURN
    const inner = pointAround(field.centre, field.radiusM * flareInnerShare, angle)
    const outer = pointAround(field.centre, field.radiusM * flareOuterShare, angle)
    return bentArcOf(inner, outer, flareBendShare * field.radiusM, look.segmentsPerPiece)
  })
}

function latticeOf(field: AnchorField, look: MagnetFieldLook): FieldPiece[] {
  const inset = look.anchor
  return [
    ...field.cells.map((cell) => crossedSquareOf(cellCornerOf(cell), 1, inset.cellInsetM)),
    ...field.blocks.map((block) =>
      crossedSquareOf(blockCornerOf(block), BLOCK_M, inset.blockInsetM),
    ),
  ]
}

function cellCornerOf(cell: TilePoint): MetrePoint {
  return { x: cell.tx, y: cell.ty }
}

function blockCornerOf(block: CollapseBlock): MetrePoint {
  const { sx, sy } = firstSampleOfBlock(block)
  return { x: sx * SAMPLE_M, y: sy * SAMPLE_M }
}

/** A square of `sizeM` from its lower-left `corner`, drawn `insetM` in, its two diagonals across. */
function crossedSquareOf(corner: MetrePoint, sizeM: number, insetM: number): FieldPiece {
  const low = { x: corner.x + insetM, y: corner.y + insetM }
  const high = { x: corner.x + sizeM - insetM, y: corner.y + sizeM - insetM }
  const corners = [low, { x: high.x, y: low.y }, high, { x: low.x, y: high.y }]
  const strokes: readonly [MetrePoint, MetrePoint][] = [
    [corners[0], corners[1]],
    [corners[1], corners[2]],
    [corners[2], corners[3]],
    [corners[3], corners[0]],
    [corners[0], corners[2]],
    [corners[1], corners[3]],
  ]
  return strokes.map(([from, to], at) => ({
    from,
    to,
    fromShare: at / strokes.length,
    toShare: (at + 1) / strokes.length,
  }))
}

/** A quadratic curve from `from` to `to` bowing `bendM` to its left at its middle. */
function bentArcOf(from: MetrePoint, to: MetrePoint, bendM: number, segments: number): FieldPiece {
  const control = controlPointOf(from, to, bendM)
  return Array.from({ length: segments }, (_, at) => ({
    from: curvePointOf(from, control, to, at / segments),
    to: curvePointOf(from, control, to, (at + 1) / segments),
    fromShare: at / segments,
    toShare: (at + 1) / segments,
  }))
}

/** The control point that puts the curve's middle `bendM` off the straight way. */
function controlPointOf(from: MetrePoint, to: MetrePoint, bendM: number): MetrePoint {
  const length = Math.hypot(to.x - from.x, to.y - from.y) || 1
  const normal = { x: -(to.y - from.y) / length, y: (to.x - from.x) / length }
  return {
    x: (from.x + to.x) / 2 + normal.x * 2 * bendM,
    y: (from.y + to.y) / 2 + normal.y * 2 * bendM,
  }
}

function curvePointOf(from: MetrePoint, control: MetrePoint, to: MetrePoint, share: number) {
  const rest = 1 - share
  return {
    x: rest * rest * from.x + 2 * rest * share * control.x + share * share * to.x,
    y: rest * rest * from.y + 2 * rest * share * control.y + share * share * to.y,
  }
}

function pointAround(centre: MetrePoint, radiusM: number, angle: number): MetrePoint {
  return { x: centre.x + Math.cos(angle) * radiusM, y: centre.y + Math.sin(angle) * radiusM }
}
