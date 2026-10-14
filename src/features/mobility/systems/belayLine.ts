/**
 * The Belay Line twist on the grapple winch (spec #162, "Artefact twists"; ticket 329 as 206c):
 * held, the hook stays planted. The shot bites as the grapple always does, but the winch does not
 * reel: the cable becomes a standing line, and while it stands the miner is caught when it falls,
 * or the floor collapses under it, within the grapple's reach of the hook. One line at a time:
 * firing again moves it. It clears nothing and changes no cell.
 *
 * The lane asks the kernel `twist` point (base 0, ceiling 1), so it never imports the artefact
 * slice. The line sits under the winch's own numbers: its reach is the shot's range at its Mark,
 * the shot spends the winch's charge, and the catch is a `hover` through `vehicleMotionEffects`,
 * which brakes the fall along the miner's up within the kernel's caps (ticket 233). Only a fall
 * faster than any cut down is caught, so drilling down under the line is never held up. The line
 * lets go at its window's end (`belay.windowTicks`), on another planet, or once its hook cell is
 * gone.
 */
import { MM_PER_METRE, UP_VECTOR_SCALE } from '../../../constants/physics'
import { vehicleOf, type AuthorityState } from '../../../systems/authority/authorityState'
import { planetParamsOf } from '../../../systems/authority/planetOfState'
import { scalarHookValueOf } from '../../../systems/registries/itemHooks'
import type {
  VehicleMotionEffect,
  VehicleMotionEffectSource,
} from '../../../systems/registries/vehicleMotionEffects'
import type { VehiclePose } from '../../../systems/vehicle/vehiclePose'
import { isLavaCell, isSolidCell } from '../../../systems/world/worldCell'
import { cellAt } from '../../../systems/world/worldState'
import type { PowerUpUse } from '../../power-up-core'
import type { GrappleHook } from './grappleHook'
import { MOBILITY_ITEM } from './itemIds'
import { MOBILITY_ECONOMY } from './mobilityEconomy'
import { mobilityOf, type BelayLine } from './mobilitySection'

const HALF_TILE_MM = MM_PER_METRE / 2
const CAUGHT: VehicleMotionEffect = Object.freeze({ hover: true })

export const BELAY_MOTION: VehicleMotionEffectSource = {
  id: 'mobility.belay-line',
  effectOf: (state, playerId, tick) => {
    const belay = mobilityOf(state, playerId).belay
    if (belay === undefined || tick >= belay.untilTick) return null
    return isCaughtByLine(state, playerId, belay) ? CAUGHT : null
  },
}

/** Whether the shooter holds the winch's twist: the kernel hook answers 1, or nothing. */
export function isGrappleTwisted(
  state: AuthorityState,
  use: PowerUpUse,
  rangeTiles: number,
): boolean {
  const twist = scalarHookValueOf(state, use.playerId, {
    point: 'twist',
    parentItemId: MOBILITY_ITEM.grappleWinch,
    ctx: {
      tick: use.tick,
      mark: use.mark,
      magnitude: rangeTiles,
      origin: use.origin,
      candidates: [],
    },
    base: 0,
    ceiling: 1,
  })
  return twist > 0
}

/** The standing line a twisted shot plants at `hook`, catching within the shot's range. */
export function belayLineOf(
  state: AuthorityState,
  use: PowerUpUse,
  hook: GrappleHook,
  rangeTiles: number,
): BelayLine {
  return {
    hookTx: hook.hook.tx,
    hookTy: hook.hook.ty,
    planetIndex: state.planet.index,
    reachTiles: rangeTiles,
    untilTick: use.tick + MOBILITY_ECONOMY.belay.windowTicks,
  }
}

/** The line holds, the miner hangs within its reach, and it is falling: the line catches it. */
export function isCaughtByLine(state: AuthorityState, playerId: string, belay: BelayLine): boolean {
  const pose = vehicleOf(state, playerId).pose
  if (pose === null) return false
  return isLineHolding(state, belay) && isWithinReach(pose, belay) && isFalling(pose)
}

/** Planted on this planet, in a cell that still bites: solid and not lava. */
function isLineHolding(state: AuthorityState, belay: BelayLine): boolean {
  if (belay.planetIndex !== state.planet.index) return false
  const params = planetParamsOf(state.planet)
  if (params === null) return false
  const cell = cellAt(state.world, params, { tx: belay.hookTx, ty: belay.hookTy })
  return isSolidCell(cell) && !isLavaCell(cell)
}

function isWithinReach(pose: VehiclePose, belay: BelayLine): boolean {
  const dx = belay.hookTx * MM_PER_METRE + HALF_TILE_MM - pose.x
  const dy = belay.hookTy * MM_PER_METRE + HALF_TILE_MM - pose.y
  const reachMm = belay.reachTiles * MM_PER_METRE
  return dx * dx + dy * dy <= reachMm * reachMm
}

/** Moving down the miner's own up faster than the catch speed. */
function isFalling(pose: VehiclePose): boolean {
  const upwardMmPerS = (pose.vx * pose.upx + pose.vy * pose.upy) / UP_VECTOR_SCALE
  return -upwardMmPerS > MOBILITY_ECONOMY.belay.catchSpeedMmPerS
}
