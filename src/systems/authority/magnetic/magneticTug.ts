/**
 * A field's tug on the rig (GD lock on spec #258 Q2, ticket 290). Inside a field the rig is pulled
 * toward the field's ferrous vein at `tugSpeedAt` the planet: 10% of the on-curve engine's top
 * speed, under the #233 motion cap. The tug never pulls the rig into lava, a gated cell or an open
 * drop: when a tile it leans into is one of those, it lets go. The fixed step asks on the local
 * replica (`scene/vehicleLoop.ts`) and the motion rule moves the wheels' target by the tug's share
 * along the ground (`vehicleMotion.ts`), so the pose the authority hears already carries it.
 *
 * The tug is a read of the rig's tile: from the tile's centre toward the vein's. Fields come from
 * the planet seed and the danger tiles from the world every player shares, so each machine tugs a
 * rig on a tile the same way (#258 Q8).
 *
 * While the drill cuts, a shielded drill (`shockShields`, the dielectric bit, #258 Q6) feels no
 * tug; outside a cut the field tugs a shielded rig as any other, which is the lining's job.
 */
import { gateOfTile } from '../cellGates'
import { tugSpeedAt } from '../../economy/magneticHazard'
import { magneticFieldHolding, type MagneticField } from '../../registries/magneticGround'
import { isDrillShielded } from '../../registries/shockShields'
import type { Vector2 } from '../../vehicle/localFrame'
import { isVehicleActive } from '../../vehicle/vehicleState'
import { isLavaAt } from '../../world/lavaFlow'
import type { PlanetParams } from '../../world/planetParams'
import { halfTileDistanceSq, type TilePoint } from '../../world/tileGrid'
import { isAirCell } from '../../world/worldCell'
import { cellAt } from '../../world/worldState'
import { vehicleOf, type AuthorityState } from '../authorityState'
import { planetParamsOf } from '../planetOfState'

const SIDE_STEPS: readonly TilePoint[] = [
  { tx: 1, ty: 0 },
  { tx: -1, ty: 0 },
  { tx: 0, ty: 1 },
  { tx: 0, ty: -1 },
]

/** The tug on the player's rig standing on `tile`, in m/s, or null when none pulls. */
export function magneticTugAt(
  state: AuthorityState,
  playerId: string,
  tile: TilePoint,
): Vector2 | null {
  const params = planetParamsOf(state.planet)
  if (params === null || !isVehicleActive(vehicleOf(state, playerId))) return null
  const pull = fieldPullAt(params, tile)
  if (pull === null) return null
  return leansIntoDanger(state, playerId, params, tile, pull) ? null : pull
}

/** The tug on the player's rig while its drill cuts on `tile`: none on a shielded drill. */
export function magneticTugOnCutAt(
  state: AuthorityState,
  playerId: string,
  tile: TilePoint,
): Vector2 | null {
  return isDrillShielded(state, playerId) ? null : magneticTugAt(state, playerId, tile)
}

/** The pull toward the vein of the field holding `tile`; null outside one or on its vein. */
function fieldPullAt(params: PlanetParams, tile: TilePoint): Vector2 | null {
  const field = magneticFieldHolding(params, tile)
  return field === null ? null : pullToward(field, tile, tugSpeedAt(params.planetIndex))
}

function pullToward(field: MagneticField, tile: TilePoint, speed: number): Vector2 | null {
  const gap = { x: field.vein.tx - tile.tx, y: field.vein.ty - tile.ty }
  const length = Math.sqrt(gap.x * gap.x + gap.y * gap.y)
  if (length === 0) return null
  return { x: (gap.x / length) * speed, y: (gap.y / length) * speed }
}

/** Whether a tile beside the rig's, on the side the pull leans to, is no place to end in. */
function leansIntoDanger(
  state: AuthorityState,
  playerId: string,
  params: PlanetParams,
  tile: TilePoint,
  pull: Vector2,
): boolean {
  return tilesLeanedIntoOf(tile, pull).some((next) => isDangerTile(state, playerId, params, next))
}

/** The side, the row and the diagonal the pull leans into; a component of 0 leans nowhere. */
function tilesLeanedIntoOf(tile: TilePoint, pull: Vector2): TilePoint[] {
  const dx = Math.sign(pull.x)
  const dy = Math.sign(pull.y)
  const steps = [
    { tx: dx, ty: 0 },
    { tx: 0, ty: dy },
    { tx: dx, ty: dy },
  ].filter((step) => step.tx !== 0 || step.ty !== 0)
  return steps.map((step) => ({ tx: tile.tx + step.tx, ty: tile.ty + step.ty }))
}

function isDangerTile(
  state: AuthorityState,
  playerId: string,
  params: PlanetParams,
  tile: TilePoint,
): boolean {
  return (
    isLavaAt(state.world, params, tile) ||
    isGatedTile(state, playerId, params, tile) ||
    isOpenDrop(state, params, tile)
  )
}

/** An ore cell a gate would not let this player's drill cut. */
function isGatedTile(
  state: AuthorityState,
  playerId: string,
  params: PlanetParams,
  tile: TilePoint,
): boolean {
  const gated = gateOfTile({ state, playerId, params, blast: null }, tile)
  return gated !== null && gated.verdict.outcome !== 'cut'
}

/** Open ground with open ground beneath it, toward the planet's centre: the rig would fall. */
function isOpenDrop(state: AuthorityState, params: PlanetParams, tile: TilePoint): boolean {
  const isOpen = (at: TilePoint) => isAirCell(cellAt(state.world, params, at))
  return isOpen(tile) && isOpen(beneathOf(tile))
}

/** The side neighbour nearest the planet's centre. */
function beneathOf(tile: TilePoint): TilePoint {
  return SIDE_STEPS.map((step) => ({ tx: tile.tx + step.tx, ty: tile.ty + step.ty })).reduce(
    (lowest, next) =>
      halfTileDistanceSq(next.tx, next.ty) < halfTileDistanceSq(lowest.tx, lowest.ty)
        ? next
        : lowest,
  )
}
