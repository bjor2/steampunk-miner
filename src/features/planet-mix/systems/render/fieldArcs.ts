/**
 * The field lines a magnetic planet draws (GD lock on spec #258 Q1 "On screen": blue field lines,
 * faint dashed arcs bending between ferrous veins; GD ruling on #293 Q1). Each vein is a magnet:
 * its lines leave one pole and bow round to the other on both sides, the pole axis turned by the
 * vein's own hash. Two veins whose fields touch are also joined, a line bowing to each side of the
 * span between them. Pure: the same fields give the same arcs in any order of streaming, so every
 * player of a session sees the same lines. Render-only; nothing reaches the authority.
 */
import { cellRandomFloat } from '../../../../systems/cellRandom'
import type { MetrePoint } from '../../../../systems/render/gunLook'
import type { MagneticField } from '../magneticFields'
import { MAGNETIC_LOOKS, type FieldLineLook } from './magneticLooks'

/** A line from one point to another, its middle pushed `bendM` to the left of the way. */
export interface FieldArc {
  from: MetrePoint
  to: MetrePoint
  bendM: number
}

const HALF_TILE_M = 1 / 2
const HALF_TURN = Math.PI

/** The arcs of the fields, nearest `centre` first, at most `cap`. */
export function fieldArcsNearest(
  fields: readonly MagneticField[],
  centre: MetrePoint,
  cap: number,
  look: FieldLineLook = MAGNETIC_LOOKS.fieldLines,
): FieldArc[] {
  return [...fields.flatMap((field) => lobeArcsOf(field, look)), ...pairArcsOf(fields, look)]
    .map((arc) => ({ arc, distanceSq: distanceSq(apexOf(arc), centre) }))
    .sort((a, b) => a.distanceSq - b.distanceSq)
    .slice(0, cap)
    .map(({ arc }) => arc)
}

/** Where the arc's middle lies, `bendM` off the straight way between its ends. */
export function apexOf(arc: FieldArc): MetrePoint {
  const { x: nx, y: ny } = leftNormalOf(arc)
  return {
    x: (arc.from.x + arc.to.x) / 2 + nx * arc.bendM,
    y: (arc.from.y + arc.to.y) / 2 + ny * arc.bendM,
  }
}

/** The unit vector to the left of the way from `from` to `to`; up for a zero-length arc. */
export function leftNormalOf(arc: FieldArc): MetrePoint {
  const dx = arc.to.x - arc.from.x
  const dy = arc.to.y - arc.from.y
  const length = Math.hypot(dx, dy)
  return length === 0 ? { x: 0, y: 1 } : { x: -dy / length, y: dx / length }
}

/** The vein's lines: pole to pole, each bend on both sides. */
function lobeArcsOf(field: MagneticField, look: FieldLineLook): FieldArc[] {
  const centre = veinCentreOf(field)
  const angle = poleAngleOf(field)
  const reach = field.radiusTiles * look.lobeReachShare
  const from = { x: centre.x + Math.cos(angle) * reach, y: centre.y + Math.sin(angle) * reach }
  const to = { x: centre.x - Math.cos(angle) * reach, y: centre.y - Math.sin(angle) * reach }
  return look.lobeBendShares.flatMap((share) => [
    { from, to, bendM: share * field.radiusTiles },
    { from, to, bendM: -share * field.radiusTiles },
  ])
}

/** A line bowing each way between every two veins whose fields touch. */
function pairArcsOf(fields: readonly MagneticField[], look: FieldLineLook): FieldArc[] {
  return fields.flatMap((field, at) =>
    fields
      .slice(at + 1)
      .filter((other) => doFieldsTouch(field, other))
      .flatMap((other) => joiningArcsOf(field, other, look)),
  )
}

/** The pair's lines, always from the lower vein (then the left one), whatever order they came in. */
function joiningArcsOf(field: MagneticField, other: MagneticField, look: FieldLineLook) {
  const [first, second] = isVeinBefore(field, other) ? [field, other] : [other, field]
  const from = veinCentreOf(first)
  const to = veinCentreOf(second)
  const bendM = Math.hypot(to.x - from.x, to.y - from.y) * look.pairBendShare
  return [
    { from, to, bendM },
    { from, to, bendM: -bendM },
  ]
}

function isVeinBefore(field: MagneticField, other: MagneticField): boolean {
  if (field.vein.ty !== other.vein.ty) return field.vein.ty < other.vein.ty
  return field.vein.tx < other.vein.tx
}

function doFieldsTouch(field: MagneticField, other: MagneticField): boolean {
  const reach = field.radiusTiles + other.radiusTiles
  const dx = field.vein.tx - other.vein.tx
  const dy = field.vein.ty - other.vein.ty
  const spanSq = dx * dx + dy * dy
  return spanSq > 0 && spanSq <= reach * reach
}

function veinCentreOf(field: MagneticField): MetrePoint {
  return { x: field.vein.tx + HALF_TILE_M, y: field.vein.ty + HALF_TILE_M }
}

/** The pole axis's angle, half a turn of choice, from the vein's own cell hash. */
function poleAngleOf(field: MagneticField): number {
  return cellRandomFloat(field.band, field.vein.tx, field.vein.ty) * HALF_TURN
}

function distanceSq(a: MetrePoint, b: MetrePoint): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return dx * dx + dy * dy
}
