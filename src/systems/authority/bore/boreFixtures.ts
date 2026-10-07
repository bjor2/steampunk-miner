/**
 * What the bore gun specs share (ticket 313), on planet 1 of the scripted session's seed: a fake
 * slice that answers the #309 L1 numbers for every player (and any gate or drill-class probes a
 * spec needs), and two rig tiles in the cave-free band-1 rock of the collapse specs, each with
 * four solid cells east of it. The rig stands in a small pocket carved round its tile's centre,
 * enemies frozen, facing east, upright as at the top of the planet.
 */
import { MM_PER_METRE } from '../../../constants/physics'
import type { SliceDefinition } from '../../../registries/sliceDefinition'
import type { GateCheck, GateVerdict } from '../../registries/gateChecks'
import type { BoreGunStats } from '../../registries/boreGun'
import { FACING } from '../../vehicle/vehiclePose'
import type { TilePoint } from '../../world/tileGrid'
import type { CommandIntent } from '../authorityCommand'
import { poseOnTile } from '../charges/chargeFixtures'
import { FREEZE_ENEMIES, type ScriptedSession } from '../scriptedSession'

/** The #309 L1 gun: range 4, a cell every 2 ticks, 45 between shots, half the drill's power. */
export const BORE_STATS: BoreGunStats = {
  rangeCells: 4,
  openIntervalTicks: 2,
  cooldownTicks: 45,
  gunFactorBp: 5000,
  boreBudgetTicks: 1000,
  energyPerCellBp: 20000,
  collapseHoldTicks: 30,
}

/** Band-1 rock 20 m down (`BAND_1_Y`): four ground cells east of the rig, in two blocks. */
export const PLAIN_RIG: TilePoint = { tx: -30, ty: 280 }
/** The same row further east: two ground cells, then ore in the third and fourth. */
export const ORE_RIG: TilePoint = { tx: -22, ty: 280 }

/** The four cells east of a rig tile, in the order a level shot east opens them. */
export function lineEastOf(rig: TilePoint): TilePoint[] {
  return [1, 2, 3, 4].map((step) => ({ tx: rig.tx + step, ty: rig.ty }))
}

/** Bearing 255 is horizontal right: due east for an upright rig. */
export const FIRE_EAST: CommandIntent<'ground_gun.fire'> = {
  type: 'ground_gun.fire',
  payload: { bearing: 255 },
}

export function fireAt(bearing: number): CommandIntent<'ground_gun.fire'> {
  return { type: 'ground_gun.fire', payload: { bearing } }
}

/** A fake slice answering `stats` for every player, with any extra registrations a spec needs. */
export function boreGunSlice(
  stats: BoreGunStats = BORE_STATS,
  extra: (r: Parameters<SliceDefinition['register']>[0]) => void = () => {},
): SliceDefinition {
  return {
    id: 'probe',
    register(r) {
      r.boreGun({ id: 'probe.bore-gun', boreGunOf: () => stats })
      extra(r)
    },
  }
}

/** A gate that answers `outcome` for one tile and has no opinion elsewhere. */
export function gateOnTile(
  tile: TilePoint,
  outcome: GateVerdict['outcome'],
  gateKind: string,
): GateCheck {
  return {
    id: `probe.${gateKind}-gate`,
    check: (query) =>
      query.tile.tx === tile.tx && query.tile.ty === tile.ty
        ? { outcome, gateKind, required: 'more', have: 'less' }
        : null,
  }
}

/** Frozen enemies, a pocket round the rig tile's centre, and the rig standing in it facing east. */
export function standInPocket(session: ScriptedSession, rig: TilePoint, tick: number): void {
  const half = MM_PER_METRE / 2
  const centre = { x: rig.tx * MM_PER_METRE + half, y: rig.ty * MM_PER_METRE + half }
  session.submit(tick, FREEZE_ENEMIES)
  session.submit(tick, {
    type: 'debug.carveCircle',
    payload: { ...centre, radius: POCKET_RADIUS_MM, amount: 255 },
  })
  session.submit(tick, poseOnTile(rig, FACING.right))
}

/** Inside the rig's own tile, so every cell of the line starts solid. */
const POCKET_RADIUS_MM = 450
