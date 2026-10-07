/**
 * The mobility items' motion (ticket 233's `vehicleMotionEffects`, the GD lock on #204 Q1 a): one
 * source per effect, each read from the player's `mobility` section, folded by the kernel under
 * its +2000 bp cap. The fixed step asks on the local replica once per step.
 *
 * - The grapple's reel hauls the miner to the open tile beside its hook.
 * - The steam boost and the escape thruster are bursts; the thruster stops at the first solid
 *   cell above the miner.
 * - A dropped ballast states the lift and drive a lighter miner gains: mass ×0.6 is ×1/0.6 of
 *   thrust-to-weight, which the kernel caps.
 * - While switched on in a slot (the toggles `power-up-core` draws energy for), the grav anchor
 *   clings to the wall or ceiling a side touches, so the miner can drill while anchored, and the
 *   buoyancy tanks hover in open air. Switched off, the normal fall rules take over.
 */
import { BASIS_POINTS } from '../../../constants/balance'
import { vehicleOf, type AuthorityState } from '../../../systems/authority/authorityState'
import { planetParamsOf } from '../../../systems/authority/planetOfState'
import type {
  VehicleMotionEffect,
  VehicleMotionEffectSource,
} from '../../../systems/registries/vehicleMotionEffects'
import { FACING, noseTileOf, type VehiclePose } from '../../../systems/vehicle/vehiclePose'
import { isSolidCell } from '../../../systems/world/worldCell'
import { cellAt } from '../../../systems/world/worldState'
import { slotHoldingItem } from '../../../systems/vehicle/loadoutState'
import { isItemToggledOn } from '../../power-up-core'
import { MOBILITY_ITEM } from './itemIds'
import { MOBILITY_ECONOMY } from './mobilityEconomy'
import { mobilityOf, type BurstWindow } from './mobilitySection'

export const REEL_MOTION: VehicleMotionEffectSource = {
  id: 'mobility.grapple-reel',
  effectOf: (state, playerId, tick) => {
    const reel = mobilityOf(state, playerId).reel
    if (reel === null || tick >= reel.untilTick) return null
    return { reelTo: { tx: reel.tx, ty: reel.ty } }
  },
}

export const BOOST_MOTION: VehicleMotionEffectSource = {
  id: 'mobility.steam-boost',
  effectOf: (state, playerId, tick) => burstEffectOf(mobilityOf(state, playerId).boost, tick),
}

export const ESCAPE_MOTION: VehicleMotionEffectSource = {
  id: 'mobility.escape-thruster',
  effectOf: (state, playerId, tick) => {
    const escape = mobilityOf(state, playerId).escape
    if (escape === null || isSolidAboveMiner(state, playerId)) return null
    return burstEffectOf(escape, tick)
  },
}

export const BALLAST_MOTION: VehicleMotionEffectSource = {
  id: 'mobility.emergency-ballast',
  effectOf: (state, playerId, tick) => {
    if (tick >= mobilityOf(state, playerId).ballastUntilTick) return null
    const gainBp = ballastGainBp()
    return { liftBp: gainBp, driveBp: gainBp }
  },
}

export const ANCHOR_MOTION: VehicleMotionEffectSource = {
  id: 'mobility.grav-anchor',
  effectOf: (state, playerId) =>
    isSlottedToggleOn(state, playerId, MOBILITY_ITEM.gravAnchor) ? { cling: true } : null,
}

export const BUOYANCY_MOTION: VehicleMotionEffectSource = {
  id: 'mobility.buoyancy-tanks',
  effectOf: (state, playerId) =>
    isSlottedToggleOn(state, playerId, MOBILITY_ITEM.buoyancyTanks) ? { hover: true } : null,
}

/** What a lighter miner gains: thrust-to-weight grows as `1 / massShare`. */
export function ballastGainBp(massShareBp: number = MOBILITY_ECONOMY.ballast.massShareBp): number {
  return Math.floor((BASIS_POINTS * BASIS_POINTS) / massShareBp) - BASIS_POINTS
}

function burstEffectOf(burst: BurstWindow | null, tick: number): VehicleMotionEffect | null {
  if (burst === null || tick >= burst.untilTick) return null
  const { dirX, dirY, speedMmPerS, untilTick } = burst
  return { burst: { dirX, dirY, speedMmPerS, untilTick } }
}

function isSlottedToggleOn(state: AuthorityState, playerId: string, itemId: string): boolean {
  const loadout = vehicleOf(state, playerId).loadout
  return slotHoldingItem(loadout, itemId) !== null && isItemToggledOn(state, playerId, itemId)
}

/** The tile one up from the miner's centre is solid: the roof the thruster thumps into. */
export function isSolidAboveMiner(state: AuthorityState, playerId: string): boolean {
  const pose = vehicleOf(state, playerId).pose
  const params = planetParamsOf(state.planet)
  if (pose === null || params === null) return true
  return isSolidCell(cellAt(state.world, params, tileAbove(pose)))
}

function tileAbove(pose: VehiclePose) {
  return noseTileOf({ ...pose, facing: FACING.up })
}
