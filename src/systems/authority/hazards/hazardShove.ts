/**
 * A `shove` contact (ticket 848; steam vents, ticket 651; the GD lock on #823 Q1): the cut vent
 * scalds the hull for the row's share from the arc the vent lies in (`hazardHits.ts`), and blasts
 * the rig along the vent's normal, the one of the four directions pointing from the vent cell to
 * the rig's cell (outward from the planet when the rig stands in the vent), for up to the row's
 * `shoveTiles` over its `ticks` (20, a third of a second), both scaled by the contact's factor.
 *
 * - **Never into solid ground.** The shove walks open cells only (air at most half dense, the
 *   drill's own line for a removed cell) and stops before the first that is not, so a rig with
 *   ground behind it is scalded and stays put.
 * - **A glide, never a teleport.** The vehicle holds the shove as a glide (`motionGlide.ts`): the
 *   fixed step drives the body to the last open cell's centre by the tick the authority names, with
 *   input locked, on every machine alike (`vehicleMotionEffects.ts`). It never moves the drill tip
 *   off the body's front, and the drill rests while it runs.
 *
 * - **Aimed outward** (ticket 882, the Vent Vane; Systems' correction on #850, 6395074595). While a
 *   slice's shove aim answers for the player (`shoveAims.ts`), the shove goes outward from the core
 *   from the rig's cell instead of along the normal, at the size its factor left it: never longer
 *   than the bare shove, so it adds no speed.
 *
 * `HazardShoved` logs it as `hazard_shove`, with the cells shoved and where the rig comes to rest.
 */
import { scaledByFactor } from '../../registries/contactEffects'
import { isShoveAimedOutward } from '../../registries/shoveAims'
import type { MotionGlide } from '../../vehicle/motionGlide'
import { tileOfPose, type VehiclePose } from '../../vehicle/vehiclePose'
import { cellDensitySum, YIELD_SUM } from '../../world/cellYield'
import type { PlanetParams } from '../../world/planetParams'
import type { TilePoint } from '../../world/tileGrid'
import { isAirCell } from '../../world/worldCell'
import { cellAt, type WorldState } from '../../world/worldState'
import { vehicleOf, withVehicle, type AuthorityState } from '../authorityState'
import { chainEffects, type RuleEffect } from '../commandRule'
import type { CellContact } from './cellContact'
import { takeHazardHit, wreckIfHullGone } from './hazardHits'

interface VentShove {
  tiles: number
  to: TilePoint
  untilTick: number
}

export function shoveOnContact(
  state: AuthorityState,
  playerId: string,
  params: PlanetParams,
  { tile, row, factorBp }: CellContact<'shove'>,
): RuleEffect {
  const ask = {
    shareBp: scaledByFactor(row.hullShareBp, factorBp),
    diveHullCapBp: row.diveHullCapBp,
  }
  const scalded = takeHazardHit(state, playerId, params, tile, ask)
  const { pose } = vehicleOf(scalded.state, playerId)
  const aim = { vent: tile, isOutward: isShoveAimedOutward(state, playerId, row.kind) }
  const shove = ventShoveOf(scalded.state.world, params, pose, aim, {
    tiles: scaledByFactor(row.shoveTiles, factorBp),
    untilTick: scalded.state.tick + row.ticks,
  })
  const shoved = {
    type: 'HazardShoved' as const,
    kind: row.kind,
    ...tile,
    ...scalded.hit,
    tiles: shove.tiles,
    toTx: shove.to.tx,
    toTy: shove.to.ty,
    untilTick: shove.untilTick,
  }
  return chainEffects(withShove(scalded.state, playerId, shove), [
    (current) => ({ state: current, events: [shoved] }),
    (current) => wreckIfHullGone(current, playerId, row.kind),
  ])
}

/** Where a shove points: the vent's normal, or outward from the core under a shove aim. */
interface ShoveAimAt {
  vent: TilePoint
  isOutward: boolean
}

/** The open cells along the shove's direction from the rig, at most `reach.tiles`. */
function ventShoveOf(
  world: WorldState,
  params: PlanetParams,
  pose: VehiclePose | null,
  aim: ShoveAimAt,
  reach: { tiles: number; untilTick: number },
): VentShove {
  if (pose === null) return { tiles: 0, to: aim.vent, untilTick: reach.untilTick }
  const from = tileOfPose(pose)
  const step = aim.isOutward ? outwardOf(from) : ventNormalOf(aim.vent, from)
  let tiles = 0
  while (tiles < reach.tiles && isOpenTile(world, params, stepped(from, step, tiles + 1))) tiles++
  return { tiles, to: stepped(from, step, tiles), untilTick: reach.untilTick }
}

/** One of the four directions from the vent to the rig; outward when the rig is in the vent. */
function ventNormalOf(vent: TilePoint, rig: TilePoint): TilePoint {
  const dx = rig.tx - vent.tx
  const dy = rig.ty - vent.ty
  if (dx === 0 && dy === 0) return outwardOf(rig)
  return Math.abs(dx) >= Math.abs(dy) ? { tx: Math.sign(dx), ty: 0 } : { tx: 0, ty: Math.sign(dy) }
}

/** Away from the planet's centre, which lies between the four tiles round the origin. */
function outwardOf(tile: TilePoint): TilePoint {
  const x = 2 * tile.tx + 1
  const y = 2 * tile.ty + 1
  return Math.abs(x) >= Math.abs(y) ? { tx: Math.sign(x), ty: 0 } : { tx: 0, ty: Math.sign(y) }
}

function stepped(from: TilePoint, step: TilePoint, tiles: number): TilePoint {
  return { tx: from.tx + step.tx * tiles, ty: from.ty + step.ty * tiles }
}

/**
 * Air whose density is at most the yield's half of a full cell, the line at which the drill counts
 * a cell removed: a cut cell that rubble or a fill raised past it is ground again.
 */
export function isOpenTile(world: WorldState, params: PlanetParams, tile: TilePoint): boolean {
  return isAirCell(cellAt(world, params, tile)) && cellDensitySum(world, params, tile) <= YIELD_SUM
}

/** The vehicle holds a shove that moves it; one of no cells leaves it as it was. */
function withShove(state: AuthorityState, playerId: string, shove: VentShove): AuthorityState {
  if (shove.tiles === 0) return state
  const glide: MotionGlide = { to: shove.to, untilTick: shove.untilTick, passThrough: null }
  return withVehicle(state, playerId, { ...vehicleOf(state, playerId), hazardShove: glide })
}
