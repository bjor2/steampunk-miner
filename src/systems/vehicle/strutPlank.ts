/**
 * Where a bore strut's plank lies (ticket 379, Content's strut bore on #310): a ledge across the
 * mouth a strut-bore line broke into a hollow through, at right angles to the planet's local up at
 * the mouth, centred on the edge between the mouth cell and the hollow's cell, its top on the mouth
 * cell's floor. From a bore going down that edge is the mouth's floor, so the plank closes the
 * hole; from a level bore it is the mouth's side, so half the plank sticks into the hollow as a
 * ledge. Planet metres; the client's physics alone reads it (`physics/strutColliders.ts`).
 */
import { STRUT_PLANK_LENGTH, STRUT_PLANK_THICKNESS } from '../../constants/physics'
import { dot, localUpOf, tangentOf, type Vector2 } from './localFrame'

/** The two cells a strut spans: the mouth it stands in and the hollow's cell beyond. */
export interface StrutSpan {
  tx: number
  ty: number
  pocketTx: number
  pocketTy: number
}

export interface StrutPlank {
  centre: Vector2
  /** Unit, along the plank: the mouth's local horizontal. */
  along: Vector2
  /** Unit, the mouth's local up. */
  up: Vector2
  halfLength: number
  halfThickness: number
}

const HALF_TILE = 0.5
/** Below 1 m from the centre the mouth has no up of its own; any will do there. */
const UP_AT_CENTRE: Vector2 = { x: 0, y: 1 }

export function strutPlankOf(span: StrutSpan): StrutPlank {
  const mouth = cellCentreOf(span.tx, span.ty)
  const pocket = cellCentreOf(span.pocketTx, span.pocketTy)
  const up = localUpOf(mouth, UP_AT_CENTRE)
  const edge = { x: (mouth.x + pocket.x) / 2, y: (mouth.y + pocket.y) / 2 }
  const halfThickness = STRUT_PLANK_THICKNESS / 2
  const drop = dot(mouth, up) - HALF_TILE - dot(edge, up) - halfThickness
  return {
    centre: { x: edge.x + up.x * drop, y: edge.y + up.y * drop },
    along: tangentOf(up),
    up,
    halfLength: STRUT_PLANK_LENGTH / 2,
    halfThickness,
  }
}

/** Whether the point lies within the plank: what a rig's ground probe stands on. */
export function isPointOnPlank(plank: StrutPlank, point: Vector2): boolean {
  const offset = { x: point.x - plank.centre.x, y: point.y - plank.centre.y }
  const isAlong = Math.abs(dot(offset, plank.along)) <= plank.halfLength
  return isAlong && Math.abs(dot(offset, plank.up)) <= plank.halfThickness
}

function cellCentreOf(tx: number, ty: number): Vector2 {
  return { x: tx + HALF_TILE, y: ty + HALF_TILE }
}
