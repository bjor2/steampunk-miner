/**
 * Slice effects on the vehicle's motion (ticket 233, the GD lock on #204 Q1 a): a grapple's reel,
 * a steam boost or escape thruster's burst, ballast, a grav anchor's cling and buoyancy's hover.
 * Each source reads its own section of the authority state; the fixed step asks once per step on
 * the local replica (`scene/vehicleLoop.ts`) and the physics motor applies the fold
 * (`motionEffects.ts`), with the boosts capped at `itemEffectCaps.motionBoostCapBp`. With
 * nothing registered the answer is `PLAIN_MOTION` and the vehicle drives as it did.
 *
 * The kernel adds its own beside them (ticket 848): an acting tool's trade-off on the engine's
 * lift or drive (`toolTradeOffs.ts`). With no tool acting it adds nothing.
 */
import { vehicleOf, type AuthorityState } from '../authority/authorityState'
import { ECONOMY } from '../economy/economy'
import {
  foldMotionEffects,
  type VehicleMotion,
  type VehicleMotionEffect,
} from '../vehicle/motionEffects'
import { defineRegistry, entriesOf } from './seal'
import { tradeOffMotionEffectsOf } from './toolTradeOffs'

export type { MotionBurst, VehicleMotion, VehicleMotionEffect } from '../vehicle/motionEffects'
export type { MotionGlide } from '../vehicle/motionGlide'

export interface VehicleMotionEffectSource {
  id: string
  /** The effect on `playerId`'s vehicle at `tick`, or null when none runs. */
  effectOf(state: AuthorityState, playerId: string, tick: number): VehicleMotionEffect | null
}

export const VEHICLE_MOTION_EFFECT_REGISTRY =
  defineRegistry<VehicleMotionEffectSource>('vehicleMotionEffects')

/** Every registered effect on the player's vehicle at `tick`, folded under the caps. */
export function vehicleMotionAt(
  state: AuthorityState,
  playerId: string,
  tick: number,
): VehicleMotion {
  const effects = [...sliceEffectsOn(state, playerId, tick), ...kernelEffectsOn(state, playerId)]
  return foldMotionEffects(effects, tick, ECONOMY.itemEffectCaps.motionBoostCapBp)
}

function sliceEffectsOn(
  state: AuthorityState,
  playerId: string,
  tick: number,
): VehicleMotionEffect[] {
  return entriesOf(VEHICLE_MOTION_EFFECT_REGISTRY)
    .map((source) => source.effectOf(state, playerId, tick))
    .filter((effect): effect is VehicleMotionEffect => effect !== null)
}

function kernelEffectsOn(state: AuthorityState, playerId: string): VehicleMotionEffect[] {
  if (!Object.hasOwn(state.players, playerId)) return []
  return tradeOffMotionEffectsOf(vehicleOf(state, playerId))
}
